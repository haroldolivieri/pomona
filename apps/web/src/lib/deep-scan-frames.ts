export interface FrameSample {
  sequence: number;
  gray: Float32Array;
  grayW: number;
  grayH: number;
  thumb: Float32Array;
}

export interface DeepScanSelectionParams {
  max: number;
  weights: { sharpness: number; exposure: number; spread: number };
  similarityLow: number;
  similarityHigh: number;
  blurRejectQuantile: number;
}

export interface DeepScanSelectionStats {
  sampled: number;
  rejectedBlur: number;
  rejectedExposure: number;
  rejectedSimilarity: number;
}

const EXPOSURE_FAIL_MIN = 0.05;
const KEEP_SCORE_MIN = 0.35;

export function sharpnessScore(gray: Float32Array, w: number, h: number): number {
  let energy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = x + 1 < w ? Math.abs(gray[i + 1] - gray[i]) : 0;
      const dy = y + 1 < h ? Math.abs(gray[i + w] - gray[i]) : 0;
      energy += (dx + dy) / 2;
    }
  }
  return Math.min(1, energy / (w * h) / 128);
}

export function exposureScore(gray: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length / 255;
  return Math.max(0, 1 - Math.abs(mean - 0.5) * 2);
}

export function similarityScore(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("thumb length mismatch");
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  const mean = diff / a.length;
  return Math.min(100, Math.round((mean / 255) * 10000) / 100);
}

export function selectFrames(
  samples: FrameSample[],
  params: DeepScanSelectionParams
): { kept: FrameSample[]; stats: DeepScanSelectionStats; keptScores: number[] } {
  const stats: DeepScanSelectionStats = {
    sampled: samples.length,
    rejectedBlur: 0,
    rejectedExposure: 0,
    rejectedSimilarity: 0,
  };
  const keptScores: number[] = [];

  const survivors: { sample: FrameSample; sharp: number; exposure: number }[] = [];
  for (const sample of samples) {
    const exposure = exposureScore(sample.gray);
    if (exposure < EXPOSURE_FAIL_MIN) {
      stats.rejectedExposure++;
      continue;
    }
    const sharp = sharpnessScore(sample.gray, sample.grayW, sample.grayH);
    if (sharp < params.blurRejectQuantile) {
      stats.rejectedBlur++;
      continue;
    }
    survivors.push({ sample, sharp, exposure });
  }

  const ordered = survivors
    .slice()
    .sort((a, b) => a.sample.sequence - b.sample.sequence);
  const kept: FrameSample[] = [];

  for (const candidate of ordered) {
    if (kept.length >= params.max) break;
    if (kept.length === 0) {
      kept.push(candidate.sample);
      keptScores.push(
        params.weights.sharpness * candidate.sharp + params.weights.exposure * candidate.exposure
      );
      continue;
    }
    const lastThumb = kept[kept.length - 1].thumb;
    const sim = similarityScore(candidate.sample.thumb, lastThumb);
    if (sim < params.similarityLow) {
      stats.rejectedSimilarity++;
      continue;
    }
    const spread = sim > params.similarityHigh
      ? Math.max(0, 1 - (sim - params.similarityHigh) / 100)
      : sim / params.similarityHigh;
    const score =
      params.weights.sharpness * candidate.sharp +
      params.weights.exposure * candidate.exposure +
      params.weights.spread * spread;
    keptScores.push(score);
    kept.push(candidate.sample);
  }

  return { kept, stats, keptScores };
}

export type { CollectedFrame } from "./deep-scan-capture";
import type { CollectedFrame } from "./deep-scan-capture";
import { captureViewportCrop } from "./image-pipeline";

export async function collectDeepScanFrames(
  video: HTMLVideoElement
): Promise<CollectedFrame[]> {
  const collected: CollectedFrame[] = [];
  const start = performance.now();
  const DURATION_MS = 5000;
  const FPS = 5;
  const INTERVAL_MS = 1000 / FPS;
  let sequence = 0;
  let lastAt = -Infinity;

  const sampleNow = (dataUrl: string): CollectedFrame => {
    const gw = 24;
    const gh = 24;
    const sampling = document.createElement("canvas");
    sampling.width = gw;
    sampling.height = gh;
    const ctx = sampling.getContext("2d");
    let gray = new Float32Array(gw * gh).fill(128);
    let thumb = new Float32Array(gw * gh).fill(128);
    if (ctx) {
      gray = new Float32Array(gw * gh);
      ctx.drawImage(video, 0, 0, gw, gh);
      const { data } = ctx.getImageData(0, 0, gw, gh);
      for (let i = 0; i < gray.length; i++) {
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      }
      thumb = new Float32Array(gw * gh);
      ctx.drawImage(video, 0, 0, gw, gh);
      const thumbData = ctx.getImageData(0, 0, gw, gh).data;
      for (let i = 0; i < thumb.length; i++) {
        thumb[i] = 0.299 * thumbData[i * 4] + 0.587 * thumbData[i * 4 + 1] + 0.114 * thumbData[i * 4 + 2];
      }
    }
    return { sequence, gray, grayW: gw, grayH: gh, thumb, dataUrl };
  };

  while (performance.now() - start < DURATION_MS) {
    const now = performance.now();
    if (now - lastAt >= INTERVAL_MS) {
      lastAt = now;
      const dataUrl = captureViewportCrop(video, video.clientWidth || 320, video.clientHeight || 320, "image/jpeg", 0.85);
      collected.push(sampleNow(dataUrl));
      sequence += 1;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return collected;
}
