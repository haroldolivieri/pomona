import { describe, expect, it } from "vitest";
import {
  initialScanMachineState,
  scanMachineReducer,
  buildFollowUpRequestContext,
} from "../src/state/scan-state-machine";
import type { ScanResponse } from "@pomona/contract";

const makeRound1Response = (): ScanResponse => ({
  schemaVersion: "1.0",
  promptVersion: "v1",
  modelId: "gemini-2.5-flash",
  round: 1,
  status: "ok",
  message: null,
  produce: { type: "watermelon", displayName: "Watermelon", variety: null },
  candidates: [
    { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot", "Matte rind"], flipSummary: null },
    { id: "c2", box: [380, 645, 590, 925], score: 8.1, ripeness: "almost_ripe", traits: ["Matte rind"], flipSummary: null },
  ],
  verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
  followUp: {
    targetCandidateId: "c2",
    targetRole: "runner_up",
    bannerText: "The blue-marked Watermelon could be sweeter. Flip it and snap.",
    flipHeadline: "Flip the Watermelon over",
    instruction: "Turn the blue-marked Watermelon to show its underside.",
  },
  afterPurchase: {
    readyInDays: { min: 0, max: 0 },
    eatWithinDays: { min: 3, max: 5 },
    eatWithinLabel: "3–5 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
    },
  },
});

