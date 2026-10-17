import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CameraViewfinder } from "../../src/components/CameraViewfinder";
import "../../src/i18n";

describe("CameraViewfinder (State 1 Parity)", () => {
  it("renders brand pill, scan quota pill, framing brackets, floating prompt card, and yellow shutter center", () => {
    render(<CameraViewfinder onCapture={vi.fn()} remainingScans={8} />);
    expect(screen.getByText("Pomona")).toBeInTheDocument();
    expect(screen.getByText("8 scans left today")).toBeInTheDocument();
    expect(screen.getByText("Point at a pile or single fruit")).toBeInTheDocument();
    expect(screen.getByText("Works with any fruit, vegetable, or produce")).toBeInTheDocument();
    expect(screen.getByTestId("camera-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("shutter-button-core")).toHaveStyle({ backgroundColor: "#F5D547" });
  });
});
