import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { PomonaApp } from "../src/App";
import type { TelemetryProvider } from "../src/lib/telemetry";
import type { DeepScanResponse } from "@pomona/contract";
import "../src/i18n";

const insufficientLastResponse = {
  schemaVersion: "1.0" as const,
  promptVersion: "v1",
  modelId: "test",
  round: 1 as const,
  status: "insufficient_evidence" as const,
  abstentionReason: "missing_evidence" as const,
  message: "I cannot confidently choose.",
  produce: null,
  candidates: [],
  verdict: null,
  followUp: null,
  afterPurchase: null,
};

const dsConfident: DeepScanResponse = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "test-model",
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  ripeness: { state: "nearly_ripe", confidence: 0.86 },
  evidence: ["Skin losing green"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: null,
  afterPurchase: null,
};

const fakeCollect = () =>
  Promise.resolve(
    [0, 1, 2].map((i) => ({
      sequence: i,
      gray: new Float32Array(8 * 6).map((_, j) => (j % 2 === 0 ? 60 : 200)),
      grayW: 8,
      grayH: 6,
      thumb: new Float32Array(8 * 6).map((_, j) => (j % 2 === 0 ? 40 + i * 50 : 210)),
      dataUrl: `data:image/jpeg;base64,Q0FQ${i}`,
    }))
  );

const fakeBuild = () => Promise.resolve({ dataUrl: "data:image/jpeg;base64,QUJD", tileCount: 3, bytes: 4000 });

function recordingTelemetry(): { provider: TelemetryProvider; events: { name: string; props?: Record<string, unknown> }[] } {
  const events: { name: string; props?: Record<string, unknown> }[] = [];
  return {
    events,
    provider: {
      capture: (name, props) => events.push({ name, props }),
      identify: () => {},
      captureException: () => {},
    },
  };
}

const failingClient = {
  getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
  overrideQuota: vi.fn(),
  submitScan: vi.fn().mockRejectedValue(new Error("should not be called")),
  submitDeepScan: vi.fn(),
};

describe("Deep Scan real triggers + telemetry", () => {
  it("runs the whole flow from the insufficient-trigger CTA and records started/completed/accepted", async () => {
    const { events, provider } = recordingTelemetry();
    const submitDeepScan = vi.fn().mockResolvedValue(dsConfident);
    render(
      <PomonaApp
        apiClient={{ ...failingClient, submitDeepScan } as any}
        telemetry={provider}
        deepScanCollect={fakeCollect}
        deepScanBuild={fakeBuild}
        initialState={{ phase: "S_ScanError", status: "insufficient_evidence", errorMessage: null, lastResponse: insufficientLastResponse }}
        enableDebugOverride={false}
      />
    );

    fireEvent.click(screen.getByTestId("error-deep-scan-cta"));
    expect(await screen.findByTestId("stage-S_DS_Capture")).toBeTruthy();

    fireEvent.click(screen.getByTestId("ds-go-button"));
    expect(await screen.findByTestId("stage-S_DS_Result")).toBeTruthy();
    expect(screen.getByTestId("ds-verdict-card")).toBeInTheDocument();
    expect(submitDeepScan).toHaveBeenCalledTimes(1);
    expect((submitDeepScan.mock.calls[0][0] as { sampleCount: number }).sampleCount).toBe(3);

    fireEvent.click(screen.getByTestId("ds-new-scan-cta"));
    expect(await screen.findByTestId("stage-S1_LiveCamera")).toBeTruthy();

    const names = events.filter((e) => e.name.startsWith("deep_scan_")).map((e) => e.name);
    expect(names).toEqual(["deep_scan_started", "deep_scan_completed", "deep_scan_accepted"]);
    const started = events.find((e) => e.name === "deep_scan_started");
    expect(started!.props).toMatchObject({ origin: "insufficient" });
    expect(events.find((e) => e.name === "deep_scan_completed")!.props).toMatchObject({ status: "ok" });
  });

  it("records deep_scan_abandoned when the user leaves capture and returns to the entry surface", async () => {
    const { events, provider } = recordingTelemetry();
    render(
      <PomonaApp
        apiClient={failingClient as any}
        telemetry={provider}
        deepScanCollect={fakeCollect}
        deepScanBuild={fakeBuild}
        initialState={{ phase: "S_ScanError", status: "insufficient_evidence", errorMessage: null, lastResponse: insufficientLastResponse }}
        enableDebugOverride={false}
      />
    );

    fireEvent.click(screen.getByTestId("error-deep-scan-cta"));
    expect(await screen.findByTestId("stage-S_DS_Capture")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ds-cancel-button"));
    expect(await screen.findByTestId("stage-S_ScanError")).toBeTruthy();

    const names = events.filter((e) => e.name.startsWith("deep_scan_")).map((e) => e.name);
    expect(names).toEqual(["deep_scan_started", "deep_scan_abandoned"]);
  });

  it("records deep_scan_rescanned after a failed deep scan", async () => {
    const { events, provider } = recordingTelemetry();
    const submitDeepScan = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <PomonaApp
        apiClient={{ ...failingClient, submitDeepScan } as any}
        telemetry={provider}
        deepScanCollect={fakeCollect}
        deepScanBuild={fakeBuild}
        initialState={{ phase: "S_ScanError", status: "insufficient_evidence", errorMessage: null, lastResponse: insufficientLastResponse }}
        enableDebugOverride={false}
      />
    );

    fireEvent.click(screen.getByTestId("error-deep-scan-cta"));
    fireEvent.click(screen.getByTestId("ds-go-button"));
    expect(await screen.findByTestId("stage-S_DS_Result")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ds-new-scan-cta"));

    const names = events.filter((e) => e.name.startsWith("deep_scan_")).map((e) => e.name);
    expect(names).toEqual(["deep_scan_started", "deep_scan_rescanned"]);
  });
});