describe("10-state ScanStateMachine", () => {
  it("transitions S1 -> S2 -> S3 -> S4 -> S5A -> S5B1_RunnerUpBeaten when Runner-Up scores <= 1st Pick (7.2 vs 8.6)", () => {
    let s = initialScanMachineState();
    expect(s.phase).toBe("S1_LiveCamera");

    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    expect(s.phase).toBe("S2_DrawFocusArea");

    s = scanMachineReducer(s, {
      type: "START_ANALYSE",
      focusPolygon: [[100, 100], [900, 100], [900, 900], [100, 900]],
      cropRect: { x: 0, y: 0, width: 1000, height: 1000 },
    });
    expect(s.phase).toBe("S3_Analysing");

    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    expect(s.phase).toBe("S4_InitialResult");
    expect(s.firstPick?.score).toBe(8.6);
    expect(s.runnerUp?.score).toBe(8.1);

    s = scanMachineReducer(s, { type: "COMPARE_WITH_RUNNER_UP" });
    expect(s.phase).toBe("S5A_FlipRunnerUpCamera");
    expect(buildFollowUpRequestContext(s)?.targetRole).toBe("runner_up");

    s = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r2" });
    expect(s.phase).toBe("S3_Analysing");

    const r2Beaten: ScanResponse = {
      ...makeRound1Response(),
      round: 2,
      candidates: [{ id: "c2", box: [200, 200, 800, 800], score: 7.2, ripeness: "almost_ripe", traits: ["Pale spot"], flipSummary: "pale underside" }],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: null,
    };
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: r2Beaten });
    expect(s.phase).toBe("S5B1_RunnerUpBeaten");
    expect(s.firstPick?.score).toBe(8.6);
    expect(s.runnerUp?.score).toBe(7.2);
  });

  it("handles tie score in Round 2 (8.6 vs 8.6) as S5B1_RunnerUpBeaten", () => {
    let s = initialScanMachineState();
    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, { type: "START_ANALYSE", focusPolygon: null, cropRect: { x: 0, y: 0, width: 1000, height: 1000 } });
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    s = scanMachineReducer(s, { type: "COMPARE_WITH_RUNNER_UP" });
    s = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r2" });

    const r2Tie: ScanResponse = {
      ...makeRound1Response(),
      round: 2,
      candidates: [{ id: "c2", box: [200, 200, 800, 800], score: 8.6, ripeness: "ripe", traits: ["Good spot"], flipSummary: "good spot" }],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: null,
    };
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: r2Tie });
    expect(s.phase).toBe("S5B1_RunnerUpBeaten");
    expect(s.runnerUp?.score).toBe(8.6);
    expect(s.firstPick?.score).toBe(8.6);
  });

  it("transitions S5A -> S5B2_RunnerUpTookLead (9.0 vs 8.6) -> S6 -> S7A_FirstPickWonFinal (9.3 vs 9.0) and S7B_FirstPickLostFinal (8.4 vs 9.0)", () => {
    let s = initialScanMachineState();
    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, { type: "START_ANALYSE", focusPolygon: null, cropRect: { x: 0, y: 0, width: 1000, height: 1000 } });
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    s = scanMachineReducer(s, { type: "COMPARE_WITH_RUNNER_UP" });
    s = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r2" });

    const r2Lead: ScanResponse = {
      ...makeRound1Response(),
      round: 2,
      candidates: [{ id: "c2", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot", "Rich webbing"], flipSummary: "deep creamy spot" }],
      verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
      followUp: {
        targetCandidateId: "c1",
        targetRole: "first_pick",
        bannerText: "1st Pick (8.6) was only graded from the top.",
        flipHeadline: "Flip your 1st pick over",
        instruction: "Turn the yellow-marked Watermelon to show its underside.",
      },
    };
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: r2Lead });
    expect(s.phase).toBe("S5B2_RunnerUpTookLead");
    expect(s.runnerUp?.score).toBe(9.0);
    expect(s.firstPick?.score).toBe(8.6);

    s = scanMachineReducer(s, { type: "START_FINAL_CHECK_ON_FIRST_PICK" });
    expect(s.phase).toBe("S6_FlipFirstPickCamera");
    expect(buildFollowUpRequestContext(s)?.targetRole).toBe("first_pick");

    const sCapturing = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r3" });
    expect(sCapturing.phase).toBe("S3_Analysing");

    // Branch A: 1st Pick reclaims win (9.3 >= 9.0)
    const r3Won: ScanResponse = {
      ...makeRound1Response(),
      round: 3,
      candidates: [{ id: "c1", box: [200, 200, 800, 800], score: 9.3, ripeness: "ripe", traits: ["Golden field spot", "Heavy webbing"], flipSummary: "golden spot" }],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: null,
    };
    const s7A = scanMachineReducer(sCapturing, { type: "SCAN_SUCCEEDED", response: r3Won });
    expect(s7A.phase).toBe("S7A_FirstPickWonFinal");
    expect(s7A.firstPick?.score).toBe(9.3);

    // Branch B: 1st Pick loses final check (8.4 < 9.0)
    const r3Lost: ScanResponse = {
      ...makeRound1Response(),
      round: 3,
      candidates: [{ id: "c1", box: [200, 200, 800, 800], score: 8.4, ripeness: "ripe", traits: ["Small spot"], flipSummary: "smaller spot" }],
      verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy the new winner." },
      followUp: null,
    };
    const s7B = scanMachineReducer(sCapturing, { type: "SCAN_SUCCEEDED", response: r3Lost });
    expect(s7B.phase).toBe("S7B_FirstPickLostFinal");
    expect(s7B.runnerUp?.score).toBe(9.0);
    expect(s7B.firstPick?.score).toBe(8.4);

    // Branch C: Tie in Round 3 (9.0 === 9.0) -> 1st Pick reclaims win (firstPick >= runnerUp)
    const r3Tie: ScanResponse = {
      ...makeRound1Response(),
      round: 3,
      candidates: [{ id: "c1", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Equal score"], flipSummary: "equal" }],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: null,
    };
    const s7ATie = scanMachineReducer(sCapturing, { type: "SCAN_SUCCEEDED", response: r3Tie });
    expect(s7ATie.phase).toBe("S7A_FirstPickWonFinal");
    expect(s7ATie.firstPick?.score).toBe(9.0);
  });

  it("handles non-ok scan responses or SCAN_FAILED error and reset", () => {
    let s = initialScanMachineState();
    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, { type: "START_ANALYSE", focusPolygon: null, cropRect: null });
    expect(s.phase).toBe("S3_Analysing");

    // SCAN_FAILED transitions to S_ScanError
    const failedState = scanMachineReducer(s, { type: "SCAN_FAILED", error: "Network error" });
    expect(failedState.phase).toBe("S_ScanError");
    expect(failedState.errorMessage).toBe("Network error");

    // RESET returns to S1_LiveCamera
    const resetState = scanMachineReducer(failedState, { type: "RESET" });
    expect(resetState.phase).toBe("S1_LiveCamera");
    expect(resetState.firstPick).toBeNull();
    expect(resetState.runnerUp).toBeNull();
    expect(resetState.round1PhotoDataUrl).toBeNull();
    expect(resetState.errorMessage).toBeNull();
  });

  it("handles non-ok scan status in SCAN_SUCCEEDED by transitioning to S_ScanError", () => {
    let s = initialScanMachineState();
    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, { type: "START_ANALYSE", focusPolygon: null, cropRect: null });

    const noProduceResp: ScanResponse = {
      schemaVersion: "1.0",
      promptVersion: "v1",
      modelId: "gemini-2.5-flash",
      round: 1,
      status: "no_produce",
      message: "No fruit found in frame.",
      produce: null,
      candidates: [],
      verdict: null,
      followUp: null,
      afterPurchase: null,
    };

    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: noProduceResp });
    expect(s.phase).toBe("S_ScanError");
    expect(s.status).toBe("no_produce");
    expect(s.errorMessage).toBe("No fruit found in frame.");

    // Dismissing error returns to S1_LiveCamera
    const dismissed = scanMachineReducer(s, { type: "DISMISS_ERROR" });
    expect(dismissed.phase).toBe("S1_LiveCamera");
    expect(dismissed.status).toBeNull();
  });

  it("remaps candidate bounding boxes from cropRect to full-frame on Round 1", () => {
    let s = initialScanMachineState();
    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, {
      type: "START_ANALYSE",
      focusPolygon: null,
      cropRect: { x: 200, y: 100, width: 500, height: 600 },
    });
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    expect(s.phase).toBe("S4_InitialResult");
    // cropRect x=200, y=100, width=500, height=600
    // c1 box: [385, 370, 625, 655]
    // ymin: 100 + 0.385 * 600 = 100 + 231 = 331
    // xmin: 200 + 0.370 * 500 = 200 + 185 = 385
    // ymax: 100 + 0.625 * 600 = 100 + 375 = 475
    // xmax: 200 + 0.655 * 500 = 200 + 327.5 = 528 (rounded)
    expect(s.firstPick?.box).toEqual([331, 385, 475, 528]);
  });

  it("handles SET_TARGET_RIPENESS event in S4_InitialResult and propagates target to followUpContext", () => {
    let s = initialScanMachineState();
    expect(s.targetRipeness).toBe("ready_now");

    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, { type: "START_ANALYSE", focusPolygon: null, cropRect: null });
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    expect(s.phase).toBe("S4_InitialResult");
    expect(s.firstPick?.id).toBe("c1"); // ripe watermelon
    expect(s.runnerUp?.id).toBe("c2"); // almost_ripe watermelon

    // Switch to "in_2_3_days"
    s = scanMachineReducer(s, { type: "SET_TARGET_RIPENESS", targetRipeness: "in_2_3_days" });
    expect(s.targetRipeness).toBe("in_2_3_days");
    // Under in_2_3_days, c2 (almost_ripe) is ranked first
    expect(s.firstPick?.id).toBe("c2");
    expect(s.runnerUp?.id).toBe("c1");
    // Verify followUp bannerText updated to in_2_3_days override
    expect(s.lastResponse?.followUp?.bannerText).toBe("Check underside before storing for 2–3 days");

    // Switch to "later_this_week"
    s = scanMachineReducer(s, { type: "SET_TARGET_RIPENESS", targetRipeness: "later_this_week" });
    expect(s.targetRipeness).toBe("later_this_week");
    expect(s.lastResponse?.followUp?.bannerText).toBe("Check underside for bruises before long storage");

    // Switch back to "ready_now" - restores original bannerText
    s = scanMachineReducer(s, { type: "SET_TARGET_RIPENESS", targetRipeness: "ready_now" });
    expect(s.targetRipeness).toBe("ready_now");
    expect(s.lastResponse?.followUp?.bannerText).toBe(makeRound1Response().followUp?.bannerText);

    // Switch again to "in_2_3_days" for subsequent steps
    s = scanMachineReducer(s, { type: "SET_TARGET_RIPENESS", targetRipeness: "in_2_3_days" });

    // Verify ALL candidates in lastResponse have updated contextual suitability scores
    const c1InLastResp = s.lastResponse?.candidates.find((c) => c.id === "c1");
    const c2InLastResp = s.lastResponse?.candidates.find((c) => c.id === "c2");
    expect(c1InLastResp?.score).toBe(s.runnerUp?.score);
    expect(c2InLastResp?.score).toBe(s.firstPick?.score);

    // Transitioning to S5A preserves targetRipeness and includes it in followUpContext
    s = scanMachineReducer(s, { type: "COMPARE_WITH_RUNNER_UP" });
    expect(s.phase).toBe("S5A_FlipRunnerUpCamera");
    expect(s.targetRipeness).toBe("in_2_3_days");
    const followUpCtx = buildFollowUpRequestContext(s);
    expect(followUpCtx?.targetRipeness).toBe("in_2_3_days");
    expect(followUpCtx?.previousWinner.id).toBe("c2");

    // RESET restores targetRipeness to ready_now
    s = scanMachineReducer(s, { type: "RESET" });
    expect(s.targetRipeness).toBe("ready_now");
  });
});
