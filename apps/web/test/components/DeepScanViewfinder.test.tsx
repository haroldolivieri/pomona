import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DeepScanViewfinder, type CollectedFrame } from "../../src/components/DeepScanViewfinder";
import "../../src/i18n";

function frame(sequence: number, grayValue = 100): CollectedFrame {
  const gray = new Float32Array(8 * 6).fill(grayValue);
  return {
    sequence,
    gray,
    grayW: 8,
    grayH: 6,
    thumb: new Float32Array(4 * 3).fill(grayValue),
    dataUrl: `data:image/jpeg;base64,RnJhbWU${sequence}`,
  };
}

describe("DeepScanViewfinder", () => {
  it("renders idle copy, mode tabs, fixed oval, and GO shutter without redundant cancel button", () => {
    render(<DeepScanViewfinder onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Put a fruit on the frame and start the scan")).toBeInTheDocument();
    expect(screen.getByText("Hold steady and rotate slowly, showing the whole surface")).toBeInTheDocument();
    expect(screen.queryByTestId("ds-cancel-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("mode-tab-compare")).toBeInTheDocument();
    expect(screen.getByTestId("ds-oval")).toBeInTheDocument();
    const go = screen.getByTestId("ds-go-button");
    expect(go.querySelector("span")).toBeNull();
    expect(screen.getByTestId("ds-go-button-core")).toHaveStyle({ backgroundColor: "#F5D547" });
  });

  it("runs the collected sampler once per GO press and hands frames to onComplete", async () => {
    const collect = vi.fn().mockResolvedValue([frame(0), frame(1, 60)]);
    const onComplete = vi.fn();
    render(<DeepScanViewfinder collect={collect} onComplete={onComplete} onCancel={vi.fn()} />);

    await act(async () => {
      screen.getByTestId("ds-go-button").click();
    });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const handed = onComplete.mock.calls[0][0] as CollectedFrame[];
    expect(handed).toHaveLength(2);
    expect(handed[1].sequence).toBe(1);
  });

  it("disables GO while a run is in flight so a second press cannot double-sample", async () => {
    let release!: (frames: CollectedFrame[]) => void;
    const collect = vi.fn().mockImplementation(
      () => new Promise<CollectedFrame[]>((resolve) => (release = resolve))
    );
    render(<DeepScanViewfinder collect={collect} onComplete={vi.fn()} onCancel={vi.fn()} />);

    await act(async () => {
      screen.getByTestId("ds-go-button").click();
    });
    expect(screen.getByTestId("ds-go-button")).toBeDisabled();
    act(() => {
      release([frame(0)]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("ds-go-button")).not.toBeDisabled();
  });

  it("shows the machine notice copy alongside the shutter for a retry", () => {
    render(
      <DeepScanViewfinder
        onComplete={vi.fn()}
        onCancel={vi.fn()}
        notice="Too blurry — hold the fruit steadier and go again"
      />
    );
    expect(screen.getByTestId("ds-notice")).toHaveTextContent(/too blurry/i);
  });

  it("switching back to compare tab hands back to the machine", () => {
    const onCancel = vi.fn();
    render(<DeepScanViewfinder onComplete={vi.fn()} onCancel={onCancel} />);
    screen.getByTestId("mode-tab-compare").click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
