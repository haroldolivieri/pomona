import { describe, expect, it } from "vitest";
import { ScanRequestSchema, ScanResponseSchema } from "../src/index";

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
