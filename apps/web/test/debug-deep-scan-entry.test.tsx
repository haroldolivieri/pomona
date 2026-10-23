import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PomonaApp } from "../src/App";
import type { TelemetryProvider } from "../src/lib/telemetry";
import "../src/i18n";

beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
});

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

const stubClient = {
  getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
  overrideQuota: vi.fn(),
  submitScan: vi.fn().mockRejectedValue(new Error("should not be called")),
  submitDeepScan: vi.fn(),
};

describe("Debug deep-scan entry", () => {
  it("shows the ✦ Precise scan shortcut in the debug row only for debug users", () => {
    const withDebug = render(<PomonaApp apiClient={stubClient as any} telemetry={recordingTelemetry().provider} enableDebugOverride={true} />);
    expect(withDebug.getByTestId("dev-deep-scan-button")).toBeInTheDocument();
    withDebug.unmount();

    const withoutDebug = render(<PomonaApp apiClient={stubClient as any} telemetry={recordingTelemetry().provider} enableDebugOverride={false} />);
    expect(withoutDebug.queryByTestId("dev-deep-scan-button")).not.toBeInTheDocument();
  });

  it("jumps straight from the live camera to deep-scan capture via the debug shortcut", async () => {
    const { events, provider } = recordingTelemetry();
    render(<PomonaApp apiClient={stubClient as any} telemetry={provider} enableDebugOverride={true} />);

    fireEvent.click(screen.getByTestId("dev-deep-scan-button"));
    expect(await screen.findByTestId("stage-S_DS_Capture")).toBeTruthy();
    expect(screen.getByTestId("ds-oval")).toBeInTheDocument();

    const started = events.find((e) => e.name === "deep_scan_started");
    expect(started!.props).toMatchObject({ origin: "debug" });
  });

  it("returns to the live camera when capture is cancelled from the debug entry (origin debug)", async () => {
    const { events, provider } = recordingTelemetry();
    render(<PomonaApp apiClient={stubClient as any} telemetry={provider} enableDebugOverride={true} />);

    fireEvent.click(screen.getByTestId("dev-deep-scan-button"));
    expect(await screen.findByTestId("stage-S_DS_Capture")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ds-cancel-button"));
    await waitFor(() => expect(screen.getByTestId("stage-S1_LiveCamera")).toBeTruthy());

    const names = events.filter((e) => e.name.startsWith("deep_scan_")).map((e) => e.name);
    expect(names).toEqual(["deep_scan_started", "deep_scan_abandoned"]);
  });

  it("does not re-trigger the deep scan while already inside one of its phases", async () => {
    const { events, provider } = recordingTelemetry();
    render(
      <PomonaApp
        apiClient={stubClient as any}
        telemetry={provider}
        initialState={{ phase: "S_DS_Capture", status: null, errorMessage: null, dsOrigin: "debug" }}
        enableDebugOverride={true}
      />
    );
    expect(screen.getByTestId("stage-S_DS_Capture")).toBeTruthy();
    fireEvent.click(screen.getByTestId("dev-deep-scan-button"));
    expect(await screen.findByTestId("stage-S_DS_Capture")).toBeTruthy();
    expect(events.filter((e) => e.name === "deep_scan_started")).toHaveLength(0);
  });

  it("mock mode accepts even a dark, unusable capture and reaches the mocked result", async () => {
    localStorage.setItem("pomona-mock-mode", "true");
    try {
      await runDarkCaptureFlow();
    } finally {
      localStorage.removeItem("pomona-mock-mode");
    }
  });

  async function runDarkCaptureFlow() {
    render(
      <PomonaApp
        apiClient={stubClient as any}
        telemetry={recordingTelemetry().provider}
        enableDebugOverride={true}
        deepScanCollect={async (video) => {
          void video;
          return [0, 1, 2].map((i) => ({
            sequence: i,
            gray: new Float32Array(24 * 24).fill(4), // nearly black: real screening would reject
            grayW: 24,
            grayH: 24,
            thumb: new Float32Array(24 * 24).fill(4),
            dataUrl: `data:image/png;base64,DARK${i}`,
          }));
        }}
        deepScanBuild={fakeBuild}
      />
    );

    fireEvent.click(screen.getByTestId("dev-deep-scan-button"));
    expect(await screen.findByTestId("stage-S_DS_Capture")).toBeTruthy();
    const analysingPromise = screen.findByTestId("stage-S_DS_Analysing");
    fireEvent.click(screen.getByTestId("ds-go-button"));
    await analysingPromise;
    await waitFor(() => expect(screen.getByTestId("ds-analysing-oval")).toBeInTheDocument());
    expect(screen.getByTestId("ds-scanning-beam")).toBeInTheDocument();
    await screen.findByTestId("stage-S_DS_Result", {}, { timeout: 5000 });
    expect(screen.getByTestId("ds-verdict-card")).toBeInTheDocument(); // mocked canned data
  }
});

const fakeBuild = async () => ({ dataUrl: "data:image/png;base64,QUJD", tileCount: 3, bytes: 4000 });
