import "@testing-library/jest-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DeepScanAnalysingStage } from "../../src/components/DeepScanAnalysingStage";
import "../../src/i18n";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("DeepScanAnalysingStage", () => {
  it("shows the composite masked by the oval with the original laser sweep animation", async () => {
    render(<DeepScanAnalysingStage backgroundUrl={PNG} onCancel={vi.fn()} />);

    expect(screen.getByTestId("stage-S_DS_Analysing")).toBeInTheDocument();
    const oval = screen.getByTestId("ds-analysing-oval");
    expect(oval).toHaveStyle({ borderRadius: "50%", overflow: "hidden" });
    expect(screen.getByTestId("ds-analysing-image")).toHaveAttribute("src", PNG);

    const beam = screen.getByTestId("ds-scanning-beam");
    expect(beam).toHaveStyle({ animation: "ds-laser-sweep 2.4s ease-in-out infinite" });
    // Vertical sweep beam spans the whole oval and is gradient-based like the original laser
    expect(beam.querySelector("div")).toHaveStyle({ position: "absolute" });

    await waitFor(() => {
      expect(screen.getByTestId("ds-analysing-sheet").textContent).not.toBe("");
    });
  });

  it("keeps cancel available during the deep scan analysis", async () => {
    const onCancel = vi.fn();
    render(<DeepScanAnalysingStage backgroundUrl={null} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("ds-analysing-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ds-analysing-image")).not.toBeInTheDocument();
  });
});

