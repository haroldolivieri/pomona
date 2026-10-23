import { describe, expect, it, vi } from "vitest";
import {
  verifyAndResolveDeepScanResponse,
  runVerifiedDeepScan,
} from "@pomona/proxy";
import type { DeepScanRequest, DeepScanResponseModel } from "@pomona/contract";

const request: DeepScanRequest = {
  schemaVersion: "1.0",
  sessionId: "0d0e9a64-fcbe-4a3d-a34f-a4fdf8b71d1c",
  locale: "en-GB",
  imageBase64: "aGVsbG8=",
  imageMimeType: "image/webp",
  sampleCount: 25,
};

const ctx = { request, promptVersion: "deep_scan_v1", modelId: "test-model" };

function modelPayload(overrides: Partial<DeepScanResponseModel> = {}): DeepScanResponseModel {
  return {
    status: "ok",
    abstentionReason: null,
    message: null,
    produce: { type: "avocado", displayName: "Avocado", variety: null },
    ripeness: { state: "nearly_ripe", confidence: 0.72 },
    evidence: ["Tile 2: field color moved to green-brown", "Tile 5: matte skin"],
    quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
    manualChecks: null,
    recommendation: null,
    afterPurchase: {
      readyInDays: { min: 1, max: 2 },
      eatWithinDays: { min: 3, max: 4 },
      eatWithinLabel: "3-4 days",
      storage: {
        beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole on the counter", tip: "Softens daily" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Sealed in the fridge", tip: "Keep chilled" },
      },
    },
    ...overrides,
  };
}

const UNKNOWN_PLACEHOLDER = { type: "unknown", displayName: "Unknown", variety: null };

function makeAdapter(raw1: unknown, raw2?: unknown, usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }) {
  const analyzeProduce = vi
    .fn()
    .mockResolvedValueOnce({ object: raw1, usage })
    .mockResolvedValueOnce({ object: raw2 ?? raw1, usage });
  return { adapter: { providerId: "google", modelId: "test-model", analyzeProduce }, analyzeProduce };
}

