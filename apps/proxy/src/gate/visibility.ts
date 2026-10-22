import { z } from "zod";
import { translateShared, resolveDisplayLocale, type ScanRequest, type ScanResponse } from "@pomona/contract";
import type { TokenUsage } from "../adapters/types";

export const VISIBILITY_GATE_MODEL = "@cf/cloudflare/clef-flash";
export const VISIBILITY_GATE_THRESHOLD = 0.70;
const reasons = ["no_produce", "unclear_photo", "multiple_types"] as const;
export type GateReason = typeof reasons[number];
export type VisibilityGateRequest = Omit<ScanRequest, "imageMimeType"> & { imageMimeType: ScanRequest["imageMimeType"] | "image/png" };

// Narrow native binding boundary, checked against Wrangler's generated AiOptions.
export interface GateAiBinding {
  run(model: string, input: Record<string, unknown>, options?: {
    signal?: AbortSignal;
    returnRawResponse: true;
    extraHeaders?: Record<string, string>;
    gateway?: {
      id: string; skipCache: boolean; collectLog: boolean;
      metadata: Record<string, string | number>; retries: { maxAttempts: 1 };
    };
  }): Promise<Response>;
}

export function buildVisibilityGateInput(request: Pick<VisibilityGateRequest, "imageBase64" | "imageMimeType" | "focusPolygon">) {
  return {
    model: "clef-flash",
    images: [`data:${request.imageMimeType};base64,${request.imageBase64}`],
    state: "Inspect selected foreground only. Ignore black mask and background. " +
      "Printed pictures are not produce. Same-species varieties count as one. " +
      "Missing underside views are OK. Do not grade ripeness. If unsure, answer no.",
    questions: {
      no_produce: { type: "noul", instructions: "Is there no real fresh produce in the foreground?" },
      unclear_photo: { type: "noul", instructions: "Do blur, glare, or packaging hide most produce surfaces?" },
      multiple_types: { type: "noul", instructions: "Are two or more produce species selected together?" },
    },
  };
}

const answer = z.object({ type: z.literal("noul"), noul: z.number().finite().min(0).max(1) });
const answersSchema = z.object({ no_produce: answer, unclear_photo: answer, multiple_types: answer });
const usageSchema = z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() });

export function resolveVisibilityGate(raw: unknown): { status: GateReason | null; usage: TokenUsage | null; scores: Record<GateReason, number> | null } {
  const envelope = z.object({ answers: z.unknown().optional(), usage: z.unknown().optional() }).safeParse(raw);
  if (!envelope.success) return { status: null, usage: null, scores: null };
  const parsedUsage = usageSchema.safeParse(envelope.data.usage);
  const usage = parsedUsage.success ? {
    promptTokens: parsedUsage.data.input_tokens, completionTokens: parsedUsage.data.output_tokens,
    totalTokens: parsedUsage.data.input_tokens + parsedUsage.data.output_tokens,
  } : null;
  const answers = answersSchema.safeParse(envelope.data.answers);
  if (!answers.success || !usage) return { status: null, usage, scores: null };
  const failures = reasons.filter(reason => answers.data[reason].noul >= VISIBILITY_GATE_THRESHOLD);
  return { status: failures.length === 1 ? failures[0] : null, usage,
    scores: { no_produce: answers.data.no_produce.noul, unclear_photo: answers.data.unclear_photo.noul, multiple_types: answers.data.multiple_types.noul } };
}

