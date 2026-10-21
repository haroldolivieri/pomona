import { describe, expect, it } from "vitest";
import { verifyPromptfooOutput } from "../assertions/verify-contract";

describe("promptfoo contract & focus-polygon assertion", () => {
  it("passes when the model output satisfies ScanResponseSchema, focusPolygon containment, and expected winnerId", () => {
    const res = verifyPromptfooOutput(
      JSON.stringify({
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: 1,
        candidates: [
          { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], flipSummary: null },
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
      }),
      {
        vars: {
          round: 1,
          expectedProduceType: "watermelon",
          focusPolygon: [[200, 200], [800, 200], [800, 800], [200, 800]],
        },
      }
    );
    expect(res.pass).toBe(true);
  });

  it("fails when model returns malformed JSON", () => {
    const res = verifyPromptfooOutput("not json", { vars: { round: 1 } });
    expect(res.pass).toBe(false);
    expect(res.score).toBe(0);
    expect(res.reason).toContain("Failed to parse JSON output");
  });

  it("fails when candidates fall outside focusPolygon", () => {
    const res = verifyPromptfooOutput(
      JSON.stringify({
        status: "ok",
        message: null,
        produce: { type: "cantaloupe", displayName: "Cantaloupe", variety: null },
        countedTotal: 1,
        candidates: [
          // center is at [100, 100], strictly outside [300, 300] - [700, 700]
          { id: "c1", box: [50, 50, 150, 150], score: 8.0, ripeness: "ripe", traits: ["Good netting"], flipSummary: null },
        ],
        verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Ripe" },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 2, max: 4 },
          eatWithinLabel: "2–4 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge", tip: "Cover" },
          },
        },
      }),
      {
        vars: {
          round: 1,
          focusPolygon: [[300, 300], [700, 300], [700, 700], [300, 700]],
        },
      }
    );
    expect(res.pass).toBe(false);
    expect(res.reason).toContain("candidates must contain at least 1 valid candidate");
  });

  it("fails when expectedProduceType mismatches model output", () => {
    const res = verifyPromptfooOutput(
      JSON.stringify({
        status: "ok",
        message: null,
        produce: { type: "cantaloupe", displayName: "Cantaloupe", variety: null },
        countedTotal: 1,
        candidates: [
          { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Good aroma"], flipSummary: null },
        ],
        verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Ripe" },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 2, max: 4 },
          eatWithinLabel: "2–4 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge", tip: "Cover" },
          },
        },
      }),
      {
        vars: {
          round: 1,
          expectedProduceType: "watermelon",
        },
      }
    );
    expect(res.pass).toBe(false);
    expect(res.score).toBe(0.5);
    expect(res.reason).toContain('Expected produce type "watermelon" but received "cantaloupe"');
  });
});
