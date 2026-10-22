import { z } from "zod";
import { translateShared, resolveDisplayLocale, type ScanRequest, type ScanResponse } from "@pomona/contract";
import type { TokenUsage } from "../adapters/types";

export const VISIBILITY_GATE_MODEL = "@cf/cloudflare/clef-flash";
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
    state: "Check photo suitability only, not ripeness or a winner. " +
      "Ignore artificial black masking and background produce. Printed pictures are not real produce. " +
      "Varieties of one species count as one. For an unmasked photo, judge the dominant foreground subject. " +
      "If uncertain, answer no. Missing underside views alone do not make a photo unclear.",
    questions: {
      no_produce: { type: "noul", instructions: "Is there no real fresh fruit or vegetable visible?" },
      unclear_photo: { type: "noul", instructions: "Is the visible produce too blurry, obscured, or washed out to inspect?" },
      multiple_types: { type: "noul", instructions: "Does the selected area contain multiple produce species?" },
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
  const failures = reasons.filter(reason => answers.data[reason].noul >= 0.85);
  return { status: failures.length === 1 ? failures[0] : null, usage,
    scores: { no_produce: answers.data.no_produce.noul, unclear_photo: answers.data.unclear_photo.noul, multiple_types: answers.data.multiple_types.noul } };
}

export async function runVisibilityGate(
  binding: GateAiBinding, request: VisibilityGateRequest, requestId: string,
  gateway?: { id: string; token?: string },
) {
  const response = await binding.run(VISIBILITY_GATE_MODEL, buildVisibilityGateInput(request), {
    signal: AbortSignal.timeout(2500),
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

export function gateDenialStatus(error: unknown): "rate_limited" | "analysis_failed" | null {
  const code = error && typeof error === "object"
    ? ((error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode) : undefined;
  if (code === 429 || /\b429\b|rate.?limit|quota|budget|neurons.{0,30}(?:limit|exceed)/i.test(error instanceof Error ? error.message : "")) return "rate_limited";
  if (code === 401 || code === 403) return "analysis_failed";
  return null;
}
