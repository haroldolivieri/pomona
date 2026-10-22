import { describe, it, expect } from "vitest";
import {
  selectFrames,
  sharpnessScore,
  exposureScore,
  similarityScore,
} from "../src/lib/deep-scan-frames";
import type { FrameSample, DeepScanSelectionParams } from "../src/lib/deep-scan-frames";

const THUMB = 32 * 32;

const params: DeepScanSelectionParams = {
  max: 6,
  weights: { sharpness: 0.5, exposure: 0.2, spread: 0.3 },
  similarityLow: 4,
  similarityHigh: 45,
  blurRejectQuantile: 0.2,
};

type Pattern = "checker" | "mid-flat" | "dark" | "identical" | "diverse";

function sampleGrid(w: number, h: number, pattern: Pattern, seq: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      switch (pattern) {
        case "checker":
        case "identical":
          g[i] = ((x ^ y) & 1) === 0 ? 255 : 0;
          break;
        case "diverse":
          g[i] = (((x + seq) ^ y) & 1) === 0 ? 255 : 0;
          break;
        case "mid-flat":
          g[i] = 128;
          break;
        case "dark":
          g[i] = 0;
          break;
      }
    }
  }
  return g;
}

function makeFrame(seq: number, pattern: Pattern): FrameSample {
  const gray = sampleGrid(8, 8, pattern, seq);
  const thumb = new Float32Array(THUMB);
  for (let i = 0; i < THUMB; i++) {
    const x = i % 32;
    const y = Math.floor(i / 32);
    switch (pattern) {
      case "checker":
      case "identical":
        thumb[i] = ((x ^ y) & 1) === 0 ? 255 : 0;
        break;
      case "diverse":
        thumb[i] = (((x + seq) ^ y) & 1) === 0 ? 255 : 0;
        break;
      case "mid-flat":
        thumb[i] = 128;
        break;
      case "dark":
        thumb[i] = 0;
        break;
    }
  }
  return { sequence: seq, gray, grayW: 8, grayH: 8, thumb };
}

function batch(n: number, pattern: Pattern): FrameSample[] {
  return Array.from({ length: n }, (_, s) => makeFrame(s, pattern));
}

describe("score helpers", () => {
  it("checker frames are sharper than flat frames", () => {
    const sharp = sharpnessScore(makeFrame(0, "checker").gray, 8, 8);
    const flat = sharpnessScore(makeFrame(0, "mid-flat").gray, 8, 8);
    expect(sharp).toBeGreaterThan(flat);
    expect(sharp).toBeGreaterThan(0.9);
    expect(flat).toBe(0);
  });

  it("dark frames score zero exposure, midtones score high", () => {
    expect(exposureScore(makeFrame(0, "dark").gray)).toBe(0);
    expect(exposureScore(makeFrame(0, "checker").gray)).toBeGreaterThan(0.9);
  });

  it("identical thumbs have zero similarity", () => {
    const t = makeFrame(0, "checker").thumb;
    expect(similarityScore(t, t)).toBe(0);
  });

  it("diverse thumbs differ more than the duplicate band and scale on 0..100", () => {
    const sim = similarityScore(makeFrame(0, "diverse").thumb, makeFrame(1, "diverse").thumb);
    expect(sim).toBeGreaterThan(params.similarityLow);
    expect(sim).toBeLessThanOrEqual(100);
  });
});

describe("selectFrames", () => {
  it("keeps 6 sharp diverse frames in sequence order without near-duplicates", () => {
    const { kept, stats } = selectFrames(batch(25, "diverse"), params);
    expect(kept).toHaveLength(6);
    expect(stats.sampled).toBe(25);
    for (let i = 1; i < kept.length; i++) {
      expect(kept[i].sequence).toBeGreaterThan(kept[i - 1].sequence);
      expect(similarityScore(kept[i].thumb, kept[i - 1].thumb)).toBeGreaterThanOrEqual(
        params.similarityLow
      );
    }
  });

  it("rejects an all-blurry batch via the sharpness floor", () => {
    const { kept, stats } = selectFrames(batch(25, "mid-flat"), params);
    expect(kept).toHaveLength(0);
    expect(stats.rejectedBlur).toBe(25);
    expect(stats.sampled).toBe(25);
  });

  it("rejects an all-dark batch as exposure failures", () => {
    const { kept, stats } = selectFrames(batch(25, "dark"), params);
    expect(kept).toHaveLength(0);
    expect(stats.rejectedExposure).toBe(25);
  });

  it("keeps exactly one of 25 identical frames and counts the rest as duplicates", () => {
    const { kept, stats } = selectFrames(batch(25, "identical"), params);
    expect(kept).toHaveLength(1);
    expect(stats.rejectedSimilarity).toBe(24);
    expect(stats.rejectedBlur).toBe(0);
  });

  it("is deterministic across runs", () => {
    const a = selectFrames(batch(25, "diverse"), params);
    const b = selectFrames(batch(25, "diverse"), params);
    expect(b).toEqual(a);
  });

  it("accepts the 30-sample upper bound and still returns at most 6", () => {
    const { kept, stats } = selectFrames(batch(30, "diverse"), params);
    expect(stats.sampled).toBe(30);
    expect(kept).toHaveLength(6);
  });
});
