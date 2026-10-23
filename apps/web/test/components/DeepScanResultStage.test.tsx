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
  evidence: ["Skin losing green", "Tile 4: even color", "Slight sheen near the stem"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: { eatWhen: "in_a_few_days" },
  afterPurchase: {
    readyInDays: { min: 1, max: 2 },
    eatWithinDays: { min: 3, max: 4 },
    eatWithinLabel: "3-4 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole on the counter", tip: "Softens daily" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Sealed in the fridge", tip: "Keep chilled" },
    },
  },
  seasonality: {
    produceSlug: "avocado",
    month: 10,
    shopperCountry: "US",
    shopperZone: "MIDWEST",
    status: "peak",
    peakWindowLabel: "Oct-Jan",
    badgeText: "Peak season",
    noteText: "Best value right now",
    origins: [],
  },
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
  afterPurchase: null,
};

describe("DeepScanResultStage", () => {
  it("renders the verdict card with produce, state label, confidence, and evidence", () => {
    render(<DeepScanResultStage response={confident} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("stage-S_DS_Result")).toBeInTheDocument();
    expect(screen.getByTestId("ds-verdict-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Avocado");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Nearly ready");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("86%");
    // Traits surface as chips (like the original scan result); view/tile framing is never shown.
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Skin losing green");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("even color");
    expect(document.body.textContent).not.toMatch(/\bview \d\b/i);
    expect(document.body.textContent).not.toMatch(/\btile \d\b/i);
    // Same result cards as the original scan: eat within X days + storage + seasonality.
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Eat within");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("3-4 days");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Before cut");
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("After cut");
    expect(screen.getByTestId("seasonality-panel")).toBeInTheDocument();
    expect(screen.getByTestId("ds-verdict-card")).toHaveTextContent("Peak season");
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
      "Most of the fruit sides were not captured"
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
