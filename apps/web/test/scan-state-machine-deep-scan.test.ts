import { describe, expect, it } from "vitest";
import {
  initialScanMachineState,
  scanMachineReducer,
  type ScanMachineAction,
} from "../src/state/scan-state-machine";
import { uiCopy } from "../src/i18n/copy";
import type { DeepScanResponse } from "@pomona/contract";

const dsResponse: DeepScanResponse = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "test-model",
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  ripeness: { state: "nearly_ripe", confidence: 0.85 },
  evidence: ["color lift"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: null,
  afterPurchase: null,
};

const composite = { dataUrl: "data:image/jpeg;base64,QUJD", tileCount: 6 };
const stats = { rejectedBlur: 3, rejectedExposure: 2, rejectedSimilarity: 14 };

function run(state: ReturnType<typeof initialScanMachineState>, action: ScanMachineAction) {
  return scanMachineReducer(state, action);
}

describe("deep scan state machine phases", () => {
  it("ENTER_DEEP_SCAN opens the DS capture phase and records the origin", () => {
    const next = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    expect(next.phase).toBe("S_DS_Capture");
    expect(next.dsOrigin).toBe("insufficient");
    expect(next.dsComposite).toBeNull();
    expect(next.dsResult).toBeNull();
    expect(next.dsSampleMeta).toBeNull();
  });

  it("DS_CAPTURE_REJECTED stays on the capture phase with localized copy", () => {
    const entered = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "tie" });
    const rejected = run(entered, { type: "DS_CAPTURE_REJECTED", reason: "all_blurry" });
    expect(rejected.phase).toBe("S_DS_Capture");
    expect(rejected.errorMessage).toBe(uiCopy("deepScan.localTooBlurry"));
    const dark = run(entered, { type: "DS_CAPTURE_REJECTED", reason: "too_dark_or_bright" });
    expect(dark.errorMessage).toBe(uiCopy("deepScan.localTooDark"));
    expect(rejected.dsOrigin).toBe("tie");
  });

  it("DS_CAPTURE_COMPLETED moves to analysing with composite telemetry", () => {
    const entered = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    const done = run(entered, { type: "DS_CAPTURE_COMPLETED", composite, sampleCount: 25, stats });
    expect(done.phase).toBe("S_DS_Analysing");
    expect(done.dsComposite).toEqual(composite);
    expect(done.dsSampleMeta).toEqual({ sampleCount: 25, stats });
    expect(done.errorMessage).toBeNull();
  });

  it("DS_SCAN_SUCCEEDED lands on the DS result phase with the envelope", () => {
    const analysing = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    const analysingDone = run(analysing, { type: "DS_CAPTURE_COMPLETED", composite, sampleCount: 25, stats });
    const succeeded = run(analysingDone, { type: "DS_SCAN_SUCCEEDED", response: dsResponse });
    expect(succeeded.phase).toBe("S_DS_Result");
    expect(succeeded.dsResult).toEqual(dsResponse);
  });

  it("DS_SCAN_FAILED lands on the DS result phase in failure shape", () => {
    const entered = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    const failed = run(entered, { type: "DS_SCAN_FAILED", error: "Deep scan unavailable. Try again later." });
    expect(failed.phase).toBe("S_DS_Result");
    expect(failed.dsResult).toBeNull();
    expect(failed.status).toBe("analysis_failed");
    expect(failed.errorMessage).toBe("Deep scan unavailable. Try again later.");
  });

  it("DS_CANCEL returns to the origin surface from every DS phase", () => {
    const fromCapture = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "tie" });
    expect(run(fromCapture, { type: "DS_CANCEL" }).phase).toBe("S5B1_RunnerUpBeaten");
    const analysing = run(fromCapture, { type: "DS_CAPTURE_COMPLETED", composite, sampleCount: 25, stats });
    expect(run(analysing, { type: "DS_CANCEL" }).phase).toBe("S5B1_RunnerUpBeaten");
    const fromResult = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    expect(run(fromResult, { type: "DS_CANCEL" }).phase).toBe("S_ScanError");
    const bannerEntry = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "result_banner" });
    expect(run(bannerEntry, { type: "DS_CANCEL" }).phase).toBe("S4_InitialResult");
    const bare = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    bare.dsOrigin = null;
    expect(run(bare, { type: "DS_CANCEL" }).phase).toBe("S1_LiveCamera");
  });

  it("leaves round logic untouched while DS phases are active", () => {
    const entered = run(initialScanMachineState(), { type: "ENTER_DEEP_SCAN", origin: "insufficient" });
    expect(entered.round).toBe(1);
    expect(entered.lastResponse).toBeNull();
    const done = run(entered, { type: "DS_CAPTURE_COMPLETED", composite, sampleCount: 25, stats });
    expect(done.allCandidatesRound1).toEqual([]);
  });
});
