import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DeepScanResultStage } from "../../src/components/DeepScanResultStage";
import type { DeepScanResponse } from "@pomona/contract";
import "../../src/i18n";

const confident: DeepScanResponse = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "test-model",
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Avocado", variety: "Hass" },
  ripeness: { state: "nearly_ripe", confidence: 0.86 },
  evidence: ["View 1: skin losing green", "View 4: even color", "View 6: slight sheen"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: { eatWhen: "in_a_few_days" },
};

const checks: DeepScanResponse = {
  ...confident,
  status: "insufficient_evidence",
  abstentionReason: "same_side_only",
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  ripeness: { state: "unknown", confidence: 0.3 },
  evidence: [],
  quality: { sufficientVisualEvidence: false, viewCoverage: "fair", reason: null },
  message: null,
  manualChecks: [
    { trait: "Squeeze test", how: "Press gently near the stem", whatItMeans: "Slight give = ready soon" },
    { trait: "Weight check", how: "Hold in palm", whatItMeans: "Heavy for size = juicy" },
  ],
  recommendation: null,
};

describe("DeepScanResultStage", () => {
  it("renders the verdict card with produce, state label, confidence, and evidence", () => {
    render(<DeepScanResultStage response={confident} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("stage-S_DS_Result")).toBeInTheDocument();
    expect(screen.getByTestId("ds-verdict-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Avocado");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Nearly ready");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("86%");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("View 1: skin losing green");
    expect(screen.queryByTestId("ds-manual-checks")).not.toBeInTheDocument();
  });

  it("never co-renders manual checks with a confident verdict", () => {
    const padded: DeepScanResponse = {
      ...confident,
      manualChecks: [{ trait: "Squeeze", how: "h", whatItMeans: "m" }],
    };
    render(<DeepScanResultStage response={padded} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-verdict-card")).toBeInTheDocument();
    expect(screen.queryByTestId("ds-manual-checks")).not.toBeInTheDocument();
  });

  it("renders the not-enough-evidence card with the manual-touch header", () => {
    render(<DeepScanResultStage response={checks} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-not-enough-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-not-enough-card")).toHaveTextContent(
      "The views mostly show the same side"
    );
    expect(screen.getByTestId("ds-manual-checks")).toBeInTheDocument();
    expect(screen.getByTestId("ds-manual-checks")).toHaveTextContent(
      "Check it by touch (while you're at it)"
    );
    expect(screen.getByTestId("ds-manual-checks")).toHaveTextContent("Squeeze test");
    expect(screen.getByTestId("ds-manual-checks")).toHaveTextContent("Weight check");
    expect(screen.queryByTestId("ds-verdict-card")).not.toBeInTheDocument();
  });

  it("renders the failure card from a null envelope with the machine message", () => {
    render(<DeepScanResultStage response={null} errorMessage="Deep scan unavailable. Try again later." onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-failure-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(
      "Deep scan unavailable. Try again later."
    );
    expect(screen.queryByTestId("ds-manual-checks")).not.toBeInTheDocument();
  });

  it("every outcome ends at the Start a new scan CTA", () => {
    const onNewScan = vi.fn();
    const { rerender } = render(
      <DeepScanResultStage response={confident} errorMessage={null} onNewScan={onNewScan} />
    );
    screen.getByTestId("ds-new-scan-cta").click();
    expect(onNewScan).toHaveBeenCalledTimes(1);

    rerender(<DeepScanResultStage response={checks} errorMessage={null} onNewScan={onNewScan} />);
    screen.getByTestId("ds-new-scan-cta").click();
    expect(onNewScan).toHaveBeenCalledTimes(2);

    rerender(<DeepScanResultStage response={null} errorMessage="x" onNewScan={onNewScan} />);
    screen.getByTestId("ds-new-scan-cta").click();
    expect(onNewScan).toHaveBeenCalledTimes(3);
  });
});
