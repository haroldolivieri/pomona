// Dev-only helpers (mock frames + local capture inspection). Imported lazily so they stay out of the production path.
import type { CollectedFrame } from "./deep-scan-capture";

// Valid 1x1 RGB PNG (150,140,120) - drawable by canvas in the mock composite.
const framePartMime = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOY1lMBAANWAZvtO/S2AAAAAElFTkSuQmCC";

export function mockDeepScanFrames(count = 6): CollectedFrame[] {
  return Array.from({ length: count }, (_, i) => {
    const gray = new Float32Array(24 * 24);
    for (let j = 0; j < gray.length; j++) {
      gray[j] = ((j % 24 ^ Math.floor(j / 24)) & 1) === 0 ? 220 : 35;
    }
    return {
      sequence: i,
      gray,
      grayW: 24,
      grayH: 24,
      thumb: new Float32Array(24 * 24).fill(i % 2 === 0 ? 105 : 150),
      dataUrl: framePartMime,
      fullDataUrl: framePartMime,
    };
  });
}

export interface DeepScanDebugCaptureRecord {
  sessionId: string;
  at: string;
  sampleCount: number;
  keptDataUrls: string[];
  allDataUrls: string[];
  compositeDataUrl?: string | null;
  rejectedReason?: string | null;
}

const debugCapturesKey = "pomona-ds-captures";
const debugCapturesLimit = 5;

export function saveDeepScanDebugCapture(record: DeepScanDebugCaptureRecord): void {
  try {
    if (typeof localStorage !== "undefined") {
      const prev = JSON.parse(localStorage.getItem(debugCapturesKey) ?? "[]") as DeepScanDebugCaptureRecord[];
      localStorage.setItem(
        debugCapturesKey,
        JSON.stringify([record, ...prev].slice(0, debugCapturesLimit))
      );
    }
  } catch {
    // Storage may be unavailable (privacy modes, test environments): inspection is best-effort.
  }
  try {
    if (typeof fetch !== "undefined") {
      fetch("/api/dev/debug-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).catch(() => {});
    }
  } catch {
    // Dev capture sync is best-effort.
  }
}

export function loadDeepScanDebugCaptures(): DeepScanDebugCaptureRecord[] {
  try {
    if (typeof localStorage === "undefined") return [];
    return JSON.parse(localStorage.getItem(debugCapturesKey) ?? "[]") as DeepScanDebugCaptureRecord[];
  } catch {
    return [];
  }
}
