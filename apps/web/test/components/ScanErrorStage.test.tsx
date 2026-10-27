import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { ScanErrorStage } from "../../src/components/ScanErrorStage";
import i18n from "../../src/i18n";
import en from "../../src/i18n/locales/en.json";

describe("ScanErrorStage localization and raw message suppression", () => {
  it.each(["en-GB", "pt-BR"] as const)(
    "displays catalog error copy in %s and suppresses raw backend messages across all statuses",
    async (locale) => {
      await i18n.changeLanguage(locale);
      const testCases: [string, string, string | null][] = [
        ["no_produce", "noProduce", null],
        ["unclear_photo", "unclearPhoto", null],
        ["multiple_types", "multipleTypes", null],
        ["single_produce", "singleProduceCompare", null],
        ["rate_limited", "rateLimited", null],
        ["analysis_failed", "analysisFailed", null],
        ["insufficient_evidence", "insufficientEvidence", "missing_evidence"],
        ["insufficient_evidence", "similarMaturity", "assessed_tie"],
      ];

      for (const [status, key, reason] of testCases) {
        for (const rawMessage of ["RAW ENGLISH BACKEND MESSAGE", "MENSAGEM BRUTA DO MODELO"]) {
          const { unmount } = render(
            <ScanErrorStage
              status={status as any}
              abstentionReason={reason as any}
              errorMessage={rawMessage}
              photoDataUrl={null}
              onRetake={vi.fn()}
            />
          );
          expect(document.body.textContent).toContain(i18n.t(`errors.${key}`));
          expect(document.body.textContent).not.toContain("RAW ENGLISH");
          expect(document.body.textContent).not.toContain("MENSAGEM BRUTA");
          unmount();
        }
      }
      await i18n.changeLanguage("en-GB");
    }
  );
});

describe("ScanErrorStage", () => {
  it("does not claim a gate capacity limit resets with the device daily quota", () => {
    render(<ScanErrorStage status="rate_limited" photoDataUrl={null} onRetake={vi.fn()}
      errorMessage="Scan allowance or service capacity reached. Please try again later." />);
    expect(screen.getByText(/Scan allowance or service capacity reached/)).toBeInTheDocument();
    expect(screen.queryByText(/reset.*tomorrow|used all daily scans/i)).not.toBeInTheDocument();
  });
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

  it("shows dedicated single-produce guidance to use Inspect when comparing only 1 item", () => {
    const onDeepScan = vi.fn();
    render(
      <ScanErrorStage
        status="insufficient_evidence"
        abstentionReason="missing_evidence"
        photoDataUrl="data:image/webp;base64,mock"
        isSingleProduce={true}
        onRetake={vi.fn()}
        onDeepScan={onDeepScan}
      />
    );
    expect(screen.getByRole("heading", { name: en.errors.singleProduceCompareTitle })).toBeInTheDocument();
    expect(screen.getByText(en.errors.singleProduceCompareEyebrow)).toBeInTheDocument();
    expect(screen.getByText(en.errors.singleProduceCompare)).toBeInTheDocument();
    expect(screen.getByText(en.errors.singleProduceCompareTip)).toBeInTheDocument();
    const deepScanButton = screen.getByTestId("error-deep-scan-cta");
    expect(deepScanButton).toBeInTheDocument();
    expect(screen.queryByTestId("error-primary-cta")).not.toBeInTheDocument();
    fireEvent.click(deepScanButton);
    expect(onDeepScan).toHaveBeenCalledOnce();
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

describe("ScanErrorStage deep-scan CTA row", () => {
  it("shows a filled gold Inspect CTA beside the filled action, both flex:1", () => {
    render(
      <ScanErrorStage
        status="insufficient_evidence"
        abstentionReason="missing_evidence"
        photoDataUrl={null}
        onRetake={vi.fn()}
        onDeepScan={vi.fn()}
      />
    );
    const gold = screen.getByTestId("error-deep-scan-cta");
    expect(gold).toHaveTextContent("Inspect Closer");
    expect(gold.querySelector("svg")).not.toBeNull();
    expect(gold).toHaveStyle({ backgroundColor: "rgb(245, 213, 71)", flex: "1 1 0%" });
    const green = screen.getByTestId("error-primary-cta");
    expect(green).toHaveStyle({ flex: "1 1 0%" });
    expect(gold.nextElementSibling === green || green.previousElementSibling === gold).toBe(true);
  });

  it("strictly hides the Inspect CTA on no_produce or unclear_photo even when onDeepScan is provided", () => {
    const { rerender } = render(
      <ScanErrorStage
        status="no_produce"
        photoDataUrl={null}
        onRetake={vi.fn()}
        onDeepScan={vi.fn()}
      />
    );
    expect(screen.queryByTestId("error-deep-scan-cta")).not.toBeInTheDocument();

    rerender(
      <ScanErrorStage
        status="unclear_photo"
        photoDataUrl={null}
        onRetake={vi.fn()}
        onDeepScan={vi.fn()}
      />
    );
    expect(screen.queryByTestId("error-deep-scan-cta")).not.toBeInTheDocument();
  });

  it("hides the deep-scan CTA when no handler is wired", () => {
    render(
      <ScanErrorStage
        status="insufficient_evidence"
        abstentionReason="missing_evidence"
        photoDataUrl={null}
        onRetake={vi.fn()}
      />
    );
    expect(screen.queryByTestId("error-deep-scan-cta")).not.toBeInTheDocument();
  });

  it("renders single produce inspect recommendation and deep scan CTA when status is single_produce", () => {
    const onDeepScan = vi.fn();
    render(
      <ScanErrorStage
        status="single_produce"
        photoDataUrl={null}
        onRetake={vi.fn()}
        onDeepScan={onDeepScan}
      />
    );
    expect(screen.getByText(en.errors.singleProduceCompareTitle)).toBeInTheDocument();
    expect(screen.getByText(en.errors.singleProduceCompare)).toBeInTheDocument();
    expect(screen.getByTestId("error-deep-scan-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("error-primary-cta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("error-deep-scan-cta"));
    expect(onDeepScan).toHaveBeenCalledOnce();
  });
});
