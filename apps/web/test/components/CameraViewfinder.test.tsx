import "@testing-library/jest-dom";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CameraViewfinder, __resetBrandEntranceForTesting } from "../../src/components/CameraViewfinder";
import "../../src/i18n";

describe("CameraViewfinder (State 1 Parity)", () => {
  it("renders brand pill, flash button, framing brackets, floating prompt card, and yellow shutter center", () => {
    render(<CameraViewfinder onCapture={vi.fn()} remainingScans={8} />);
    expect(screen.getByTestId("brand-pill")).toHaveTextContent("P");
    expect(screen.getByTestId("brand-pill")).toHaveAttribute("aria-label", "Pomona");
    expect(screen.queryByTestId("scan-quota-pill")).not.toBeInTheDocument();
    expect(screen.getByTestId("flash-toggle-button")).toBeInTheDocument();
    expect(screen.getByTestId("floating-prompt-card")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-card-container")).toHaveStyle({ position: "absolute", zIndex: "25" });
    expect(screen.getByText("Point at a pile or single fruit")).toBeInTheDocument();
    expect(screen.getByText("Works with any fruit, vegetable, or produce")).toBeInTheDocument();
    expect(screen.getByTestId("camera-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("shutter-button-core")).toHaveStyle({ backgroundColor: "#F5D547" });
  });

  it("disables taking or uploading a photo and shows offline message when there is no connection", () => {
    const onCapture = vi.fn();
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(<CameraViewfinder onCapture={onCapture} remainingScans={8} />);

    const shutterBtn = screen.getByTestId("shutter-button");
    const fileInput = screen.getByTestId("file-fallback-input");

    expect(shutterBtn).toBeDisabled();
    expect(fileInput).toBeDisabled();
    expect(screen.getByTestId("floating-prompt-card")).toHaveTextContent(/offline/i);

    shutterBtn.click();
    expect(onCapture).not.toHaveBeenCalled();

    // Restore online state via window event
    onlineSpy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.getByTestId("shutter-button")).not.toBeDisabled();
    onlineSpy.mockRestore();
  });

  it("renders the segmented mode switcher and toggles between Compare and Inspect", () => {
    const onModeChange = vi.fn();
    render(<CameraViewfinder onCapture={vi.fn()} onModeChange={onModeChange} />);

    expect(screen.getByTestId("camera-mode-switcher")).toBeInTheDocument();
    const compareTab = screen.getByTestId("mode-tab-compare");
    const inspectTab = screen.getByTestId("mode-tab-inspect");

    expect(compareTab).toHaveTextContent("Compare");
    expect(inspectTab).toHaveTextContent("Inspect");
    expect(screen.getByTestId("camera-reticle-brackets")).toBeInTheDocument();

    // Click Inspect tab
    act(() => {
      inspectTab.click();
    });

    expect(onModeChange).toHaveBeenCalledWith("inspect");
    expect(screen.getByTestId("ds-oval")).toBeInTheDocument();
    expect(screen.getByTestId("ds-go-button")).toBeInTheDocument();

    // Click Compare tab
    act(() => {
      compareTab.click();
    });

    expect(onModeChange).toHaveBeenCalledWith("compare");
    expect(screen.getByTestId("camera-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("shutter-button")).toBeInTheDocument();
  });

  it("renders a loading state inside the card underneath during compare scan and hides previous error", async () => {
    let resolveCapture: (val?: any) => void = () => {};
    const onCapture = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveCapture = resolve;
    }));

    render(
      <CameraViewfinder
        onCapture={onCapture}
        mode="compare"
        notice="Could not detect produce"
      />
    );

    // Idle state with previous error notice
    expect(screen.getByTestId("camera-notice")).toHaveTextContent("Could not detect produce");
    expect(screen.getByText("Point at a pile or single fruit")).toBeInTheDocument();
    expect(screen.queryByTestId("floating-prompt-card-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("camera-mode-switcher")).toBeInTheDocument();

    // Trigger compare capture
    const shutter = screen.getByTestId("shutter-button");
    act(() => {
      shutter.click();
    });

    // During compare scan: card underneath shows loading state with 3D scan animation and hides previous error, and tab hides
    expect(screen.getByTestId("floating-prompt-card-loading")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-card-3d-scan")).toBeInTheDocument();
    expect(screen.getByText("Scanning produce…")).toBeInTheDocument();
    expect(screen.getByText("Checking ripeness with Pomona Vision…")).toBeInTheDocument();
    expect(screen.queryByTestId("camera-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("camera-mode-switcher")).not.toBeInTheDocument();
    expect(shutter).toBeDisabled();

    // Finish capture
    await act(async () => {
      resolveCapture();
    });

    expect(screen.getByTestId("shutter-button")).not.toBeDisabled();
    expect(screen.getByTestId("camera-mode-switcher")).toBeInTheDocument();
  });

  it("renders a loading state inside the inspect card underneath during inspect scan and hides previous error", async () => {
    let resolveCollect: (val: any) => void = () => {};
    const collectPromise = new Promise((resolve) => {
      resolveCollect = resolve;
    });

    const deepScan = {
      collect: vi.fn().mockReturnValue(collectPromise),
      onComplete: vi.fn(),
      onCancel: vi.fn(),
      notice: "Deep scan unavailable",
    };

    render(
      <CameraViewfinder
        mode="inspect"
        deepScan={deepScan}
      />
    );

    expect(screen.getByTestId("ds-notice")).toHaveTextContent("Deep scan unavailable");
    expect(screen.getByText("Put a fruit on the frame and start the scan")).toBeInTheDocument();
    expect(screen.queryByTestId("ds-cancel-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("close-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("camera-mode-switcher")).toBeInTheDocument();

    // Click GO
    const goBtn = screen.getByTestId("ds-go-button");
    act(() => {
      goBtn.click();
    });

    // Loading state inside card underneath with 3D scan animation, and tab hides
    expect(screen.getByTestId("ds-prompt-card-loading")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-card-3d-scan")).toBeInTheDocument();
    expect(screen.getByText("Scanning produce…")).toBeInTheDocument();
    expect(screen.getByText("Keep rotating produce full circle…")).toBeInTheDocument();
    expect(screen.queryByTestId("ds-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("camera-mode-switcher")).not.toBeInTheDocument();
    expect(goBtn).toBeDisabled();

    await act(async () => {
      resolveCollect([]);
    });

    expect(screen.getByTestId("camera-mode-switcher")).toBeInTheDocument();
  });

  describe("slide right and left gesture to change tab", () => {
    it("changes from compare to inspect when sliding horizontally", () => {
      const onModeChange = vi.fn();
      render(<CameraViewfinder mode="compare" onModeChange={onModeChange} />);

      const container = screen.getByTestId("stage-S1_LiveCamera");
      fireEvent.touchStart(container, {
        touches: [{ clientX: 250, clientY: 200 }],
      });
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientX: 150, clientY: 200 }],
      });

      expect(onModeChange).toHaveBeenCalledWith("inspect");
    });

    it("changes from inspect to compare when sliding horizontally", () => {
      const onModeChange = vi.fn();
      render(<CameraViewfinder mode="inspect" onModeChange={onModeChange} />);

      const container = screen.getByTestId("stage-S_DS_Capture");
      fireEvent.touchStart(container, {
        touches: [{ clientX: 100, clientY: 200 }],
      });
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientX: 200, clientY: 200 }],
      });

      expect(onModeChange).toHaveBeenCalledWith("compare");
    });

    it("animates the tab switcher pill dynamically during horizontal slide according to scroll amount", () => {
      const onModeChange = vi.fn();
      render(<CameraViewfinder mode="compare" onModeChange={onModeChange} />);

      const container = screen.getByTestId("stage-S1_LiveCamera");
      const pill = screen.getByTestId("mode-switcher-pill");

      // Initially at 0%
      expect(pill).toHaveStyle({ transform: "translateX(0%)" });

      // Start drag
      fireEvent.touchStart(container, {
        touches: [{ clientX: 200, clientY: 200 }],
      });

      // Drag left 80px out of 160px (50% progress)
      fireEvent.touchMove(container, {
        touches: [{ clientX: 120, clientY: 200 }],
      });

      expect(pill).toHaveStyle({ transform: "translateX(50%)" });

      // Drag further left to 160px (100% progress)
      fireEvent.touchMove(container, {
        touches: [{ clientX: 40, clientY: 200 }],
      });

      expect(pill).toHaveStyle({ transform: "translateX(100%)" });

      // Release at 100%
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientX: 40, clientY: 200 }],
      });

      expect(onModeChange).toHaveBeenCalledWith("inspect");
    });

    it("cancels tab switch and springs back when horizontal drag is below threshold", () => {
      const onModeChange = vi.fn();
      render(<CameraViewfinder mode="compare" onModeChange={onModeChange} />);

      const container = screen.getByTestId("stage-S1_LiveCamera");
      const pill = screen.getByTestId("mode-switcher-pill");

      // Start drag at t=0
      vi.spyOn(Date, "now").mockReturnValue(1000);
      fireEvent.touchStart(container, {
        touches: [{ clientX: 200, clientY: 200 }],
      });

      // Small drag left of 20px (progress = 20/160 = 12.5%)
      fireEvent.touchMove(container, {
        touches: [{ clientX: 180, clientY: 200 }],
      });
      expect(pill).toHaveStyle({ transform: "translateX(12.5%)" });

      // Release after long pause so it's not a quick flick (elapsed = 1500ms > 800ms)
      vi.spyOn(Date, "now").mockReturnValue(2500);
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientX: 180, clientY: 200 }],
      });

      expect(onModeChange).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it("ignores predominantly vertical gestures", () => {
      const onModeChange = vi.fn();
      render(<CameraViewfinder mode="compare" onModeChange={onModeChange} />);

      const container = screen.getByTestId("stage-S1_LiveCamera");
      fireEvent.touchStart(container, {
        touches: [{ clientX: 200, clientY: 100 }],
      });
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientX: 210, clientY: 300 }],
      });

      expect(onModeChange).not.toHaveBeenCalled();
    });
  });

  describe("Brand entrance animation on initial app load", () => {
    it("starts with full Pomona text and smoothly collapses into single P", () => {
      vi.useFakeTimers();
      __resetBrandEntranceForTesting();

      render(<CameraViewfinder onCapture={vi.fn()} />);

      const brandPill = screen.getByTestId("brand-pill");
      expect(brandPill).toHaveTextContent("Pomona");
      expect(brandPill).toHaveStyle({ width: "92px" });

      // Advance past the collapse trigger (200ms)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(brandPill).toHaveStyle({ width: "36px" });

      // Advance past cleanup (1100ms total, +1000ms)
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(brandPill).toHaveTextContent("P");
      expect(brandPill).not.toHaveTextContent("Pomona");

      vi.useRealTimers();
    });
  });
});



