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
  stationaryRatio?: number;
  rotationSpread?: number;
}

export const DEEP_SCAN_SELECTION: DeepScanSelectionParams = {
  max: 6,
  weights: { sharpness: 0.5, exposure: 0.2, spread: 0.3 },
  similarityLow: 3.5,
  similarityHigh: 45,
  blurRejectQuantile: 0.08,
};

export type DeepScanLocalRejectReason = "all_blurry" | "too_dark_or_bright" | "not_rotated";

export type CompareLocalRejectReason = "all_blurry" | "too_dark_or_bright";

export interface CompareFrameValidationParams {
  blurRejectQuantile: number;
  exposureFailMin: number;
}

export const COMPARE_FRAME_VALIDATION: CompareFrameValidationParams = {
  blurRejectQuantile: 0.08,
  exposureFailMin: 0.05,
};

export const EXPOSURE_FAIL_MIN = 0.05;

export function evaluateCompareFrame(
  gray: Float32Array,
  w: number,
  h: number,
  params: CompareFrameValidationParams = COMPARE_FRAME_VALIDATION
): CompareLocalRejectReason | null {
  const exposure = exposureScore(gray);
  if (exposure < params.exposureFailMin) {
    return "too_dark_or_bright";
  }
  const sharp = sharpnessScore(gray, w, h);
  if (sharp < params.blurRejectQuantile) {
    return "all_blurry";
  }
  return null;
}