describe("verifyAndResolveDeepScanResponse", () => {
  it("accepts a verified ok verdict and injects response metadata", () => {
    const out = verifyAndResolveDeepScanResponse(modelPayload(), ctx);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.status).toBe("ok");
      expect(out.response.schemaVersion).toBe("1.0");
      expect(out.response.promptVersion).toBe("deep_scan_v1");
      expect(out.response.modelId).toBe("test-model");
    }
  });

  it("status ok without evidence fails the verify", () => {
    const out = verifyAndResolveDeepScanResponse(modelPayload({ evidence: [] }), ctx);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toMatch(/evidence/i);
  });

  it("status ok with sufficientVisualEvidence=false fails", () => {
    const out = verifyAndResolveDeepScanResponse(
      modelPayload({ quality: { sufficientVisualEvidence: false, viewCoverage: "fair", reason: null } }),
      ctx
    );
    expect(out.ok).toBe(false);
  });

  it("status ok with unknown ripeness.state fails", () => {
    const out = verifyAndResolveDeepScanResponse(modelPayload({ ripeness: { state: "unknown", confidence: 0.4 } }), ctx);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toMatch(/unknown/i);
  });

  it("canonical output strips supplier-facing tile/view framing from evidence", () => {
    const out = verifyAndResolveDeepScanResponse(modelPayload(), ctx);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.evidence).toEqual([
        "field color moved to green-brown",
        "matte skin",
      ]);
    }
  });

  it("nulls afterPurchase on every canonical non-ok outcome", () => {
    const leaning = modelPayload({
      status: "insufficient_evidence",
      abstentionReason: "same_side_only",
      message: "Most sides were not captured.",
      produce: UNKNOWN_PLACEHOLDER,
      ripeness: { state: "unknown", confidence: 0.3 },
      quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: null },
      manualChecks: [{ trait: "Underside", how: "Rotate gently and retake", whatItMeans: "Field color judges ripeness" }],
    });
    const out = verifyAndResolveDeepScanResponse(leaning, ctx);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.response.afterPurchase).toBeNull();
  });

  it("a confident verdict with padded manualChecks is stripped, not failed", () => {
    const padded: DeepScanResponseModel = {
      ...modelPayload(),
      ripeness: { state: "nearly_ripe", confidence: 0.9 },
      manualChecks: [{ trait: "Skin", how: "Press gently", whatItMeans: "Gives = ripe" }],
    };
    const out = verifyAndResolveDeepScanResponse(padded, ctx);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.response.manualChecks).toBeNull();
    expect(out.errors ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/manualChecks/i)]));
  });

  it("a non-confident ok keeps a single manual check intact", () => {
    const out = verifyAndResolveDeepScanResponse(
      modelPayload({ manualChecks: [{ trait: "Stem", how: "Press gently next to the stem", whatItMeans: "Firm = not ripe yet" }] }),
      ctx
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.response.manualChecks).toHaveLength(1);
  });

  it("insufficient_evidence without a deep-scan abstentionReason fails", () => {
    const out = verifyAndResolveDeepScanResponse(
      modelPayload({
        status: "insufficient_evidence",
        abstentionReason: null,
        message: "Only one side is visible. Rotate the fruit.",
        produce: UNKNOWN_PLACEHOLDER,
      }),
      ctx
    );
    expect(out.ok).toBe(false);
  });

  it("insufficient_evidence requires at least one manualCheck", () => {
    const out = verifyAndResolveDeepScanResponse(
      modelPayload({
        status: "insufficient_evidence",
        abstentionReason: "same_side_only",
        message: "Only one side is visible. Rotate the fruit.",
        produce: UNKNOWN_PLACEHOLDER,
        ripeness: { state: "unknown", confidence: 0.3 },
        manualChecks: [],
      }),
      ctx
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toMatch(/manualCheck/i);
  });

  it("same_side_only with poor coverage may omit manualChecks", () => {
    const out = verifyAndResolveDeepScanResponse(
      modelPayload({
        status: "insufficient_evidence",
        abstentionReason: "same_side_only",
        message: "Only the stem side is readable. Rotate to the underside.",
        produce: UNKNOWN_PLACEHOLDER,
        ripeness: { state: "unknown", confidence: 0.3 },
        quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: "underside hidden" },
        manualChecks: null,
      }),
      ctx
    );
    expect(out.ok).toBe(true);
  });

  it("unknown state on insufficient_evidence requires a message naming the missing view", () => {
    const out = verifyAndResolveDeepScanResponse(
      modelPayload({
        status: "insufficient_evidence",
        abstentionReason: "same_side_only",
        message: null,
        produce: UNKNOWN_PLACEHOLDER,
        ripeness: { state: "unknown", confidence: 0.2 },
        quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: null },
        manualChecks: [{ trait: "Underside", how: "Rotate gently and retake", whatItMeans: "Field color judges ripeness" }],
      }),
      ctx
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toMatch(/message/i);
  });

  it("schema-invalid payloads fail with parse errors", () => {
    for (const bad of [
      modelPayload({ status: "multiple_types" as never }),
      modelPayload({ produce: { type: "", displayName: "Avocado", variety: null } }),
      modelPayload({ evidence: ["a", "b", "c", "d", "e", "f", "g"] }),
      modelPayload({ quality: { sufficientVisualEvidence: true, viewCoverage: "excellent" as never, reason: null } }),
    ]) {
      const out = verifyAndResolveDeepScanResponse(bad, ctx);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("runVerifiedDeepScan verify/repair cycle", () => {
  it("keeps a verified first attempt (attempts 1)", async () => {
    const { adapter, analyzeProduce } = makeAdapter(modelPayload());
    const out = await runVerifiedDeepScan(request, adapter, "deep_scan_v1", undefined, "req-1");
    expect(out.attempts).toBe(1);
    expect(out.response.status).toBe("ok");
    expect(analyzeProduce).toHaveBeenCalledTimes(1);
    expect(out.usage.totalTokens).toBe(15);
  });

  it("repairs once feeding the verifier errors back to the model", async () => {
    const missing = modelPayload({
      status: "insufficient_evidence",
      abstentionReason: "same_side_only",
      message: "Only one side is visible. Rotate the fruit.",
      produce: UNKNOWN_PLACEHOLDER,
      ripeness: { state: "unknown", confidence: 0.3 },
      manualChecks: [],
    });
    const { adapter, analyzeProduce } = makeAdapter(missing, modelPayload());
    const out = await runVerifiedDeepScan(request, adapter, "deep_scan_v1", undefined, "req-2");
    expect(out.attempts).toBe(2);
    expect(out.response.status).toBe("ok");
    expect(analyzeProduce.mock.calls[1][0].userPrompt).toContain("manualChecks");
    expect(out.usage.totalTokens).toBe(30);
  });

  it("falls back to an analysis_failed envelope when both attempts fail verification", async () => {
    const bad = modelPayload({ status: "multiple_types" as never });
    const { adapter } = makeAdapter(bad, bad);
    const out = await runVerifiedDeepScan(request, adapter, "deep_scan_v1", undefined, "req-3");
    expect(out.response).toMatchObject({
      schemaVersion: "1.0",
      promptVersion: "deep_scan_v1",
      modelId: "test-model",
      status: "analysis_failed",
    });
    expect(out.attempts).toBe(2);
  });

  it("rethrows rate-limit errors instead of masking them", async () => {
    const adapter = {
      providerId: "google",
      modelId: "test-model",
      analyzeProduce: vi.fn().mockRejectedValue(Object.assign(new Error("429 exhausted"), { statusCode: 429 })),
    };
    await expect(runVerifiedDeepScan(request, adapter, "deep_scan_v1", undefined, "req-4")).rejects.toThrow();
    expect(adapter.analyzeProduce).toHaveBeenCalledTimes(1);
  });
});
