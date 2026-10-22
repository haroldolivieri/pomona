import {
  DeepScanResponseModelSchema,
  DeepScanResponseSchema,
  isSupportedLocale,
  translateShared,
  type DeepScanRequest,
  type DeepScanResponse,
  type DeepScanResponseModel,
  type SupportedLocale,
} from "@pomona/contract";

export type DeepScanVerifyContext = {
  request: DeepScanRequest;
  promptVersion: string;
  modelId: string;
};

export type DeepScanVerifyOutcome =
  | { ok: false; errors: string[] }
  | { ok: true; response: DeepScanResponse; errors: string[] };

const UNKNOWN_PLACEHOLDER: { type: string; displayName: string; variety: null } = {
  type: "unknown",
  displayName: "Unknown",
  variety: null,
};

const CONFIDENT_MANUAL_CHECK_ERROR = "manualChecks stripped: a confident verdict (confidence >= 0.8 with sufficientVisualEvidence) never carries checks";
const isStripOnly = (error: string) => error.startsWith("manualChecks stripped:");

function fallbackMessage(status: string, displayLocale: SupportedLocale): string {
  return status === "insufficient_evidence"
    ? translateShared(displayLocale, "verifier.missing")
    : status === "no_produce"
      ? translateShared(displayLocale, "verifier.noProduce")
      : status === "unclear_photo"
        ? translateShared(displayLocale, "verifier.unclear")
        : translateShared(displayLocale, "verifier.failed");
}

export function verifyAndResolveDeepScanResponse(
  rawModelOutput: unknown,
  ctx: DeepScanVerifyContext
): DeepScanVerifyOutcome {
  const displayLocale: SupportedLocale = isSupportedLocale(ctx.request.locale) ? ctx.request.locale : "en-GB";

  let pre = rawModelOutput;
  if (pre && typeof pre === "object") {
    const obj = { ...(pre as Record<string, unknown>) };
    if (typeof obj.message === "string") obj.message = obj.message.trim();
    const rawStatus = typeof obj.status === "string" ? obj.status : "analysis_failed";
    const produce = obj.produce as Record<string, unknown> | undefined;
    if (rawStatus !== "ok" && (!produce || typeof produce.type !== "string" || produce.type === "")) {
      obj.produce = UNKNOWN_PLACEHOLDER;
    }
    pre = obj;
  }

  const parsed = DeepScanResponseModelSchema.safeParse(pre);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.errors.map((err) => `${err.path.join(".") || "root"}: ${err.message}`) };
  }
  const data = parsed.data;
  const errors: string[] = [];

  if (data.status === "ok") {
    if (data.evidence.length < 1) {
      errors.push("status ok rejected: evidence must name at least one tile and visible trait");
    }
    if (data.quality.sufficientVisualEvidence !== true) {
      errors.push("status ok rejected: quality.sufficientVisualEvidence must be true for a verdict");
    }
    if (data.ripeness.state === "unknown") {
      errors.push("ripeness.state unknown does not support an ok verdict; return insufficient_evidence with a deep-scan abstentionReason instead");
    }
    if (
      !errors.length &&
      data.ripeness.confidence >= 0.8 &&
      data.quality.sufficientVisualEvidence &&
      data.manualChecks !== null &&
      data.manualChecks.length > 0
    ) {
      errors.push(CONFIDENT_MANUAL_CHECK_ERROR);
      (data as { manualChecks: DeepScanResponseModel["manualChecks"] }).manualChecks = null;
    }
  }

  if (data.status === "multiple_types") {
    errors.push("multiple_types is not a deep-scan status: the composite shows one fruit; use no_produce or unclear_photo instead");
  }

  if (data.status === "insufficient_evidence") {
    if (data.abstentionReason !== "insufficient_view_coverage" && data.abstentionReason !== "same_side_only") {
      errors.push("status insufficient_evidence requires abstentionReason insufficient_view_coverage or same_side_only");
    }
    const mayOmitChecks = data.abstentionReason === "same_side_only" && data.quality.viewCoverage === "poor";
    const hasChecks = data.manualChecks !== null && data.manualChecks.length > 0;
    if (!mayOmitChecks && !hasChecks) {
      errors.push("manualChecks: insufficient_evidence without checks is only allowed as same_side_only with quality.viewCoverage poor");
    }
    const message = data.message ?? "";
    if (data.ripeness.state === "unknown" && message.trim().length < 8) {
      errors.push("message must name what is missing and request the useful new view when ripeness.state is unknown");
    }
  }

  if (errors.length && (data.status !== "ok" || errors.some((e) => !isStripOnly(e)))) {
    return { ok: false, errors };
  }

  const isPlainNonOk = data.status === "no_produce" || data.status === "unclear_photo" || data.status === "analysis_failed";
  const canonical = isPlainNonOk
    ? { ...data, produce: UNKNOWN_PLACEHOLDER, evidence: [], manualChecks: [], recommendation: null, abstentionReason: null }
    : data.status === "insufficient_evidence" && (!data.manualChecks || data.manualChecks.length === 0)
      ? { ...data, manualChecks: null }
      : data;

  const finalMessage = canonical.message ?? (canonical.status === "ok" ? null : fallbackMessage(canonical.status, displayLocale));
  const envelope = DeepScanResponseSchema.safeParse({
    ...canonical,
    message: finalMessage,
    schemaVersion: "1.0",
    promptVersion: ctx.promptVersion,
    modelId: ctx.modelId,
  });
  if (!envelope.success) {
    return { ok: false, errors: envelope.error.errors.map((err) => `response envelope ${err.path.join(".") || "root"}: ${err.message}`) };
  }
  return { ok: true, response: envelope.data, errors };
}
