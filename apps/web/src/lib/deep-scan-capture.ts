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

// Valid 1x1 RGB PNG (150,140,120) — drawable by canvas in the mock composite.
const FRAME_PART_MIME = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOY1lMBAANWAZvtO/S2AAAAAElFTkSuQmCC";

export function mockDeepScanFrames(count = 6): CollectedFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    sequence: i,
    gray: new Float32Array(24 * 24).fill(i % 2 === 0 ? 110 : 140),
    grayW: 24,
    grayH: 24,
    thumb: new Float32Array(24 * 24).fill(i % 2 === 0 ? 105 : 150),
    dataUrl: FRAME_PART_MIME,
  }));
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

  if (keptUrls.length < MIN_KEPT) {
    const reason: DeepScanLocalRejectReason =
      stats.rejectedExposure > stats.rejectedBlur ? "too_dark_or_bright" : "all_blurry";
    throw new DeepScanLocalReject(reason);
  }

  const composite = await build(keptUrls);
  const bestIndex = keptScores.length > 0 ? keptScores.indexOf(Math.max(...keptScores)) : -1;
  const bestDataUrl =
    bestIndex >= 0 && bestIndex < keptUrls.length ? keptUrls[bestIndex] : keptUrls[0];
  return {
    composite: { dataUrl: composite.dataUrl, tileCount: composite.tileCount },
    sampleCount: collected.length,
    stats,
    keptDataUrls: keptUrls,
    bestDataUrl,
  };
}

export interface DeepScanDebugCaptureRecord {
  sessionId: string;
  at: string;
  sampleCount: number;
  keptDataUrls: string[];
  compositeDataUrl: string;
}

const DEBUG_CAPTURES_KEY = "pomona-ds-captures";
const DEBUG_CAPTURES_LIMIT = 5;

export function saveDeepScanDebugCapture(record: DeepScanDebugCaptureRecord): void {
  try {
    if (typeof localStorage === "undefined") return;
    const prev = JSON.parse(localStorage.getItem(DEBUG_CAPTURES_KEY) ?? "[]") as DeepScanDebugCaptureRecord[];
    localStorage.setItem(
      DEBUG_CAPTURES_KEY,
      JSON.stringify([record, ...prev].slice(0, DEBUG_CAPTURES_LIMIT))
    );
  } catch {
    // Storage may be unavailable (privacy modes, test environments): inspection is best-effort.
  }
}

export function loadDeepScanDebugCaptures(): DeepScanDebugCaptureRecord[] {
  try {
    if (typeof localStorage === "undefined") return [];
    return JSON.parse(localStorage.getItem(DEBUG_CAPTURES_KEY) ?? "[]") as DeepScanDebugCaptureRecord[];
  } catch {
    return [];
  }
}
