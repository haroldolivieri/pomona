import { describe, expect, it } from "vitest";
import type { ScanRequest } from "@pomona/contract";
import { v1PromptConfig, verifyAndResolveScanResponse } from "@pomona/proxy";
import manifest from "../dataset/ground-truth.json";
import { verifyPromptfooOutput } from "../assertions/verify-contract";

const abstention = {
  status: "insufficient_evidence", countedTotal: null, produce: null, candidates: [],
  verdict: null, followUp: null, afterPurchase: null,
  message: "I cannot confidently choose: the underside is hidden. Turn the fruit and show the field spot.",
};

const uncertainPick = {
  status: "ok", message: null, countedTotal: null,
  produce: { type: "watermelon", displayName: "Watermelon", variety: null },
  candidates: [{ id: "c1", box: [100, 100, 600, 600], score: 9.2, ripeness: "ripe", traits: ["Matte rind"], flipSummary: null }],
  verdict: { winnerId: "c1", runnerUpId: null, confidence: "low", headline: "Buy it." },
  followUp: null,
  afterPurchase: {
    readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole", tip: "Keep cool" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Covered", tip: "Cover cut fruit" },
    },
  },
};

describe("insufficient evidence abstention eval", () => {
  const scenarios = manifest.filter((entry) => entry.id.startsWith("18-"));

  it("covers all three rounds with runnable image scenarios", () => {
    expect(scenarios.map((entry) => entry.groundTruth.round)).toEqual([1, 2, 3]);
  });

  it.each([
    Array(21).fill("a").join(" "),
    "x".repeat(141),
    "This image is a stock photo or digital advertisement, not a real-time grocery display. I cannot assess the ripeness of digital images. Please provide a photo of produce.",
  ])("rejects oversized descriptions before normalization: %s", (message) => {
    const result = verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), {
      vars: scenarios[0].groundTruth,
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("20 words or 140 characters");
  });

  it("accepts a specific missing-evidence explanation with an action", () => {
    const message = "The underside is not visible. Please rotate the watermelon to show the field spot for a final ripeness check.";
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), { vars: scenarios[0].groundTruth }).pass).toBe(true);
  });

  it.each([
    "Watermelon ripeness requires a visible field spot; please provide a view of the underside.",
    "Ripeness requires clear maturity cues. Please turn the fruit to show its underside.",
  ])("accepts an explicit missing-evidence requirement: %s", (message) => {
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), { vars: scenarios[0].groundTruth }).pass).toBe(true);
  });

  it.each([
    "Please provide another photo.",
    "Ripeness requires care. Please turn the fruit.",
    "The underside is hidden.",
  ])("rejects abstention without both missing evidence and a useful view: %s", (message) => {
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), { vars: scenarios[0].groundTruth }).pass).toBe(false);
  });

  it("accepts exactly 20 words without truncation", () => {
    const message = "I cannot confidently choose from this view. Please turn the fruit to show its underside and stem in clear light.";
    expect(message.split(/\s+/)).toHaveLength(20);
    expect(verifyPromptfooOutput(JSON.stringify({ ...abstention, message }), { vars: scenarios[0].groundTruth }).pass).toBe(true);
  });

  it.each(scenarios)("$id: abstains without inheriting a previous winner", ({ groundTruth }) => {
    const request = {
      schemaVersion: "1.0", sessionId: "00000000-0000-0000-0000-000000000000",
      round: groundTruth.round, locale: "en-GB", imageBase64: "dummy", imageMimeType: "image/jpeg",
      focusPolygon: null, followUpContext: "followUpContext" in groundTruth ? groundTruth.followUpContext : null,
    } as ScanRequest;
    const context = { request, promptVersion: v1PromptConfig.version, modelId: "eval" };

    const oversized = verifyAndResolveScanResponse({ ...abstention, message: "Too much detail. ".repeat(20) }, context);
    expect(oversized.ok).toBe(true);
    if (oversized.ok) {
      expect(oversized.response.message).not.toContain("…");
      expect(oversized.response.message!.split(/\s+/).length).toBeLessThanOrEqual(20);
      expect(oversized.response.message!.length).toBeLessThanOrEqual(140);
      expect(oversized.response.message).toMatch(/underside or stem\.$/);
    }

    expect(verifyPromptfooOutput(JSON.stringify(abstention), { vars: groundTruth }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify(uncertainPick), { vars: groundTruth }).pass).toBe(false);
    const result = verifyAndResolveScanResponse(uncertainPick, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response).toMatchObject({ ...abstention, message: expect.stringContaining("cannot confidently choose") });

    for (const prompt of [v1PromptConfig.buildUserPrompt(request), v1PromptConfig.buildRepairPrompt!(request, ["winnerId missing"])]) {
      expect(prompt).toContain("EVIDENCE CHECK FIRST");
      expect(prompt).toContain("including during repair");
      expect(prompt).not.toMatch(/\b30\b/);
      if (request.round > 1) expect(prompt).toContain("CURRENT PHOTO OVERRIDES MEMORY");
    }
    expect(v1PromptConfig.buildSystemPrompt(request)).toContain("OVERRIDES ALL RANKING INSTRUCTIONS");
    expect(v1PromptConfig.buildSystemPrompt(request)).not.toMatch(/\b30\b/);
    if (request.round === 1) {
      expect(v1PromptConfig.buildUserPrompt(request)).toContain("FINAL COVERAGE AUDIT");
      expect(v1PromptConfig.buildSystemPrompt(request)).toContain("visible traits relevant to the identified produce type and variety");
    }
  });

  it.each(["produce", "candidates", "verdict", "afterPurchase"] as const)("rejects abstention leaking %s", (field) => {
    const result = verifyPromptfooOutput(JSON.stringify({ ...abstention, [field]: uncertainPick[field] }), {
      vars: { round: 1, expectedStatus: "insufficient_evidence" },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("must abstain");
  });
});


describe("polygon selection cannot force an unsupported winner", () => {
  const scenario = manifest.find((entry) => entry.id === "19-round1-insufficient-evidence-polygon")!;
  it("accepts an actionable abstention and rejects a scored selection", () => {
    expect(verifyPromptfooOutput(JSON.stringify(abstention), { vars: scenario.groundTruth }).pass).toBe(true);
    expect(verifyPromptfooOutput(JSON.stringify({ ...uncertainPick, verdict: { ...uncertainPick.verdict, confidence: "high" } }), { vars: scenario.groundTruth }).pass).toBe(false);
  });
});
