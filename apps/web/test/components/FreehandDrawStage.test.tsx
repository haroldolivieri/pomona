import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FreehandDrawStage } from "../../src/components/FreehandDrawStage";
import "../../src/i18n";

describe("FreehandDrawStage (State 2 Parity)", () => {
  it("renders ivory bottom sheet with headline, subtitle, outline whole-photo button, and green analyse button", () => {
    render(
      <FreehandDrawStage
        photoDataUrl="data:image/png;base64,mock"
        onAnalyse={vi.fn()}
        onRetake={vi.fn()}
      />
    );
    expect(screen.getByTestId("draw-bottom-sheet")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 · Focus area/i)).toBeInTheDocument();
    expect(screen.getByText("Draw around your picks")).toBeInTheDocument();
    expect(screen.getByText(/Trace with your finger/i)).toBeInTheDocument();
    expect(screen.getByTestId("floating-draw-pill")).toHaveTextContent("Draw around the area to focus on");

    const wholeBtn = screen.getByTestId("whole-photo-button");
    const analyseBtn = screen.getByTestId("analyse-drawn-button");
    expect(wholeBtn.style.backgroundColor).toBe("transparent");
    expect(analyseBtn).toHaveStyle({ backgroundColor: "var(--cta-primary)" });

    // Top bar checks: back button, quota chip, and reset button
    expect(screen.getByTestId("retake-button")).toHaveTextContent("←");
    expect(screen.getByTestId("scan-quota-pill")).toHaveTextContent("10 scans left today");
    const resetBtn = screen.getByTestId("reset-draw-button");
    expect(resetBtn).toHaveTextContent("↺");
    expect(resetBtn).toBeDisabled();
  });
});
