import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { ScanErrorStage } from "../../src/components/ScanErrorStage";
import "../../src/i18n";

describe("ScanErrorStage", () => {
  it("renders unclear_photo error state with tailored copy, icon, and retake action", () => {
    const handleRetake = vi.fn();
    render(
      <ScanErrorStage
        status="unclear_photo"
        errorMessage="Image is blurry"
        photoDataUrl="data:image/webp;base64,mock"
        onRetake={handleRetake}
      />
    );

    expect(screen.getByTestId("stage-S_ScanError")).toBeInTheDocument();
    expect(screen.getByText("Photo isn't clear enough")).toBeInTheDocument();
    expect(screen.getByText("Image is blurry")).toBeInTheDocument();
    expect(screen.getByText(/Hold your phone steady/)).toBeInTheDocument();
    expect(screen.getByTestId("error-primary-cta").textContent).toBe("Retake Photo");

    fireEvent.click(screen.getByTestId("error-primary-cta"));
    expect(handleRetake).toHaveBeenCalledTimes(1);
  });

  it("renders no_produce error state with tailored copy and 'Scan Fresh Produce' CTA", () => {
    const handleRetake = vi.fn();
    render(
      <ScanErrorStage
        status="no_produce"
        errorMessage="No fresh produce detected"
        photoDataUrl={null}
        onRetake={handleRetake}
      />
    );

    expect(screen.getByRole("heading", { name: "No fresh produce detected" })).toBeInTheDocument();
    expect(screen.getByText(/Pomona inspects fresh whole produce/)).toBeInTheDocument();
    expect(screen.getByTestId("error-primary-cta").textContent).toBe("Scan Fresh Produce");
  });

  it("renders multiple_types error state with 'Draw Around One' button when onDrawFocus is provided", () => {
    const handleDraw = vi.fn();
    const handleRetake = vi.fn();
    render(
      <ScanErrorStage
        status="multiple_types"
        errorMessage="Multiple varieties detected"
        photoDataUrl={null}
        onRetake={handleRetake}
        onDrawFocus={handleDraw}
      />
    );

    expect(screen.getByText("Multiple produce types spotted")).toBeInTheDocument();
    expect(screen.getByTestId("error-draw-button")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("error-draw-button"));
    expect(handleDraw).toHaveBeenCalledTimes(1);
  });
});
