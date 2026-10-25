export {
  type FrameSample,
  type DeepScanSelectionParams,
  type DeepScanSelectionStats,
  type DeepScanLocalRejectReason,
  DEEP_SCAN_SELECTION,
  EXPOSURE_FAIL_MIN,
  sharpnessScore,
  exposureScore,
  similarityScore,
  selectFrames,
  evaluateFrameRejection,
} from "@pomona/contract";

export type { CollectedFrame } from "./deep-scan-capture";
import type { CollectedFrame } from "./deep-scan-capture";
import { captureDeepScanCrop, captureViewportCrop, computeDeepScanCropRect } from "./image-pipeline";

export const DEEP_SCAN_CAPTURE_DURATION_MS = 5000;
export const DEEP_SCAN_TOTAL_SAMPLES = 25;

export async function collectDeepScanFrames(
  video: HTMLVideoElement,
  signal?: AbortSignal
): Promise<CollectedFrame[]> {
  if (typeof window !== "undefined" && (window as any).__POMONA_MOCK_FRAMES) {
    const delay =
      typeof (window as any).__POMONA_MOCK_CAPTURE_DELAY_MS === "number"
        ? (window as any).__POMONA_MOCK_CAPTURE_DELAY_MS
        : 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const { mockDeepScanFrames } = await import("./deep-scan-debug");
    return mockDeepScanFrames();
  }
  const collected: CollectedFrame[] = [];
  const start = performance.now();
  const DURATION_MS =
    (typeof window !== "undefined" && typeof (window as any).__POMONA_DEEP_SCAN_DURATION_MS === "number")
      ? (window as any).__POMONA_DEEP_SCAN_DURATION_MS
      : DEEP_SCAN_CAPTURE_DURATION_MS;
  const TOTAL_SAMPLES =
    (typeof window !== "undefined" && typeof (window as any).__POMONA_DEEP_SCAN_SAMPLES === "number")
      ? (window as any).__POMONA_DEEP_SCAN_SAMPLES
      : DEEP_SCAN_TOTAL_SAMPLES;
  const INTERVAL_MS = DURATION_MS / TOTAL_SAMPLES;
  let sequence = 0;
  let lastAt = -Infinity;

  const gw = 64;
  const gh = 64;
  const sampling = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (sampling) {
    sampling.width = gw;
    sampling.height = gh;
  }
  const ctx = sampling?.getContext("2d");

  const tw = 32;
  const th = 32;

  const sampleNow = (
    dataUrl: string,
    crop?: { sx: number; sy: number; sw: number; sh: number }
  ): CollectedFrame => {
    let gray = new Float32Array(gw * gh).fill(128);
    let thumb = new Float32Array(tw * th).fill(128);
    if (ctx) {
      gray = new Float32Array(gw * gh);
      thumb = new Float32Array(tw * th);
      if (crop && crop.sw > 0 && crop.sh > 0) {
        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, gw, gh);
      } else {
        ctx.drawImage(video, 0, 0, gw, gh);
      }
      const { data } = ctx.getImageData(0, 0, gw, gh);
      for (let i = 0; i < gray.length; i++) {
        const val = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        gray[i] = val;
      }
      // Downsample 64x64 gray to 32x32 thumbnail for noise-resistant rotation tracking
      for (let ty = 0; ty < th; ty++) {
        const sy = ty * 2;
        for (let tx = 0; tx < tw; tx++) {
          const sx = tx * 2;
          const v00 = gray[sy * gw + sx];
          const v01 = gray[sy * gw + sx + 1];
          const v10 = gray[(sy + 1) * gw + sx];
          const v11 = gray[(sy + 1) * gw + sx + 1];
          thumb[ty * tw + tx] = (v00 + v01 + v10 + v11) * 0.25;
        }
      }
    }
    return { sequence, gray, grayW: gw, grayH: gh, thumb, dataUrl };
  };

  while (performance.now() - start < DURATION_MS) {
    if (signal?.aborted) break;
    const now = performance.now();
    if (now - lastAt >= INTERVAL_MS) {
      lastAt = now;
      const cw = video.clientWidth || video.parentElement?.clientWidth || 320;
      const ch = video.clientHeight || video.parentElement?.clientHeight || 320;
      const crop = computeDeepScanCropRect(video.videoWidth, video.videoHeight, cw, ch);
      const dataUrl = captureDeepScanCrop(video, cw, ch, "image/jpeg", 0.85);
      const fullDataUrl = captureViewportCrop(video, cw, ch, "image/jpeg", 0.85);
      const fallbackUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOY1lMBAANWAZvtO/S2AAAAAElFTkSuQmCC";
      const safeDataUrl = dataUrl || fallbackUrl;
      const safeFullDataUrl = fullDataUrl || fallbackUrl;
      collected.push({ ...sampleNow(safeDataUrl, crop), dataUrl: safeDataUrl, fullDataUrl: safeFullDataUrl });
      sequence += 1;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return collected;
}