export function sharpnessScore(gray: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let lapEnergy = 0;
  const count = (w - 2) * (h - 2);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = gray[i + 1] + gray[i - 1] + gray[i + w] + gray[i - w] - 4 * gray[i];
      lapEnergy += Math.abs(lap);
    }
  }
  return Math.min(1, (lapEnergy / count) / 64);
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
  params: DeepScanSelectionParams = DEEP_SCAN_SELECTION
): { kept: FrameSample[]; stats: DeepScanSelectionStats; keptScores: number[] } {
  const stats: DeepScanSelectionStats = {
    sampled: samples.length,
    rejectedBlur: 0,
    rejectedExposure: 0,
    rejectedSimilarity: 0,
  };
  const keptScores: number[] = [];

  if (samples.length === 0) {
    return { kept: [], stats, keptScores };
  }

  interface ScoredCandidate {
    sample: FrameSample;
    sharp: number;
    exposure: number;
    quality: number;
    binIndex: number;
  }

  const orderedSamples = samples.slice().sort((a, b) => a.sequence - b.sequence);
  const targetCount = params.max;
  const validCandidates: ScoredCandidate[] = [];

  let stationaryAdjacentCount = 0;
  for (let i = 1; i < orderedSamples.length; i++) {
    if (similarityScore(orderedSamples[i].thumb, orderedSamples[i - 1].thumb) < params.similarityLow) {
      stationaryAdjacentCount++;
    }
  }
  stats.stationaryRatio = orderedSamples.length > 1
    ? stationaryAdjacentCount / (orderedSamples.length - 1)
    : 0;

  for (let i = 0; i < orderedSamples.length; i++) {
    const sample = orderedSamples[i];
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
    const quality = params.weights.sharpness * sharp + params.weights.exposure * exposure;
    const binIndex = Math.min(targetCount - 1, Math.floor((i * targetCount) / orderedSamples.length));
    validCandidates.push({ sample, sharp, exposure, quality, binIndex });
  }

  // Temporal Sector Binning (guarantee physical angle spread across 360-degree rotation)
  const bins: ScoredCandidate[][] = Array.from({ length: targetCount }, () => []);
  for (const candidate of validCandidates) {
    bins[candidate.binIndex].push(candidate);
  }

  for (const bin of bins) {
    bin.sort((a, b) => b.quality - a.quality);
  }

  const selected: ScoredCandidate[] = [];
  const rejectedAsDuplicate = new Set<FrameSample>();

  const isTooSimilar = (candidate: ScoredCandidate, existingList: ScoredCandidate[]): boolean => {
    if (existingList.length === 0) return false;
    const last = existingList[existingList.length - 1];
    const sim = similarityScore(candidate.sample.thumb, last.sample.thumb);
    return sim < params.similarityLow;
  };

  // Pass 1: Proactively select the best sharp frame from each distinct temporal sector
  for (let b = 0; b < targetCount; b++) {
    if (selected.length >= targetCount) break;
    const bin = bins[b];
    for (const candidate of bin) {
      if (isTooSimilar(candidate, selected)) {
        if (!rejectedAsDuplicate.has(candidate.sample)) {
          rejectedAsDuplicate.add(candidate.sample);
          stats.rejectedSimilarity++;
        }
        continue;
      }
      selected.push(candidate);
      break;
    }
  }

  // Pass 2: If any sector was missing, borrow the clearest unchosen frame from adjacent sectors
  if (selected.length < targetCount) {
    const remainingCandidates: ScoredCandidate[] = [];
    for (const bin of bins) {
      for (const candidate of bin) {
        if (!selected.includes(candidate) && !rejectedAsDuplicate.has(candidate.sample)) {
          remainingCandidates.push(candidate);
        }
      }
    }
    remainingCandidates.sort((a, b) => b.quality - a.quality);

    for (const candidate of remainingCandidates) {
      if (selected.length >= targetCount) break;
      if (isTooSimilar(candidate, selected)) {
        if (!rejectedAsDuplicate.has(candidate.sample)) {
          rejectedAsDuplicate.add(candidate.sample);
          stats.rejectedSimilarity++;
        }
        continue;
      }
      selected.push(candidate);
    }
  }

  // Count any remaining candidates that were never selected and are near-duplicates
  for (const candidate of validCandidates) {
    if (!selected.includes(candidate) && !rejectedAsDuplicate.has(candidate.sample)) {
      if (isTooSimilar(candidate, selected)) {
        rejectedAsDuplicate.add(candidate.sample);
        stats.rejectedSimilarity++;
      }
    }
  }

  selected.sort((a, b) => a.sample.sequence - b.sample.sequence);

  let maxPairwiseDiff = 0;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const d = similarityScore(selected[i].sample.thumb, selected[j].sample.thumb);
      if (d > maxPairwiseDiff) {
        maxPairwiseDiff = d;
      }
    }
  }
  stats.rotationSpread = selected.length > 1 ? maxPairwiseDiff : 0;

  const kept: FrameSample[] = [];
  for (const item of selected) {
    kept.push(item.sample);
    const minNeighborDiff = selected.length > 1
      ? Math.min(...selected.filter((o) => o !== item).map((o) => similarityScore(item.sample.thumb, o.sample.thumb)))
      : 50;
    const spread = minNeighborDiff > params.similarityHigh
      ? Math.max(0, 1 - (minNeighborDiff - params.similarityHigh) / 100)
      : minNeighborDiff / params.similarityHigh;
    const score =
      params.weights.sharpness * item.sharp +
      params.weights.exposure * item.exposure +
      params.weights.spread * spread;
    keptScores.push(score);
  }

  return { kept, stats, keptScores };
}

export function evaluateFrameRejection(
  stats: DeepScanSelectionStats,
  keptCount: number,
  minKept = 2
): DeepScanLocalRejectReason | null {
  if (stats.rejectedBlur > stats.sampled * 0.7) {
    return "all_blurry";
  }
  if (stats.rejectedExposure > stats.sampled * 0.6) {
    return "too_dark_or_bright";
  }
  if (stats.stationaryRatio !== undefined && stats.stationaryRatio >= 0.55) {
    return "not_rotated";
  }
  if (stats.rotationSpread !== undefined && keptCount >= minKept && stats.rotationSpread < 6.5) {
    return "not_rotated";
  }
  if (keptCount >= minKept) return null;
  if (
    (stats.stationaryRatio !== undefined && stats.stationaryRatio >= 0.35) ||
    stats.rejectedSimilarity >= stats.rejectedBlur
  ) {
    return "not_rotated";
  }
  if (stats.rejectedExposure > stats.rejectedBlur) {
    return "too_dark_or_bright";
  }
  return "all_blurry";
}
