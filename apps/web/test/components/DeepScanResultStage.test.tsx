import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
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
    const headline = screen.getByRole("heading", { level: 1 });
    expect(headline).toHaveTextContent("Nearly ready");
    expect(headline.textContent?.trim()).toBe("Nearly ready");
    expect(screen.getByTestId("circular-score-meter")).toHaveTextContent("8.6"); // confidence 86% on the same 0..10 meter as the original result
    expect(screen.getByTestId("circular-score-meter")).toBeInTheDocument();
    expect(screen.getByTestId("ds-visual-score-label")).toHaveTextContent("Visual score");
    // Same contextual top bar as the original scan result (close ✕ / produce chip / retake ↻).
    expect(screen.getByTestId("close-button")).toBeInTheDocument();
    expect(screen.getByTestId("close-button")).toHaveAttribute("aria-label");
    expect(screen.getByTestId("produce-name-chip")).toBeInTheDocument();
    expect(screen.getByTestId("retake-button")).toBeInTheDocument();
    expect(screen.getByTestId("retake-button")).toHaveAttribute("aria-label");
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

    // Peak ripeness timing displayed in peek badge and storage card
    expect(screen.getByTestId("ds-peak-ripeness-badge")).toBeInTheDocument();
    expect(screen.getByTestId("ds-peak-ripeness-badge")).toHaveTextContent("Peak ripeness: In 1-2 days");
    expect(screen.getByTestId("storage-peak-ripeness-card")).toBeInTheDocument();
    expect(screen.getByTestId("storage-peak-ripeness-card")).toHaveTextContent("In 1-2 days");
  });

  it("formats peak ripeness for ready now (min=0, max=0)", () => {
    const readyNowResp: DeepScanResponse = {
      ...confident,
      ripeness: { state: "ripe", confidence: 0.95 },
      afterPurchase: {
        ...confident.afterPurchase!,
        readyInDays: { min: 0, max: 0 },
      },
    };
    render(<DeepScanResultStage response={readyNowResp} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-peak-ripeness-badge")).toHaveTextContent("Peak ripeness: Ready now");
    expect(screen.getByTestId("storage-peak-ripeness-card")).toHaveTextContent("Ready now");
  });

  it("formats peak ripeness for past peak / overripe and renders a low visual score", () => {
    const overripeResp: DeepScanResponse = {
      ...confident,
      ripeness: { state: "overripe", confidence: 0.95 },
      recommendation: { eatWhen: "avoid" },
    };
    render(<DeepScanResultStage response={overripeResp} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-peak-ripeness-badge")).toHaveTextContent("Peak ripeness: Past peak");
    expect(screen.getByTestId("storage-peak-ripeness-card")).toHaveTextContent("Past peak");
    expect(screen.getByTestId("circular-score-meter")).toHaveTextContent("2.9");
  });

  it("falls back to recommendation when afterPurchase is absent", () => {
    const fallbackResp: DeepScanResponse = {
      ...confident,
      afterPurchase: null,
      recommendation: { eatWhen: "today_or_tomorrow" },
    };
    render(<DeepScanResultStage response={fallbackResp} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-peak-ripeness-badge")).toHaveTextContent("Peak ripeness: Today or tomorrow");
    expect(screen.getByTestId("ds-recommendation-card")).toHaveTextContent("Today or tomorrow");
  });

  it("falls back to ripeness state when afterPurchase and recommendation are absent", () => {
    const stateOnlyResp: DeepScanResponse = {
      ...confident,
      afterPurchase: null,
      recommendation: null,
      ripeness: { state: "unripe", confidence: 0.75 },
    };
    render(<DeepScanResultStage response={stateOnlyResp} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("ds-peak-ripeness-badge")).toHaveTextContent("Peak ripeness: In a few days");
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
    expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "search");
    expect(screen.getByTestId("produce-name-chip")).toHaveTextContent("Avocado");
    expect(screen.getByTestId("ds-not-enough-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-not-enough-card")).toHaveTextContent(
      "Most of the fruit sides were not captured"
    );
    expect(screen.getByTestId("ds-manual-checks")).toBeInTheDocument();
    expect(screen.getByTestId("ds-manual-checks")).toHaveTextContent(
      "Final check by touch"
    );
    expect(screen.getByTestId("ds-manual-checks-subtitle")).toHaveTextContent(
      "Photos assess the exterior"
    );
    fireEvent.click(screen.getByTestId("ds-manual-checks-toggle"));
    expect(screen.getByTestId("ds-manual-checks-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("ds-manual-checks-disclaimer")).toHaveTextContent(
      "Even with a high visual score, photos alone can never be 100% sure about ripeness"
    );
    expect(screen.getByTestId("ds-manual-checks-list")).toHaveTextContent("Squeeze test");
    expect(screen.getByTestId("ds-manual-checks-list")).toHaveTextContent("Weight check");
    fireEvent.click(screen.getByTestId("ds-manual-checks-close-button"));
    expect(screen.queryByTestId("ds-manual-checks-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ds-verdict-card")).not.toBeInTheDocument();
  });

  it("renders 'No fresh produce detected' headline when gate denies with no_produce message", () => {
    const noProduce: DeepScanResponse = {
      ...checks,
      status: "insufficient_evidence",
      message: "No fresh produce is visible. Please photograph the fruit or vegetables you want to compare.",
      manualChecks: null,
    };
    render(<DeepScanResultStage response={noProduce} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "produce");
    expect(screen.getByTestId("ds-not-enough-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-not-enough-card")).toHaveTextContent("No fresh produce detected");
    expect(screen.getByTestId("ds-not-enough-card")).toHaveTextContent(
      "No fresh produce is visible. Please photograph the fruit or vegetables you want to compare."
    );
    expect(screen.getByTestId("ds-error-tip-box")).toBeInTheDocument();
    expect(screen.queryByText("Most of the fruit sides were not captured")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ds-manual-checks")).not.toBeInTheDocument();
  });

  it("renders 'Photo isn't clear enough' headline when photo is blurry or obscured", () => {
    const unclear: DeepScanResponse = {
      ...checks,
      status: "unclear_photo",
      message: "The produce is obscured. Please take a clearer photo showing its surfaces.",
      manualChecks: null,
    };
    render(<DeepScanResultStage response={unclear} errorMessage={null} onNewScan={vi.fn()} />);
    expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "camera");
    expect(screen.getByTestId("ds-not-enough-card")).toBeInTheDocument();
    expect(screen.getByTestId("ds-not-enough-card")).toHaveTextContent("Photo isn't clear enough");
    expect(screen.getByTestId("ds-error-tip-box")).toBeInTheDocument();
    expect(screen.queryByText("Most of the fruit sides were not captured")).not.toBeInTheDocument();
  });

  it("renders the failure card from a null envelope with the machine message", () => {
    render(<DeepScanResultStage response={null} errorMessage="Deep scan unavailable. Try again later." onNewScan={vi.fn()} />);
    expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "alert");
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

  it("renders a retry button when onRetry is provided on a failure outcome", () => {
    const onRetry = vi.fn();
    const onNewScan = vi.fn();
    render(<DeepScanResultStage response={null} errorMessage="Failed" onNewScan={onNewScan} onRetry={onRetry} />);
    expect(screen.getByTestId("ds-retry-cta")).toBeInTheDocument();
    screen.getByTestId("ds-retry-cta").click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onNewScan).not.toHaveBeenCalled();
  });

  describe("local algorithm rejection error state matches proxy error style", () => {
    it("renders the unclear-photo error style when rejected locally for all_blurry", () => {
      render(
        <DeepScanResultStage
          response={null}
          localRejectReason="all_blurry"
          errorMessage="Too blurry: hold the fruit steadier and go again"
          backgroundPhotoUrl="data:image/jpeg;base64,blurredframe"
          onNewScan={vi.fn()}
        />
      );
      expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "camera");
      expect(screen.getByTestId("ds-result-background")).toBeInTheDocument();
      expect(screen.getByTestId("ds-failure-card")).toBeInTheDocument();
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(/camera adjustment/i);
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent("Photo isn't clear enough");
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(
        "Too blurry: hold the fruit steadier and go again"
      );
      expect(screen.getByTestId("ds-error-tip-box")).toHaveTextContent(
        "Hold your phone steady, tap to focus on the produce, and ensure good lighting without harsh glare."
      );
      expect(screen.getByTestId("ds-new-scan-cta")).toBeInTheDocument();
    });

    it("renders the unclear-photo error style when rejected locally for too_dark_or_bright", () => {
      render(
        <DeepScanResultStage
          response={null}
          localRejectReason="too_dark_or_bright"
          errorMessage="Lighting too dark: find a brighter spot"
          onNewScan={vi.fn()}
        />
      );
      expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "camera");
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(/camera adjustment/i);
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent("Photo isn't clear enough");
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(
        "Lighting too dark: find a brighter spot"
      );
      expect(screen.getByTestId("ds-error-tip-box")).toBeInTheDocument();
    });

    it("renders the not-enough-evidence error style when rejected locally for not_rotated", () => {
      render(
        <DeepScanResultStage
          response={null}
          localRejectReason="not_rotated"
          errorMessage="Produce wasn't rotated: slowly turn the fruit to show different sides"
          onNewScan={vi.fn()}
        />
      );
      expect(screen.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "rotate");
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(/another look needed/i);
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(
        "Most of the fruit sides were not captured"
      );
      expect(screen.getByTestId("ds-failure-card")).toHaveTextContent(
        "Produce wasn't rotated: slowly turn the fruit to show different sides"
      );
      expect(screen.getByTestId("ds-error-tip-box")).toHaveTextContent(
        "Slowly rotate the produce to show different parts and sides while scanning, including the underside or stem."
      );
    });
  });

  it("renders collapsible tactile checks in expanded content on confident verdict", () => {
    render(<DeepScanResultStage response={confident} errorMessage={null} onNewScan={vi.fn()} />);
    const card = screen.getByTestId("ds-confident-tactile-checks");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("ds-confident-tactile-checks-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("ds-confident-tactile-checks-list")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ds-confident-tactile-checks-toggle"));
    expect(screen.getByTestId("ds-confident-tactile-checks-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("ds-confident-tactile-checks-list")).toBeInTheDocument();
    expect(screen.getByTestId("ds-confident-tactile-checks-list")).toHaveTextContent("Gentle thumb press");
  });

  it("allows dragging bottom sheet with parallax photo translation", () => {
    render(
      <DeepScanResultStage
        response={confident}
        errorMessage={null}
        backgroundPhotoUrl="data:image/jpeg;base64,sampleframe"
        onNewScan={vi.fn()}
      />
    );

    const sheet = screen.getByTestId("ds-result-sheet");
    const photoViewport = screen.getByTestId("ds-result-photo-viewport");
    expect(photoViewport).toBeInTheDocument();
    expect(photoViewport.style.transform).toBe("translate3d(0, 0px, 0)");

    const dragArea = screen.getByTestId("sheet-drag-area");
    fireEvent.touchStart(dragArea, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(dragArea, { touches: [{ clientY: 420 }] });

    expect(photoViewport.style.transform).not.toBe("translate3d(0, 0px, 0)");
    expect(photoViewport.style.transform).toMatch(/translate3d\(0,\s*-[0-9]+px,\s*0\)/);

    fireEvent.touchEnd(dragArea);
    expect(sheet.style.transform).toBe("translate3d(0, 0px, 0)");
  });

  it("maintains top margin on bottom sheet when non-expandable error state has no grab handle", () => {
    render(
      <DeepScanResultStage
        response={null}
        localRejectReason="not_rotated"
        errorMessage="Produce wasn't rotated: slowly turn the fruit to show different sides"
        onNewScan={vi.fn()}
      />
    );

    const sheet = screen.getByTestId("ds-result-sheet");
    expect(sheet.style.paddingTop).toBe("20px");
    expect(screen.queryByTestId("sheet-drag-area")).not.toBeInTheDocument();
  });
});
