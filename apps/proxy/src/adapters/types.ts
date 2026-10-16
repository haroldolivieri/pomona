import type { ScanRequest, ScanResponse } from "@pomona/contract";
import type { PromptConfig } from "../prompts";
import { verifyAndResolveScanResponse } from "../verifier/verify-response";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function normalizeTokenUsage(rawUsage: unknown): TokenUsage {
  if (!rawUsage || typeof rawUsage !== "object") {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  const u = rawUsage as Record<string, unknown>;
  const promptTokens =
    typeof u.promptTokens === "number"
      ? u.promptTokens
      : typeof u.inputTokens === "number"
      ? u.inputTokens
      : 0;
  const completionTokens =
    typeof u.completionTokens === "number"
      ? u.completionTokens
      : typeof u.outputTokens === "number"
      ? u.outputTokens
      : 0;
  const totalTokens =
    typeof u.totalTokens === "number"
      ? u.totalTokens
      : promptTokens + completionTokens;

  return { promptTokens, completionTokens, totalTokens };
}

export interface AdapterInput {
  systemPrompt: string;
  userPrompt: string;
  imageBase64: string;
  imageMimeType: "image/webp" | "image/jpeg";
  repairErrors?: string[];
}

export interface AdapterRawResult {
  object: unknown;
  usage: TokenUsage;
}

export interface VisionProviderAdapter {
  readonly providerId: string;
  readonly modelId: string;
  analyzeProduce(input: AdapterInput, signal?: AbortSignal): Promise<AdapterRawResult>;
}

export async function runVerifiedVisionScan(
  request: ScanRequest,
  adapter: VisionProviderAdapter,
  promptConfig: PromptConfig,
  signal?: AbortSignal
): Promise<{
  response: ScanResponse;
  usage: TokenUsage;
  attempts: number;
}> {
  const totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const addUsage = (rawUsage?: Partial<TokenUsage>) => {
    const p = rawUsage?.promptTokens ?? 0;
    const c = rawUsage?.completionTokens ?? 0;
    const t = rawUsage?.totalTokens ?? (p + c);
    totalUsage.promptTokens += p;
    totalUsage.completionTokens += c;
    totalUsage.totalTokens += t;
  };

  const systemPrompt = promptConfig.buildSystemPrompt(request);
  const initialUserPrompt = promptConfig.buildUserPrompt(request);

  let repairErrors: string[] | null = null;

  function isRateLimitError(err: unknown): boolean {
    const e = err as any;
    return (
      e?.statusCode === 429 ||
      e?.status === 429 ||
      String(e?.message || "").includes("429") ||
      String(e?.message || "").toLowerCase().includes("resource has been exhausted")
    );
  }

  // Attempt 1: Initial model inference
  try {
    const raw1 = await adapter.analyzeProduce(
      {
        systemPrompt,
        userPrompt: initialUserPrompt,
        imageBase64: request.imageBase64,
        imageMimeType: request.imageMimeType,
      },
      signal
    );
    addUsage(raw1.usage);

    const verify1 = verifyAndResolveScanResponse(raw1.object, {
      request,
      promptVersion: promptConfig.version,
      modelId: adapter.modelId,
    });

    if (verify1.ok) {
      return {
        response: verify1.response,
        usage: totalUsage,
        attempts: 1,
      };
    }

    repairErrors = verify1.errors;
  } catch (err) {
    if (isRateLimitError(err)) {
      throw err;
    }
    repairErrors = [err instanceof Error ? err.message : String(err)];
  }

  // Attempt 2: 1-retry repair pipeline feeding specific verifier errors back to model
  const repairPrompt = promptConfig.buildRepairPrompt
    ? promptConfig.buildRepairPrompt(request, repairErrors)
    : promptConfig.buildUserPrompt(request, repairErrors);

  try {
    const raw2 = await adapter.analyzeProduce(
      {
        systemPrompt,
        userPrompt: repairPrompt,
        imageBase64: request.imageBase64,
        imageMimeType: request.imageMimeType,
        repairErrors,
      },
      signal
    );
    addUsage(raw2.usage);

    const verify2 = verifyAndResolveScanResponse(raw2.object, {
      request,
      promptVersion: promptConfig.version,
      modelId: adapter.modelId,
    });

    if (verify2.ok) {
      return {
        response: verify2.response,
        usage: totalUsage,
        attempts: 2,
      };
    }
  } catch (err) {
    if (isRateLimitError(err)) {
      throw err;
    }
    // Repair attempt failed, proceed to fallback
  }

  // Clean fallback when both attempts fail
  const fallbackResponse: ScanResponse = {
    schemaVersion: "1.0",
    promptVersion: promptConfig.version,
    modelId: adapter.modelId,
    round: request.round,
    status: "analysis_failed",
    message: "Analysis failed to produce a valid verified result.",
    produce: null,
    candidates: [],
    verdict: null,
    followUp: null,
    afterPurchase: null,
  };

  return {
    response: fallbackResponse,
    usage: totalUsage,
    attempts: 2,
  };
}