export async function runVisibilityGate(
  binding: GateAiBinding, request: VisibilityGateRequest, requestId: string,
  gateway?: { id: string; token?: string },
) {
  const signal = AbortSignal.timeout(3000);
  try {
    const response = await binding.run(VISIBILITY_GATE_MODEL, buildVisibilityGateInput(request), {
      signal,
      // Native Ai.run errors omit HTTP status. Preserve the raw status before parsing.
      returnRawResponse: true,
      ...(gateway ? {
        gateway: { id: gateway.id, skipCache: true, collectLog: false, retries: { maxAttempts: 1 as const },
          metadata: { app: "pomona", request_id: requestId, session_id: request.sessionId, stage: "visibility-v1", round: request.round } },
        extraHeaders: gateway.token ? { "cf-aig-authorization": `Bearer ${gateway.token}` } : undefined,
      } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(`Workers AI HTTP ${response.status}`), { status: response.status });
    }
    return resolveVisibilityGate(await response.json());
  } catch (error) {
    // Known authorization/capacity denials must never become a Gemini fallback.
    if (gateDenialStatus(error)) throw error;
    if (signal.aborted) throw Object.assign(new Error("Clef exceeded 3000ms timeout"), { name: "TimeoutError", timeoutMs: 3000 });
    throw error;
  }
}

export function visibilityGateResponse(status: GateReason | "rate_limited" | "analysis_failed", request: ScanRequest, promptVersion: string): ScanResponse {
  const locale = resolveDisplayLocale(request.locale, null);
  const messages = {
    no_produce: translateShared(locale, "gate.noProduce"),
    unclear_photo: translateShared(locale, "gate.unclearPhoto"),
    multiple_types: translateShared(locale, "gate.multipleTypes"),
    rate_limited: translateShared(locale, "gate.rateLimited"),
    analysis_failed: translateShared(locale, "gate.failed"),
  };
  return { schemaVersion: "1.0", promptVersion, modelId: VISIBILITY_GATE_MODEL, round: request.round,
    status, message: messages[status], abstentionReason: null, countedTotal: null,
    produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null };
}

export async function runDeepScanVisibilityGate(
  binding: GateAiBinding, imageBase64: string, imageMimeType: string, requestId: string,
  gateway?: { id: string; token?: string },
) {
  const signal = AbortSignal.timeout(3000);
  const input = buildDeepScanGateInput(imageBase64, imageMimeType);
  try {
    const response = await binding.run(VISIBILITY_GATE_MODEL, input, {
      signal,
      returnRawResponse: true,
      ...(gateway ? {
        gateway: { id: gateway.id, skipCache: true, collectLog: false, retries: { maxAttempts: 1 as const },
          metadata: { app: "pomona", request_id: requestId, stage: "deep-scan" } },
        extraHeaders: gateway.token ? { "cf-aig-authorization": `Bearer ${gateway.token}` } : undefined,
      } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(`Workers AI HTTP ${response.status}`), { status: response.status });
    }
    return resolveDeepScanGate(await response.json());
  } catch (error) {
    if (gateDenialStatus(error)) throw error;
    if (signal.aborted) throw Object.assign(new Error("Clef exceeded 3000ms timeout"), { name: "TimeoutError", timeoutMs: 3000 });
    throw error;
  }
}

export function gateDenialStatus(error: unknown): "rate_limited" | "analysis_failed" | null {
  const code = error && typeof error === "object"
    ? ((error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode) : undefined;
  if (code === 429 || /\b429\b|rate.?limit|quota|budget|neurons.{0,30}(?:limit|exceed)/i.test(error instanceof Error ? error.message : "")) return "rate_limited";
  if (code === 401 || code === 403) return "analysis_failed";
  return null;
}

const deepScanReasons = ["no_produce", "unclear_photo"] as const;
export type DeepScanGateStatus = typeof deepScanReasons[number];
export type DeepScanGateScores = Record<DeepScanGateStatus, number>;

const DEEP_SCAN_PREAMBLE = "This is a grid of multiple views of one fruit.";

export function buildDeepScanGateInput(imageBase64: string, imageMimeType: string) {
  const base = buildVisibilityGateInput({
    imageBase64,
    imageMimeType: imageMimeType as VisibilityGateRequest["imageMimeType"],
    focusPolygon: null,
  });
  const { multiple_types: _multipleTypes, ...questions } = base.questions;
  return { ...base, state: `${base.state} ${DEEP_SCAN_PREAMBLE}`, questions };
}

export function resolveDeepScanGate(raw: unknown): { status: DeepScanGateStatus | null; usage: TokenUsage | null; scores: DeepScanGateScores | null } {
  const envelope = z.object({ answers: z.unknown().optional(), usage: z.unknown().optional() }).safeParse(raw);
  if (!envelope.success) return { status: null, usage: null, scores: null };
  const parsedUsage = usageSchema.safeParse(envelope.data.usage);
  const usage = parsedUsage.success ? {
    promptTokens: parsedUsage.data.input_tokens, completionTokens: parsedUsage.data.output_tokens,
    totalTokens: parsedUsage.data.input_tokens + parsedUsage.data.output_tokens,
  } : null;
  const answers = z.object({ no_produce: answer, unclear_photo: answer }).safeParse(envelope.data.answers);
  if (!answers.success || !usage) return { status: null, usage, scores: null };
  const failures = deepScanReasons.filter(reason => answers.data[reason].noul >= VISIBILITY_GATE_THRESHOLD);
  return {
    status: failures.length === 1 ? failures[0] : null,
    usage,
    scores: { no_produce: answers.data.no_produce.noul, unclear_photo: answers.data.unclear_photo.noul },
  };
}
