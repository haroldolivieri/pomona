import { describe, expect, it } from "vitest";
import manifest from "../dataset/ground-truth.json";
import { verifyPromptfooOutput } from "../assertions/verify-contract";

const scene = (id: string) => manifest.find((entry) => entry.id === id)!.groundTruth;
const ripenessScene = scene("20-roma-clear-ripeness-focus-polygon");

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

function ripenessOutput() {
  const output = readableOutput();
  output.candidates[0].box = ripenessScene.expectedRipenessComparison!.ripeBox;
  output.candidates[0].traits = ["Smooth intact red skin"];
  output.candidates[1].box = ripenessScene.expectedRipenessComparison!.lessRipeBox;
  output.candidates[1].score = 2;
  output.candidates[1].ripeness = "underripe";
  output.candidates[1].traits = ["Pale green skin"];
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

  it.each([
    "The Roma tomatoes are uniformly mature with no visible basis for a useful preference. Please provide a new view.",
    "Watermelon ripeness cannot be determined from external rind appearance alone. Please provide a view of the field spot.",
  ])("accepts an uncertainty explanation and a requested view: %s", (message) => {
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), { vars: scene("16-roma-tomatoes-bulk-pile") }).pass).toBe(true);
  });

  it("rejects a missing-surface statement without a retake action", () => {
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message: "The underside is hidden." }), { vars: scene("16-roma-tomatoes-bulk-pile") }).pass).toBe(false);
  });

  it("keeps the original polygon and minimum count on the new readable scene", () => {
    expect(ripenessScene.expectedCandidateCountMin).toBe(30);
    expect(ripenessScene.focusPolygon).toEqual(scene("17-roma-bulk-pile-focus-polygon").focusPolygon);
    expect(verifyPromptfooOutput(JSON.stringify(ripenessOutput()), { vars: ripenessScene }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify(abstention), { vars: ripenessScene }).pass).toBe(false);
  });

  it("rejects promoting the visibly less-ripe unit", () => {
    const output = ripenessOutput();
    output.candidates[1].score = 10;
    const result = verifyPromptfooOutput(JSON.stringify(output), { vars: ripenessScene });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("The less-ripe unit must rank below");
  });

  it("rejects calling the visibly less-ripe unit ripe or omitting it", () => {
    const output = ripenessOutput();
    output.candidates[1].ripeness = "ripe";
    expect(verifyPromptfooOutput(JSON.stringify(output), { vars: ripenessScene }).pass).toBe(false);
    output.candidates[1] = { ...output.candidates[2], id: "replacement" };
    const result = verifyPromptfooOutput(JSON.stringify(output), { vars: ripenessScene });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Expected separate candidates");
  });
});
