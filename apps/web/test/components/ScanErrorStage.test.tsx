import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { ScanErrorStage } from "../../src/components/ScanErrorStage";
import "../../src/i18n";
import en from "../../src/i18n/locales/en.json";

describe("ScanErrorStage", () => {
  it("shows similar visible maturity as a distinct notice without claiming equal quality", () => {
    const onRetake = vi.fn();
    render(<ScanErrorStage status="insufficient_evidence" abstentionReason="assessed_tie"
      errorMessage="I cannot choose between these items." photoDataUrl={null} onRetake={onRetake} />);
    expect(screen.getByRole("heading", { name: "No clear standout" })).toBeInTheDocument();
    expect(screen.getByText("Similar Visible Maturity")).toBeInTheDocument();
    expect(screen.getByText(/no visible ripeness advantage/)).toBeInTheDocument();
    expect(screen.getByText(/does not confirm equal quality inside/)).toBeInTheDocument();
    expect(screen.queryByText("Another Look Needed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scan Another Selection" }));
    expect(onRetake).toHaveBeenCalledOnce();
  });

  it("never shows the similar-maturity notice for missing evidence or another status", () => {
    const { rerender } = render(<ScanErrorStage status="insufficient_evidence" abstentionReason="missing_evidence"
      photoDataUrl={null} onRetake={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Not enough evidence to choose" })).toBeInTheDocument();
    rerender(<ScanErrorStage status="unclear_photo" abstentionReason="assessed_tie"
      photoDataUrl={null} onRetake={vi.fn()} />);
    expect(screen.queryByText("No clear standout")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Photo isn't clear enough" })).toBeInTheDocument();
  });

  it("shows a distinct evidence notice and another-angle action", () => {
    const onRetake = vi.fn();
    render(<ScanErrorStage status="insufficient_evidence" errorMessage="The field spots are hidden; I cannot confidently choose."
      photoDataUrl="data:image/webp;base64,mock" onRetake={onRetake} onDrawFocus={vi.fn()} />);
    expect(screen.getByText("Not enough evidence to choose")).toBeInTheDocument();
    expect(screen.queryByText("The field spots are hidden; I cannot confidently choose.")).not.toBeInTheDocument();
    expect(screen.getByText(en.errors.insufficientEvidence)).toBeInTheDocument();
    expect(screen.getByText("Another Look Needed")).toBeInTheDocument();
    expect(screen.queryByTestId("error-draw-button")).not.toBeInTheDocument();
    expect(screen.queryByText(/blurry/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try Another Angle" }));
    expect(onRetake).toHaveBeenCalledOnce();
  });

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
    expect(screen.queryByText("Image is blurry")).not.toBeInTheDocument();
    expect(screen.getByText(en.errors.unclearPhoto)).toBeInTheDocument();
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

  it("renders unclear_photo error state with 'Draw Around One' button when onDrawFocus is provided", () => {
    const handleDraw = vi.fn();
    const handleRetake = vi.fn();
    render(
      <ScanErrorStage
        status="unclear_photo"
        errorMessage="Too many overlapping bags to grade reliably."
        photoDataUrl="data:image/webp;base64,mock"
        onRetake={handleRetake}
        onDrawFocus={handleDraw}
      />
    );

    expect(screen.getByText("Photo isn't clear enough")).toBeInTheDocument();
    expect(screen.queryByText("Too many overlapping bags to grade reliably.")).not.toBeInTheDocument();
    expect(screen.getByText(en.errors.unclearPhoto)).toBeInTheDocument();
    expect(screen.getByTestId("error-draw-button")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("error-draw-button"));
    expect(handleDraw).toHaveBeenCalledTimes(1);
  });
});
