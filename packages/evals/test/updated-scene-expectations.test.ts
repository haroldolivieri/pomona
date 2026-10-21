import { describe, expect, it } from "vitest";
import manifest from "../dataset/ground-truth.json";
import { verifyPromptfooOutput } from "../assertions/verify-contract";

const scene = (id: string) => manifest.find((entry) => entry.id === id)!.groundTruth;
const qualityScene = scene("20-roma-clear-quality-focus-polygon");

function readableOutput(count = 30, type = "tomato") {
  const displayName = type === "banana" ? "Banana" : "Roma Tomatoes";
  return {
    status: "ok", message: null, countedTotal: count,
    produce: { type, displayName, variety: null },
    candidates: Array.from({ length: count }, (_, index) => ({
      id: `c${index + 1}`,
      box: [400 + Math.floor(index / 6) * 90, 100 + index % 6 * 130,
        470 + Math.floor(index / 6) * 90, 190 + index % 6 * 130],
      score: index === 0 ? 9 : 7,
      ripeness: "ripe",
      traits: ["Intact skin"],
      flipSummary: null,
    })),
    verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy this one." },
    followUp: {
      targetCandidateId: "c2", targetRole: "runner_up",
      bannerText: `Inspect the ${displayName}.`, flipHeadline: `Turn the ${displayName}`,
      instruction: `Show the other side of the ${displayName}.`,
    },
    afterPurchase: {
      readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days",
      storage: {
        beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole", tip: "Keep out of sun" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Covered", tip: "Cover cut produce" },
      },
    },
  };
}

function qualityOutput() {
  const output = readableOutput();
  output.candidates[0].box = qualityScene.expectedQualityComparison!.betterBox;
  output.candidates[0].traits = ["Smooth intact red skin"];
  output.candidates[1].box = qualityScene.expectedQualityComparison!.worseBox;
  output.candidates[1].score = 2;
  output.candidates[1].ripeness = "overripe";
  output.candidates[1].traits = ["Sunken moldy patch"];
  return output;
}

const abstention = {
  status: "insufficient_evidence", countedTotal: null, produce: null, candidates: [],
  verdict: null, followUp: null, afterPurchase: null,
  message: "Cannot assess maturity from this dense view. Please show individual surfaces more clearly.",
};

describe("reviewed scene expectations", () => {
  it("accepts the observed 14 banana candidates and rejects more", () => {
    const vars = scene("15-banana-pack-bagged");
    expect(verifyPromptfooOutput(JSON.stringify(readableOutput(14, "banana")), { vars }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify(readableOutput(15, "banana")), { vars }).pass).toBe(false);
  });

  it.each(["16-roma-tomatoes-bulk-pile", "17-roma-bulk-pile-focus-polygon"])("%s: requires explicit abstention", (id) => {
    const vars = scene(id);
    expect(verifyPromptfooOutput(JSON.stringify(abstention), { vars }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify(readableOutput()), { vars }).pass).toBe(false);
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, candidates: readableOutput().candidates }), { vars }).pass).toBe(false);
  });

  it("accepts a specific obscured-cue explanation with a useful next view", () => {
    const vars = scene("17-roma-bulk-pile-focus-polygon");
    const message = "The dense pile obscures individual ripeness cues; please provide a closer view of the top layer.";
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), { vars }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message: "Please provide another photo." }), { vars }).pass).toBe(false);
  });

  it("keeps the original polygon and minimum count on the new readable scene", () => {
    expect(qualityScene.expectedCandidateCountMin).toBe(30);
    expect(qualityScene.focusPolygon).toEqual(scene("17-roma-bulk-pile-focus-polygon").focusPolygon);
    expect(verifyPromptfooOutput(JSON.stringify(qualityOutput()), { vars: qualityScene }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify(abstention), { vars: qualityScene }).pass).toBe(false);
  });

  it("rejects promoting the visibly spoiled unit", () => {
    const output = qualityOutput();
    output.candidates[1].score = 10;
    const result = verifyPromptfooOutput(JSON.stringify(output), { vars: qualityScene });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Visibly spoiled produce must rank below");
  });

  it("rejects calling the visibly spoiled unit ripe or omitting it", () => {
    const output = qualityOutput();
    output.candidates[1].ripeness = "ripe";
    expect(verifyPromptfooOutput(JSON.stringify(output), { vars: qualityScene }).pass).toBe(false);
    output.candidates[1] = { ...output.candidates[2], id: "replacement" };
    const result = verifyPromptfooOutput(JSON.stringify(output), { vars: qualityScene });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Expected separate candidates");
  });
});
