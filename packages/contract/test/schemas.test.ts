import { describe, expect, it } from "vitest";
import {
  ScanRequestSchema,
  ScanResponseModelSchema,
  ScanResponseSchema,
  lookupProduceSeasonality,
} from "../src/index";

describe("ScanRequestSchema & ScanResponseSchema", () => {
  it("accepts a valid Round 1 ScanRequest with a freehand focusPolygon", () => {
    const parsed = ScanRequestSchema.safeParse({
      schemaVersion: "1.0",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      round: 1,
      locale: "en-GB",
      imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
      imageMimeType: "image/webp",
      focusPolygon: [[120, 140], [880, 140], [880, 820], [120, 820]],
      followUpContext: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a focusPolygon with fewer than 3 points or out-of-range coordinates", () => {
    const tooFew = ScanRequestSchema.safeParse({
      schemaVersion: "1.0",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      round: 1,
      imageBase64: "abc",
      imageMimeType: "image/webp",
      focusPolygon: [[10, 20], [30, 40]],
      followUpContext: null,
    });
    expect(tooFew.success).toBe(false);
  });

  it("accepts a complete Round 1 ScanResponse with explicit beforeCut and afterCut storage", () => {
    const res = ScanResponseSchema.safeParse({
      schemaVersion: "1.0",
      promptVersion: "v1",
      modelId: "gemini-2.5-flash",
      round: 1,
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c1",
          box: [385, 370, 625, 655],
          score: 8.6,
          ripeness: "ripe",
          traits: ["Yellow field spot", "Matte rind", "Even form"],
          flipSummary: null,
        },
        {
          id: "c2",
          box: [380, 645, 590, 925],
          score: 8.1,
          ripeness: "almost_ripe",
          traits: ["Matte rind", "Symmetrical"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy it.",
      },
      followUp: {
        targetCandidateId: "c2",
        targetRole: "runner_up",
        bannerText: "The blue-marked Watermelon could be sweeter. Flip it and snap.",
        flipHeadline: "Flip the Watermelon over",
        instruction: "Turn the blue-marked Watermelon to show its underside so we can check the field spot.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3–5 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep whole at room temperature" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly and eat within 3 days" },
        },
      },
    });
    expect(res.success).toBe(true);
  });
});

describe("ScanResponseSchema seasonality", () => {
  const baseOk = {
    schemaVersion: "1.0" as const,
    promptVersion: "v1",
    modelId: "m",
    round: 1 as const,
    status: "ok" as const,
    message: null,
    produce: { type: "mango", displayName: "Mango", variety: null },
    candidates: [
      { id: "c1", box: [100, 100, 400, 400], score: 8.4, ripeness: "ripe", traits: ["Red blush"], flipSummary: null },
    ],
    verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
    followUp: null,
    afterPurchase: {
      readyInDays: { min: 0, max: 0 },
      eatWithinDays: { min: 3, max: 5 },
      eatWithinLabel: "3–5 days",
      storage: {
        beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
      },
    },
  };

  it("still accepts responses without seasonality or with seasonality: null", () => {
    expect(ScanResponseSchema.safeParse(baseOk).success).toBe(true);
    expect(ScanResponseSchema.safeParse({ ...baseOk, seasonality: null }).success).toBe(true);
  });

  it("accepts the engine's output and rejects an over-long badgeText", () => {
    const info = lookupProduceSeasonality("mango", { cfCountry: "GB" }, 11)!;
    expect(ScanResponseSchema.safeParse({ ...baseOk, seasonality: info }).success).toBe(true);
    expect(
      ScanResponseSchema.safeParse({ ...baseOk, seasonality: { ...info, badgeText: "x".repeat(49) } }).success
    ).toBe(false);
  });

  it("keeps seasonality out of the model-facing schema", () => {
    expect("seasonality" in ScanResponseModelSchema.shape).toBe(false);
  });
});
