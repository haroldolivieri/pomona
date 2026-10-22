import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AnalysingStage } from "../../src/components/AnalysingStage";
import "../../src/i18n";

describe("AnalysingStage (State 3 Parity)", () => {
  it("renders organic dashed polygon, candidate pulsing dots, and ivory bottom sheet", () => {
    const polygon = [
      { x: 200, y: 200 },
      { x: 800, y: 200 },
      { x: 800, y: 800 },
      { x: 200, y: 800 },
    ];
    render(
      <AnalysingStage
        photoDataUrl="data:image/png;base64,mock"
        focusPolygon={polygon}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId("analysing-bottom-sheet")).toBeInTheDocument();
    expect(screen.getByText("Pomona Vision")).toBeInTheDocument();
    expect(screen.getByText("Checking ripeness…")).toBeInTheDocument();
    expect(screen.getByTestId("scanning-polygon-overlay")).toBeInTheDocument();
    expect(screen.getAllByTestId("candidate-pulse-dot").length).toBeGreaterThan(0);
    const laserContainer = screen.getByTestId("scanning-laser-container");
    expect(laserContainer).toBeInTheDocument();
    expect(screen.queryByText(/Focusing on items/i)).not.toBeInTheDocument();
  });

  it("renders cancel button and triggers onCancel when clicked", () => {
    const handleCancel = vi.fn();
    render(
      <AnalysingStage
        photoDataUrl="data:image/png;base64,mock"
        onCancel={handleCancel}
      />
    );
    const cancelBtn = screen.getByTestId("cancel-button");
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the whole-photo subhead without a quota pill", () => {
    render(
      <AnalysingStage
        photoDataUrl="data:image/png;base64,mock"
      />
    );
    expect(screen.queryByTestId("scan-quota-pill")).toBeNull();
    expect(screen.getByText("Grading produce across the entire photo.")).toBeInTheDocument();
  });
});
