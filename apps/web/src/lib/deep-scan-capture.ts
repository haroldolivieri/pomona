import {
  selectFrames,
  evaluateFrameRejection,
  DEEP_SCAN_SELECTION,
  type DeepScanSelectionParams,
  type DeepScanSelectionStats,
  type FrameSample,
} from "./deep-scan-frames";
import { buildComposite } from "./deep-scan-composite";

export { DEEP_SCAN_SELECTION };

export interface CollectedFrame extends FrameSample {
  dataUrl: string;
  fullDataUrl?: string;
}

export type DeepScanLocalRejectReason = "all_blurry" | "too_dark_or_bright" | "not_rotated";

export class DeepScanLocalReject extends Error {
  constructor(readonly reason: DeepScanLocalRejectReason) {
    super(reason);
  }

  static copyKey(reason: DeepScanLocalRejectReason): string {
    switch (reason) {
      case "not_rotated":
        return "deepScan.localNotRotated";
      case "too_dark_or_bright":
        return "deepScan.localTooDark";
      case "all_blurry":
      default:
        return "deepScan.localTooBlurry";
    }
  }
}

export interface DeepScanPayload {
  composite: { dataUrl: string; tileCount: number };
  sampleCount: number;
  stats: DeepScanSelectionStats;
  keptDataUrls: string[];
  bestDataUrl: string;
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
  let keptScores: number[];
  if (deps.stats) {
    stats = deps.stats;
    kept = [];
    keptScores = [];
  } else {
    const selection = select(
      collected,
      DEEP_SCAN_SELECTION
    );
    kept = selection.kept;
    stats = selection.stats;
    keptScores = selection.keptScores ?? kept.map(() => 0);
  }

  const keptUrls = collected
    .filter((f) => kept.some((k) => k.sequence === f.sequence))
    .map((f) => f.dataUrl);

  const rejection =
    (typeof window !== "undefined" && (window as any).__POMONA_BYPASS_LOCAL_REJECT)
      ? null
      : evaluateFrameRejection(stats, keptUrls.length, MIN_KEPT);
  if (rejection) {
    throw new DeepScanLocalReject(rejection);
  }

  const composite = await build(keptUrls);
  const bestIndex = keptScores.length > 0 ? keptScores.indexOf(Math.max(...keptScores)) : -1;
  const bestKeptSample = bestIndex >= 0 && bestIndex < kept.length ? kept[bestIndex] : kept[0];
  const bestFrame = collected.find((f) => f.sequence === bestKeptSample?.sequence) || collected[0];
  const bestDataUrl = bestFrame?.fullDataUrl || bestFrame?.dataUrl || keptUrls[0];
  return {
    composite: { dataUrl: composite.dataUrl, tileCount: composite.tileCount },
    sampleCount: collected.length,
    stats,
    keptDataUrls: keptUrls,
    bestDataUrl,
  };
}
