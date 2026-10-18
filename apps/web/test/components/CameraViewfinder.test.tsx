import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CameraViewfinder } from "../../src/components/CameraViewfinder";
import "../../src/i18n";

describe("CameraViewfinder (State 1 Parity)", () => {
  it("renders brand pill, flash button, framing brackets, floating prompt card, and yellow shutter center", () => {
    render(<CameraViewfinder onCapture={vi.fn()} remainingScans={8} />);
    expect(screen.getByText("Pomona")).toBeInTheDocument();
    expect(screen.queryByTestId("scan-quota-pill")).not.toBeInTheDocument();
    expect(screen.getByTestId("flash-toggle-button")).toBeInTheDocument();
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
});



