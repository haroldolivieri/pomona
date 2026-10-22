import { describe, it, expect, vi } from "vitest";
import {
  assembleDeepScanPayload,
  DeepScanLocalReject,
  type CollectedFrame,
} from "../src/lib/deep-scan-capture";

function frame(sequence: number, grayValue: number): CollectedFrame {
  const gray = new Float32Array(8 * 6);
  if (grayValue < 0) {
    for (let i = 0; i < gray.length; i++) gray[i] = i % 2 === 0 ? 40 : 220;
  } else {
    gray.fill(grayValue);
  }
  return {
    sequence,
    gray,
    grayW: 8,
    grayH: 6,
    thumb: new Float32Array(4 * 3).map((_, i) => (grayValue < 0 ? 40 + sequence * 50 : grayValue)),
    dataUrl: `data:image/jpeg;base64,RnJhbWU${sequence}`,
  };
}

describe("assembleDeepScanPayload", () => {
  it("runs selectFrames then the composite builder into endpoint payload shape", async () => {
    const build = vi.fn().mockResolvedValue({ dataUrl: "data:image/jpeg;base64,QUJD", tileCount: 2, bytes: 10 });
    const payload = await assembleDeepScanPayload([frame(0, -1), frame(1, -1), frame(2, -1)], { build });

    expect(build).toHaveBeenCalledTimes(1);
    expect(payload.sampleCount).toBe(3);
    expect(payload.composite.dataUrl).toBe("data:image/jpeg;base64,QUJD");
    expect(payload.composite.tileCount).toBe(2);
    expect(payload.stats.sampled).toBe(3);
  });

  it("rejects locally when selection keeps fewer than two usable frames", async () => {
    const build = vi.fn().mockResolvedValue({ dataUrl: "x", tileCount: 2, bytes: 1 });
    await expect(
      assembleDeepScanPayload([frame(0, 10), frame(1, 12)], { build })
    ).rejects.toMatchObject({ reason: "all_blurry" });
    expect(build).not.toHaveBeenCalled();
  });

  it("labels the local reject as lighting when exposure failures dominate", async () => {
    const build = vi.fn().mockResolvedValue({ dataUrl: "x", tileCount: 2, bytes: 1 });
    await expect(
      assembleDeepScanPayload([frame(0, 3), frame(1, 4)], { build, stats: { sampled: 2, rejectedBlur: 0, rejectedExposure: 2, rejectedSimilarity: 0 } })
    ).rejects.toMatchObject({ reason: "too_dark_or_bright" });
  });

  it("maps reject reasons onto localized copy keys for the machine", () => {
    expect(DeepScanLocalReject.copyKey("all_blurry")).toBe("deepScan.localTooBlurry");
    expect(DeepScanLocalReject.copyKey("too_dark_or_bright")).toBe("deepScan.localTooDark");
  });
});
