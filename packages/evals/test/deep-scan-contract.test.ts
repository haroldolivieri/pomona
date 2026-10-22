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
