import { selectFrames, type DeepScanSelectionParams, type DeepScanSelectionStats, type FrameSample } from "./deep-scan-frames";
import { buildComposite } from "./deep-scan-composite";

export const DEEP_SCAN_SELECTION: DeepScanSelectionParams = {
  max: 6,
  weights: { sharpness: 0.5, exposure: 0.2, spread: 0.3 },
  similarityLow: 4,
  similarityHigh: 45,
  blurRejectQuantile: 0.2,
};

export interface CollectedFrame extends FrameSample {
  dataUrl: string;
}

export type DeepScanLocalRejectReason = "all_blurry" | "too_dark_or_bright";

export class DeepScanLocalReject extends Error {
  constructor(readonly reason: DeepScanLocalRejectReason) {
    super(reason);
    this.name = "DeepScanLocalReject";
  }

  static copyKey(reason: DeepScanLocalRejectReason): string {
    return reason === "too_dark_or_bright" ? "deepScan.localTooDark" : "deepScan.localTooBlurry";
  }
}

export interface DeepScanPayload {
  composite: { dataUrl: string; tileCount: number };
  sampleCount: number;
  stats: DeepScanSelectionStats;
}

const MIN_KEPT = 2;

export async function assembleDeepScanPayload(
  collected: CollectedFrame[],
  deps: {
    build?: typeof buildComposite;
    select?: typeof selectFrames;
    stats?: DeepScanSelectionStats;
  } = {}
): Promise<DeepScanPayload> {
  const select = deps.select ?? selectFrames;
  const build = deps.build ?? buildComposite;

  if (collected.length < 2) {
    throw new DeepScanLocalReject("all_blurry");
  }

  let kept: FrameSample[];
  let stats: DeepScanSelectionStats;
  if (deps.stats) {
    stats = deps.stats;
    kept = [];
  } else {
    const selection = select(
      collected,
      DEEP_SCAN_SELECTION
    );
    kept = selection.kept;
    stats = selection.stats;
  }

  const keptUrls = collected
    .filter((f) => kept.some((k) => k.sequence === f.sequence))
    .map((f) => f.dataUrl);

  if (keptUrls.length < MIN_KEPT) {
    const reason: DeepScanLocalRejectReason =
      stats.rejectedExposure > stats.rejectedBlur ? "too_dark_or_bright" : "all_blurry";
    throw new DeepScanLocalReject(reason);
  }

  const composite = await build(keptUrls);
  return {
    composite: { dataUrl: composite.dataUrl, tileCount: composite.tileCount },
    sampleCount: collected.length,
    stats,
  };
}
