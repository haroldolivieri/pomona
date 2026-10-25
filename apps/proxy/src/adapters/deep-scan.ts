import { getPromptConfig } from "../prompts";
import { verifyAndResolveDeepScanResponse } from "../verifier/verify-deep-scan";
import { traceStage, traceResponse, logScanResponse, type ScanTracing } from "../observability/scan-trace";
import type {
  AdapterInput,
  AdapterRawResult,
  ModelTrace,
  TokenUsage,
  VisionProviderAdapter,
} from "./types";
import type { DeepScanRequest, DeepScanResponse } from "@pomona/contract";

export interface DeepScanRunResult {
  response: DeepScanResponse;
  usage: TokenUsage;
  attempts: number;
}

export async function runVerifiedDeepScan(
  request: DeepScanRequest,
  adapter: VisionProviderAdapter,
  promptVersion: string,
  signal?: AbortSignal,
  requestId: string = crypto.randomUUID(),
  tracing?: ScanTracing,
): Promise<DeepScanRunResult> {
  const promptConfig = getPromptConfig(promptVersion);
  if (promptConfig.version !== promptVersion) {
    throw new Error(`unknown deep-scan promptVersion: ${promptVersion}`);
  }

  const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const addUsage = (rawUsage?: Partial<TokenUsage>) => {
    const p = rawUsage?.promptTokens ?? 0;
    const c = rawUsage?.completionTokens ?? 0;
    totalUsage.promptTokens += p;
    totalUsage.completionTokens += c;
    totalUsage.totalTokens += rawUsage?.totalTokens ?? p + c;
  };

  async function analyzeAttempt(prompt: string, attempt: number, repairErrors?: string[]): Promise<AdapterRawResult> {
    const trace: ModelTrace = {
      requestId,
      sessionId: request.sessionId,
      promptVersion: promptConfig.version,
      attempt,
    };
    const input: AdapterInput = {
      systemPrompt: promptConfig.buildSystemPrompt(request),
      userPrompt: prompt,
      imageBase64: request.imageBase64,
      imageMimeType: request.imageMimeType,
      repairErrors,
      kind: { kind: "deep_scan", request },
    };
    return traceStage(tracing, "scan.deep_scan_model", {
      requestId,
      provider: adapter.providerId,
      model: adapter.modelId,
      attempt,
    }, async span => {
      const startedAt = Date.now();
      try {
        const result = await adapter.analyzeProduce({ ...input, trace }, signal);
        traceResponse(span, "model", result.object);
        span?.setAttributes({
          "tokens.input": result.usage.promptTokens,
          "tokens.output": result.usage.completionTokens,
        });
        logScanResponse("model_response", { ...trace, provider: adapter.providerId, model: adapter.modelId }, result.object);
        console.log(JSON.stringify({
          event: "model_usage", ...trace, provider: adapter.providerId, model: adapter.modelId,
          durationMs: Date.now() - startedAt, success: true, usage: result.usage,
        }));
        return result;
      } catch (error) {
        const status = error && typeof error === "object" && "statusCode" in error ? (error as any).statusCode : undefined;
        console.log(JSON.stringify({
          event: "model_usage", ...trace, provider: adapter.providerId, model: adapter.modelId,
          durationMs: Date.now() - startedAt, success: false, upstreamStatus: typeof status === "number" ? status : null,
        }));
        throw error;
      }
    });
  }

  const raw = await analyzeAttempt(promptConfig.buildUserPrompt(request), 1);
  addUsage(raw.usage);
  const verify = verifyAndResolveDeepScanResponse(raw.object, {
    request,
    promptVersion,
    modelId: adapter.modelId,
  });
  if (verify.ok) {
    return { response: verify.response, usage: totalUsage, attempts: 1 };
  }

  const fallbackResponse: DeepScanResponse = {
    schemaVersion: "1.0",
    promptVersion,
    modelId: adapter.modelId,
    status: "analysis_failed",
    message: "Analysis failed to produce a valid verified result.",
    abstentionReason: null,
    produce: { type: "unknown", displayName: "Unknown", variety: null },
    ripeness: { state: "unknown", confidence: 0 },
    evidence: [],
    quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: null },
    manualChecks: null,
    recommendation: null,
    afterPurchase: null,
  };
  return { response: fallbackResponse, usage: totalUsage, attempts: 1 };
}
