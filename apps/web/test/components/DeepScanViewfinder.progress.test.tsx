import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DeepScanViewfinder, type CollectedFrame } from "../../src/components/DeepScanViewfinder";
import "../../src/i18n";

function frame(sequence: number): CollectedFrame {
  return {
    sequence,
    gray: new Float32Array(8 * 6).fill(100),
    grayW: 8,
    grayH: 6,
    thumb: new Float32Array(4 * 3).fill(100),
    dataUrl: `data:image/jpeg;base64,RnJhbWU${sequence}`,
  };
}

const offsetOf = (): number => {
  const ellipse = screen.getByTestId("ds-oval-progress").querySelector(
    "path"
  ) as SVGPathElement;
  return Number(ellipse.getAttribute("stroke-dashoffset") ?? ellipse.style.strokeDashoffset);
};

describe("DeepScanViewfinder oval-edge progress", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reveals a gold stroke travelling the oval edge in sync with the capture run", async () => {
    let release!: (frames: CollectedFrame[]) => void;
    const collect = vi.fn(
      () =>
        new Promise<CollectedFrame[]>((resolve) => {
          release = resolve;
        })
    );
    const onComplete = vi.fn();
    vi.useFakeTimers();
    render(<DeepScanViewfinder collect={collect} onComplete={onComplete} onCancel={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("ds-go-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("ds-oval-progress")).toBeInTheDocument();

    const atStart = offsetOf();
    expect(atStart).toBeGreaterThan(90); // nearly fully hidden at t≈0

    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    const quarter = offsetOf();
    expect(quarter).toBeLessThan(atStart);
    expect(quarter).toBeGreaterThan(60); // ≈25% travelled

    await act(async () => {
      vi.advanceTimersByTime(2400);
    });
    const nearlyFull = offsetOf();
    expect(nearlyFull).toBeLessThan(quarter);
    expect(nearlyFull).toBeGreaterThan(20); // ≈73% travelled

    await act(async () => {
      release([frame(0), frame(1)]);
      await Promise.resolve();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect((onComplete.mock.calls[0][0] as CollectedFrame[]).map((f) => f.sequence)).toEqual([0, 1]);
    expect(screen.queryByTestId("ds-oval-progress")).not.toBeInTheDocument();
  });

  it("adopts the capture oval geometry edges exactly", async () => {
    let release!: (frames: CollectedFrame[]) => void;
    const collect = vi.fn(
      () =>
        new Promise<CollectedFrame[]>((resolve) => {
          release = resolve;
        })
    );
    render(<DeepScanViewfinder collect={collect} onComplete={vi.fn()} onCancel={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("ds-go-button"));
      await Promise.resolve();
    });
    const oval = screen.getByTestId("ds-oval");
    const ring = screen.getByTestId("ds-oval-progress") as unknown as SVGElement;
    for (const key of ["top", "left", "width", "height", "transform"] as const) {
      expect(ring.style[key]).toBe(oval.style[key]);
    }
    release([]);
  });
});
