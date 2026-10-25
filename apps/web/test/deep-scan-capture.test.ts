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

  it("picks the highest scored picture from the local algorithm and uses its original size (fullDataUrl) for bestDataUrl", async () => {
    const build = vi.fn().mockResolvedValue({ dataUrl: "composite", tileCount: 2, bytes: 10 });
    const frames = [
      { ...frame(0, -1), fullDataUrl: "data:image/jpeg;base64,ORIGINAL_0" },
      { ...frame(1, -1), fullDataUrl: "data:image/jpeg;base64,ORIGINAL_1" },
      { ...frame(2, -1), fullDataUrl: "data:image/jpeg;base64,ORIGINAL_2" },
    ];
    const select = vi.fn().mockReturnValue({
      kept: [frames[0], frames[1]],
      stats: { sampled: 3, rejectedBlur: 0, rejectedExposure: 0, rejectedSimilarity: 0 },
      keptScores: [0.42, 0.98],
    });

    const payload = await assembleDeepScanPayload(frames, { build, select });
    expect(payload.bestDataUrl).toBe("data:image/jpeg;base64,ORIGINAL_1");
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

  it("labels the local reject as not_rotated when similarity rejections dominate", async () => {
    const build = vi.fn().mockResolvedValue({ dataUrl: "x", tileCount: 2, bytes: 1 });
    await expect(
      assembleDeepScanPayload([frame(0, 100), frame(1, 100)], {
        build,
        stats: { sampled: 25, rejectedBlur: 0, rejectedExposure: 0, rejectedSimilarity: 24 },
      })
    ).rejects.toMatchObject({ reason: "not_rotated" });
  });

  it("maps reject reasons onto localized copy keys for the machine", () => {
    expect(DeepScanLocalReject.copyKey("all_blurry")).toBe("deepScan.localTooBlurry");
    expect(DeepScanLocalReject.copyKey("too_dark_or_bright")).toBe("deepScan.localTooDark");
    expect(DeepScanLocalReject.copyKey("not_rotated")).toBe("deepScan.localNotRotated");
  });

  it("mock deep-scan pipeline accepts any capture while default screening still rejects unusable frames", async () => {
    const darkFrames = [frame(0, 4), frame(1, 4), frame(2, 4)];
    // Default screening rejects dark frames
    await expect(
      assembleDeepScanPayload(darkFrames, { build: async () => ({ dataUrl: "x", tileCount: 0, bytes: 0 }) })
    ).rejects.toMatchObject({ reason: "too_dark_or_bright" });

    // Mock pipeline pass-through selector accepts any capture
    const payload = await assembleDeepScanPayload(darkFrames, {
      build: async () => ({ dataUrl: "composite", tileCount: 3, bytes: 100 }),
      select: (samples) => ({
        kept: samples,
        keptScores: samples.map(() => 0.5),
        stats: { sampled: samples.length, rejectedBlur: 0, rejectedExposure: 0, rejectedSimilarity: 0 },
      }),
    });
    expect(payload.sampleCount).toBe(3);
    expect(payload.composite.tileCount).toBe(3);
    expect(payload.stats.rejectedBlur + payload.stats.rejectedExposure).toBe(0);
  });

  it("rejects identical stationary frames as not_rotated when run with default selection", async () => {
    const build = vi.fn().mockResolvedValue({ dataUrl: "composite", tileCount: 2, bytes: 10 });
    // 25 identical frames with valid exposure and high contrast texture but zero motion
    const stationaryFrames: CollectedFrame[] = Array.from({ length: 25 }, (_, i) => {
      const gray = new Float32Array(24 * 24);
      for (let j = 0; j < gray.length; j++) gray[j] = j % 2 === 0 ? 50 : 200;
      const thumb = new Float32Array(24 * 24);
      for (let j = 0; j < thumb.length; j++) thumb[j] = 128;
      return {
        sequence: i,
        gray,
        grayW: 24,
        grayH: 24,
        thumb,
        dataUrl: `data:image/jpeg;base64,STATIONARY_${i}`,
      };
    });

    await expect(
      assembleDeepScanPayload(stationaryFrames, { build })
    ).rejects.toMatchObject({ reason: "not_rotated" });
    expect(build).not.toHaveBeenCalled();
  });

  it("records debug captures with all raw frames even on local reject", () => {
    const rawFrames = Array.from({ length: 25 }, (_, i) => `data:image/jpeg;base64,frame-${i}`);
    const record = {
      sessionId: "eval-rejected-session",
      at: new Date().toISOString(),
      sampleCount: rawFrames.length,
      keptDataUrls: [],
      allDataUrls: rawFrames,
      compositeDataUrl: null,
      rejectedReason: "all_blurry",
    };
    expect(record.sampleCount).toBe(25);
    expect(record.allDataUrls.length).toBe(25);
    expect(record.rejectedReason).toBe("all_blurry");
    expect(record.keptDataUrls.length).toBe(0);
  });
});
