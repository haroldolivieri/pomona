import { describe, expect, it } from "vitest";
import {
  DeepScanAbstentionReasonSchema,
  DeepScanRequestSchema,
  DeepScanResponseModelSchema,
} from "@pomona/contract";

const validRequest = {
  schemaVersion: "1.0" as const,
  sessionId: "0d0e9a64-fcbe-4a3d-a34f-a4fdf8b71d1c",
  imageBase64: "aGVsbG8=",
  imageMimeType: "image/webp" as const,
  sampleCount: 25,
};

describe("DeepScanRequestSchema", () => {
  it("parses a valid request and defaults locale to en-GB", () => {
    const parsed = DeepScanRequestSchema.parse(validRequest);
    expect(parsed.locale).toBe("en-GB");
    expect(parsed.sampleCount).toBe(25);
  });

  it("rejects sampleCount above 30", () => {
    expect(() =>
      DeepScanRequestSchema.parse({ ...validRequest, sampleCount: 31 })
    ).toThrowError();
  });

  it("rejects unsupported mime type image/png", () => {
    expect(() =>
      DeepScanRequestSchema.parse({ ...validRequest, imageMimeType: "image/png" })
    ).toThrowError();
  });
});

describe("DeepScanResponseModelSchema", () => {
  const manualChecks = [
    { trait: "Stem area", how: "Press gently next to the stem", whatItMeans: "Gives slightly = ripe" },
    { trait: "Skin", how: "Run a thumb over the skin", whatItMeans: "Wrinkled skin = softer inside" },
  ];

  it("accepts a verdict with two manual checks and unknown ripeness from poor coverage", () => {
    const model = {
      status: "insufficient_evidence",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "unknown", confidence: 0.3 },
      evidence: ["Only one angle visible; the rest of the fruit is out of frame."],
      quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: null },
      manualChecks,
      recommendation: null,
      afterPurchase: null,
    };
    expect(() => DeepScanResponseModelSchema.parse(model)).not.toThrowError();
    const parsed = DeepScanResponseModelSchema.parse(model);
    expect(parsed.ripeness.state).toBe("unknown");
    expect(parsed.quality.viewCoverage).toBe("poor");
    expect(parsed.manualChecks).toHaveLength(2);
  });

  it("rejects more than 3 manual checks", () => {
    const model = {
      status: "insufficient_evidence",
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "unknown", confidence: 0.3 },
      evidence: [],
      quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: null },
      manualChecks: [
        { trait: "a", how: "b", whatItMeans: "c" },
        { trait: "d", how: "e", whatItMeans: "f" },
        { trait: "g", how: "h", whatItMeans: "i" },
        { trait: "j", how: "k", whatItMeans: "l" },
      ],
      recommendation: null,
      afterPurchase: null,
    };
    expect(() => DeepScanResponseModelSchema.parse(model)).toThrowError();
  });

  it("rejects a deep-scan model without the afterPurchase field (contract parity with the normal scan)", () => {
    const model: Record<string, unknown> = {
      status: "ok",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "nearly_ripe", confidence: 0.85 },
      evidence: ["Skin losing green"],
      quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
      manualChecks: null,
      recommendation: null,
    };
    expect(() => DeepScanResponseModelSchema.parse(model)).toThrowError();
  });

  it("accepts a deep-scan ok verdict reusing the normal scan's afterPurchase shape", () => {
    const model = {
      status: "ok",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: "Hass" },
      ripeness: { state: "nearly_ripe", confidence: 0.85 },
      evidence: ["Skin losing green", "Slight sheen near the stem"],
      quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
      manualChecks: null,
      recommendation: { eatWhen: "in_a_few_days" },
        afterPurchase: {
    readyInDays: { min: 1, max: 2 },
    eatWithinDays: { min: 3, max: 4 },
    eatWithinLabel: "3-4 days",
    storage: {
      beforeCut: {
        where: "counter",
        whereLabel: "Counter",
        summary: "Whole on the counter",
        tip: "Softens a little every day",
      },
      afterCut: {
        where: "fridge",
        whereLabel: "Fridge",
        summary: "Sealed in the fridge",
        tip: "Keep chilled in a container",
      },
    },
  },
};
    const parsed = DeepScanResponseModelSchema.parse(model);
    expect(parsed.afterPurchase?.eatWithinLabel).toBe("3-4 days");
  });

  it("rejects afterPurchase storage with an out-of-enum where value", () => {
    const model = {
      status: "ok",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "ripe", confidence: 0.9 },
      evidence: ["Gives to gentle pressure"],
      quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
      manualChecks: null,
      recommendation: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 2, max: 3 },
        eatWithinLabel: "2-3 days",
        storage: {
          beforeCut: { where: "bathroom", whereLabel: "Bathroom", summary: "s", tip: "t" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "s", tip: "t" },
        },
      },
    };
    expect(() => DeepScanResponseModelSchema.parse(model)).toThrowError();
  });

  it("rejects an eatWithinLabel beyond the shared 28-char bound", () => {
    const model = {
      status: "ok",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "nearly_ripe", confidence: 0.85 },
      evidence: ["Skin losing green"],
      quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
      manualChecks: null,
      recommendation: null,
      afterPurchase: {
        readyInDays: { min: 1, max: 2 },
        eatWithinDays: { min: 3, max: 4 },
        eatWithinLabel: "x".repeat(29),
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "s", tip: "t" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "s", tip: "t" },
        },
      },
    };
    expect(() => DeepScanResponseModelSchema.parse(model)).toThrowError();
  });
});

describe("DeepScanAbstentionReasonSchema", () => {
  it("exposes exactly the deep-scan abstention reasons", () => {
    expect(DeepScanAbstentionReasonSchema.options).toEqual([
      "insufficient_view_coverage",
      "same_side_only",
    ]);
  });
});
