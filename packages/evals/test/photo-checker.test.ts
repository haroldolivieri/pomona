import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  sharpnessScore,
  similarityScore,
  exposureScore,
  selectFrames,
  evaluateFrameRejection,
  evaluateCompareFrame,
  DEEP_SCAN_SELECTION,
  type FrameSample,
  type DeepScanSelectionParams,
} from "@pomona/contract";
import { verifyAndResolveDeepScanResponse } from "@pomona/proxy";
import type { DeepScanRequest, DeepScanResponseModel } from "@pomona/contract";
import { extractTilesFromJpeg } from "./tile-extractor";

const THUMB_SIZE = 32 * 32;

function makeSyntheticFrame(
  sequence: number,
  pattern: "sharp-checker" | "blurry-flat" | "stationary-identical" | "rotational-sweep" | "dark" | "produce-avocado",
  angleStep = 0
): FrameSample {
  const w = 16;
  const h = 16;
  const gray = new Float32Array(w * h);
  const thumb = new Float32Array(THUMB_SIZE);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      switch (pattern) {
        case "sharp-checker":
          gray[idx] = ((x ^ y) & 1) === 0 ? 240 : 15;
          break;
        case "blurry-flat":
          // Very low gradient / smoothed flat surface (typical severe motion blur)
          gray[idx] = 120 + Math.sin(x * 0.1) * 2;
          break;
        case "stationary-identical":
          // Identical texture on every frame (zero camera rotation)
          gray[idx] = ((x ^ y) & 1) === 0 ? 220 : 35;
          break;
        case "rotational-sweep":
          // Shifting high-contrast phase simulating rotating around a 3D fruit
          gray[idx] = (((x + angleStep) ^ y) & 1) === 0 ? 255 : 0;
          break;
        case "dark":
          gray[idx] = 2;
          break;
        case "produce-avocado": {
          // Synthetic produce contour: smooth skin + perimeter edge against background
          const distSq = (x - 7.5) ** 2 + (y - 7.5) ** 2;
          if (distSq <= 28) {
            gray[idx] = 65 + (((x + angleStep) * 5 + y * 7) % 9) * 3;
          } else {
            gray[idx] = 190;
          }
          break;
        }
      }
    }
  }

  for (let i = 0; i < THUMB_SIZE; i++) {
    const x = i % 32;
    const y = Math.floor(i / 32);
    switch (pattern) {
      case "sharp-checker":
      case "stationary-identical":
        thumb[i] = ((x ^ y) & 1) === 0 ? 220 : 35;
        break;
      case "blurry-flat":
        thumb[i] = 120;
        break;
      case "rotational-sweep":
        thumb[i] = (((x + angleStep) ^ y) & 1) === 0 ? 255 : 0;
        break;
      case "dark":
        thumb[i] = 2;
        break;
      case "produce-avocado": {
        const rad = (angleStep * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = x - 15.5;
        const dy = y - 15.5;
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        if ((rx * rx) / 60 + (ry * ry) / 130 <= 1) {
          thumb[i] = 60 + ((Math.floor(rx + 20) * 5 + Math.floor(ry + 20) * 7) % 13) * 6;
        } else {
          thumb[i] = 190;
        }
        break;
      }
    }
  }

  return { sequence, gray, grayW: w, grayH: h, thumb };
}

describe("photo-checker deterministic evals", () => {
  const customParams: DeepScanSelectionParams = {
    ...DEEP_SCAN_SELECTION,
  };

  describe("blur detection acceptance and failure scenarios", () => {
    it("sharpnessScore differentiates in-focus contrast from heavy motion blur", () => {
      const sharp = makeSyntheticFrame(0, "sharp-checker");
      const blurry = makeSyntheticFrame(1, "blurry-flat");

      const sharpScore = sharpnessScore(sharp.gray, sharp.grayW, sharp.grayH);
      const blurScore = sharpnessScore(blurry.gray, blurry.grayW, blurry.grayH);

      expect(sharpScore).toBeGreaterThan(0.7);
      expect(blurScore).toBeLessThan(0.05);
      expect(sharpScore).toBeGreaterThan(blurScore * 10);
    });

    it("accepts realistic produce (e.g. avocado / tomato texture) without false blur rejection", () => {
      const smoothProduceFrames = Array.from({ length: 25 }, (_, i) =>
        makeSyntheticFrame(i, "produce-avocado", (i * 360) / 25)
      );

      const sharp = sharpnessScore(smoothProduceFrames[0].gray, smoothProduceFrames[0].grayW, smoothProduceFrames[0].grayH);
      expect(sharp).toBeGreaterThanOrEqual(0.08);
      expect(sharp).toBeLessThanOrEqual(1.0);

      const { kept, stats } = selectFrames(smoothProduceFrames, customParams);
      expect(stats.rejectedBlur).toBe(0);
      expect(kept.length).toBeGreaterThanOrEqual(5);
      expect(evaluateFrameRejection(stats, kept.length)).toBeNull();
    });

    it("rejects motion-blurred smeared frames from entering the 6-tile inspection grid", () => {
      // Simulates real user capture where rapid camera translation produces motion blur in frames 2 to 6
      // Sharp frames score ~0.11-0.15, motion-smeared frames score ~0.04-0.078 (< 0.08 threshold)
      const capturedFrames = Array.from({ length: 22 }, (_, seq) => {
        const isSmeared = [2, 3, 4, 5, 6, 9, 11, 12, 14, 15, 18].includes(seq);
        const w = 64;
        const h = 64;
        const gray = new Float32Array(w * h);
        const thumb = new Float32Array(THUMB_SIZE);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (isSmeared) {
              // Directionally smeared low-curvature gradient (Laplacian energy ~0.05)
              gray[idx] = 120 + Math.sin((x + y) * 0.08) * 6;
            } else {
              // In-focus produce with visible edge and texture (Laplacian energy > 0.12)
              gray[idx] = ((x ^ y) & 2) === 0 ? 210 : 40;
            }
          }
        }
        for (let i = 0; i < THUMB_SIZE; i++) {
          const tx = i % 32;
          const ty = Math.floor(i / 32);
          thumb[i] = (((tx + seq * 2) ^ ty) & 2) === 0 ? 210 : 40;
        }
        return { sequence: seq, gray, grayW: w, grayH: h, thumb };
      });

      const { kept, stats } = selectFrames(capturedFrames, customParams);

      expect(stats.rejectedBlur).toBe(11);
      // None of the smeared frames may ever be kept in the 6-tile grid
      for (const k of kept) {
        expect([2, 3, 4, 5, 6, 9, 11, 12, 14, 15, 18]).not.toContain(k.sequence);
      }
      expect(kept.length).toBeGreaterThanOrEqual(4);
      expect(evaluateFrameRejection(stats, kept.length)).toBeNull();
    });

    it("catches 25 blurry frames and rejects the capture locally with all_blurry", () => {
      const blurryBatch = Array.from({ length: 25 }, (_, i) => makeSyntheticFrame(i, "blurry-flat"));

      const { kept, stats } = selectFrames(blurryBatch, customParams);

      expect(stats.sampled).toBe(25);
      expect(stats.rejectedBlur).toBe(25);
      expect(stats.rejectedSimilarity).toBe(0);
      expect(kept).toHaveLength(0);

      const decision = evaluateFrameRejection(stats, kept.length);
      expect(decision).toBe("all_blurry");
    });

    it("tolerates occasional transient blur when other sectors provide sharp frames", () => {
      // 5 blurry frames in the middle, 20 sharp rotating frames elsewhere
      const mixedBatch = Array.from({ length: 25 }, (_, i) =>
        i >= 10 && i < 15
          ? makeSyntheticFrame(i, "blurry-flat")
          : makeSyntheticFrame(i, "rotational-sweep", i)
      );

      const { kept, stats } = selectFrames(mixedBatch, customParams);

      expect(stats.rejectedBlur).toBe(5);
      expect(kept.length).toBeGreaterThanOrEqual(5);
      // Ensure none of the blurry frames were kept
      for (const k of kept) {
        expect(k.sequence < 10 || k.sequence >= 15).toBe(true);
      }
      expect(evaluateFrameRejection(stats, kept.length)).toBeNull();
    });
  });

  describe("similarity & no-rotation detection scenarios", () => {
    it("similarityScore yields near-zero difference for identical frames and high difference for rotated views", () => {
      const f1 = makeSyntheticFrame(0, "stationary-identical");
      const f2 = makeSyntheticFrame(1, "stationary-identical");
      const fRotated = makeSyntheticFrame(2, "rotational-sweep", 8);

      const identicalDiff = similarityScore(f1.thumb, f2.thumb);
      const rotatedDiff = similarityScore(f1.thumb, fRotated.thumb);

      expect(identicalDiff).toBe(0);
      expect(rotatedDiff).toBeGreaterThan(customParams.similarityLow);
    });

    it("catches 25 stationary frames (no rotation) and rejects locally with not_rotated", () => {
      // User held the phone still without turning the fruit
      const stationaryBatch = Array.from({ length: 25 }, (_, i) =>
        makeSyntheticFrame(i, "stationary-identical")
      );

      const { kept, stats } = selectFrames(stationaryBatch, customParams);

      expect(stats.sampled).toBe(25);
      // First frame was accepted as the seed, remaining 24 were rejected as duplicates
      expect(stats.rejectedSimilarity).toBe(24);
      expect(stats.rejectedBlur).toBe(0);
      expect(kept).toHaveLength(1);

      const decision = evaluateFrameRejection(stats, kept.length);
      expect(decision).toBe("not_rotated");
    });

    it("catches stationary low-contrast frames without rotating and correctly attributes to not_rotated (not all_blurry)", () => {
      // 25 identical frames with modest sharpness (~0.05), matching real phone captures
      const w = 16, h = 16;
      const lowContrastStationary = Array.from({ length: 25 }, (_, i) => {
        const gray = new Float32Array(w * h);
        const thumb = new Float32Array(THUMB_SIZE);
        for (let j = 0; j < w * h; j++) {
          gray[j] = 120 + ((j % 5) * 4); // modest edge energy
        }
        thumb.fill(120);
        return { sequence: i, gray, grayW: w, grayH: h, thumb };
      });

      const { kept, stats } = selectFrames(lowContrastStationary, customParams);
      expect(stats.sampled).toBe(25);
      expect(stats.rejectedBlur).toBe(0);
      expect(kept.length).toBeLessThan(2);
      expect(evaluateFrameRejection(stats, kept.length)).toBe("not_rotated");
    });

    it("catches stationary produce held on palm with minor hand-held drift (stationaryRatio >= 0.55) and rejects with not_rotated", () => {
      // Simulates real user test where in-focus tangerine is held stationary in palm
      // Minor tremor creates occasional 3% drift, but > 80% of adjacent pairs are stationary
      const w = 64, h = 64;
      const cx = (w - 1) / 2;
      const cy = (h - 1) / 2;
      const handheldStationary = Array.from({ length: 25 }, (_, i) => {
        const gray = new Float32Array(w * h);
        const thumb = new Float32Array(THUMB_SIZE);
        const drift = Math.floor(i / 6);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const distSq = (x - cx) ** 2 + (y - cy) ** 2;
            gray[y * w + x] = distSq <= 400 ? 60 + ((x * 3 + y * 7) % 15) * 5 : 190;
          }
        }
        thumb.fill(120 + drift);
        return { sequence: i, gray, grayW: w, grayH: h, thumb };
      });

      const { kept, stats } = selectFrames(handheldStationary, customParams);
      expect(stats.rejectedBlur).toBe(0);
      expect(stats.stationaryRatio).toBeGreaterThanOrEqual(0.55);
      const decision = evaluateFrameRejection(stats, kept.length);
      expect(decision).toBe("not_rotated");
    });

    it("catches a handheld static scan with high-contrast produce stripes (tremor jitter +/- 1.5px) and rejects locally with not_rotated", () => {
      // Simulates real user test where watermelon with stripes sits on table
      // Camera is held stationary with realistic subpixel hand tremor
      const w = 64;
      const h = 64;
      const handheldStripes = Array.from({ length: 25 }, (_, i) => {
        const jx = Math.sin(i * 0.7) * 1.5;
        const jy = Math.cos(i * 0.5) * 1.5;
        const gray = new Float32Array(w * h);
        const cx = (w - 1) / 2 + jx;
        const cy = (h - 1) / 2 + jy;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.hypot(dx, dy);
            if (dist <= 24) {
              const nx = Math.max(-1, Math.min(1, dx / 24));
              const sphereAngle = Math.asin(nx);
              const stripe = Math.sin(sphereAngle * 6);
              gray[y * w + x] = stripe > 0 ? 30 : 160;
            } else {
              gray[y * w + x] = ((Math.floor(x / 8) ^ Math.floor(y / 8)) & 1) ? 200 : 80;
            }
          }
        }
        // 32x32 smoothed thumbnail matching deep-scan-frames pipeline
        const tw = 32;
        const th = 32;
        const thumb = new Float32Array(tw * th);
        for (let ty = 0; ty < th; ty++) {
          const sy = ty * 2;
          for (let tx = 0; tx < tw; tx++) {
            const sx = tx * 2;
            thumb[ty * tw + tx] =
              (gray[sy * w + sx] +
                gray[sy * w + sx + 1] +
                gray[(sy + 1) * w + sx] +
                gray[(sy + 1) * w + sx + 1]) *
              0.25;
          }
        }
        return { sequence: i, gray, grayW: w, grayH: h, thumb };
      });

      const { kept, stats } = selectFrames(handheldStripes, customParams);
      expect(stats.rejectedBlur).toBe(0);
      const decision = evaluateFrameRejection(stats, kept.length);
      expect(decision).toBe("not_rotated");
    });
  });

  describe("smooth 360-degree rotational capture acceptance", () => {
    it("accepts a well-rotated sharp sweep, keeping 6 evenly spaced frames with 0 rejections", () => {
      const sweepBatch = Array.from({ length: 25 }, (_, i) =>
        makeSyntheticFrame(i, "rotational-sweep", i)
      );

      const { kept, stats, keptScores } = selectFrames(sweepBatch, customParams);

      expect(stats.sampled).toBe(25);
      expect(stats.rejectedBlur).toBe(0);
      expect(kept).toHaveLength(6);

      // Verify that every kept frame is distinct from its predecessor
      for (let i = 1; i < kept.length; i++) {
        expect(kept[i].sequence).toBeGreaterThan(kept[i - 1].sequence);
        expect(similarityScore(kept[i].thumb, kept[i - 1].thumb)).toBeGreaterThanOrEqual(
          customParams.similarityLow
        );
      }
      // First frame from early sector, last frame from late sector
      expect(kept[0].sequence).toBeLessThanOrEqual(4);
      expect(kept[5].sequence).toBeGreaterThanOrEqual(20);

      expect(evaluateFrameRejection(stats, kept.length)).toBeNull();
      expect(keptScores.every((s) => s > 0.4)).toBe(true);
    });

    it("supports 5-second inspect capture cadence (25 frames at 200ms) with full 6-sector bin coverage", () => {
      // 5-second rotation at 72°/s yields 25 frames (200ms interval) across 360°
      const fiveSecondSweep = Array.from({ length: 25 }, (_, i) =>
        makeSyntheticFrame(i, "rotational-sweep", i * 1.5)
      );

      const { kept, stats, keptScores } = selectFrames(fiveSecondSweep, customParams);

      expect(stats.sampled).toBe(25);
      expect(stats.rejectedBlur).toBe(0);
      expect(kept).toHaveLength(6);

      // Verify uniform sector distribution across the 5s capture duration
      const binIndices = kept.map((f) => Math.floor((f.sequence * 6) / 25));
      expect(binIndices).toEqual([0, 1, 2, 3, 4, 5]);
      expect(evaluateFrameRejection(stats, kept.length)).toBeNull();
      expect(keptScores).toHaveLength(6);
    });
  });

  describe("backend verifier abstention guard for un-rotated composites", () => {
    const dummyReq: DeepScanRequest = {
      schemaVersion: "1.0",
      sessionId: "test-session",
      locale: "en-GB",
      imageBase64: "dGVzdA==",
      imageMimeType: "image/jpeg",
      sampleCount: 25,
    };
    const ctx = { request: dummyReq, promptVersion: "deep_scan_v1", modelId: "test-model" };

    it("rejects an ok verdict when view coverage was insufficient (same side only)", () => {
      const forcedOkPayload: DeepScanResponseModel = {
        status: "ok",
        abstentionReason: null,
        message: null,
        produce: { type: "avocado", displayName: "Avocado", variety: null },
        ripeness: { state: "ripe", confidence: 0.88 },
        evidence: ["Skin appears dark purple"],
        quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: "same_side_only" },
        manualChecks: null,
        recommendation: null,
        afterPurchase: null,
      };

      const outcome = verifyAndResolveDeepScanResponse(forcedOkPayload, ctx);
      // Must reject a forced 'ok' when visual evidence is insufficient
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors.join(" ")).toMatch(/sufficientVisualEvidence/i);
      }
    });

    it("accepts a proper same_side_only abstention with required manual checks", () => {
      const honestAbstentionPayload: DeepScanResponseModel = {
        status: "insufficient_evidence",
        abstentionReason: "same_side_only",
        message: "Only one side was photographed. Please rotate the produce.",
        produce: { type: "avocado", displayName: "Avocado", variety: null },
        ripeness: { state: "unknown", confidence: 0.2 },
        evidence: [],
        quality: { sufficientVisualEvidence: false, viewCoverage: "fair", reason: "same_side_only" },
        manualChecks: [
          { trait: "Firmness", how: "Press near stem", whatItMeans: "Slight yield means ready soon" },
        ],
        recommendation: null,
        afterPurchase: null,
      };

      const outcome = verifyAndResolveDeepScanResponse(honestAbstentionPayload, ctx);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.response.status).toBe("insufficient_evidence");
        expect(outcome.response.abstentionReason).toBe("same_side_only");
        expect(outcome.response.manualChecks?.length).toBe(1);
        expect(outcome.response.afterPurchase).toBeNull();
      }
    });
  });

  describe("real deep-scan fixture image tests", () => {
    const datasetDir = path.resolve(__dirname, "../dataset/deep-scan");

    it("evaluates ds-05-same-side-avocado.jpg and catches lack of rotation locally (not_rotated)", () => {
      const buf = fs.readFileSync(path.join(datasetDir, "ds-05-same-side-avocado.jpg"));
      const { tiles } = extractTilesFromJpeg(buf);
      expect(tiles).toHaveLength(6);

      const { kept, stats } = selectFrames(tiles);
      expect(stats.rejectedSimilarity).toBe(5);
      expect(stats.stationaryRatio).toBe(1);
      expect(stats.rotationSpread).toBe(0);
      expect(kept).toHaveLength(1);

      const decision = evaluateFrameRejection(stats, kept.length);
      expect(decision).toBe("not_rotated");
    });

    it("evaluates ds-03-blurry-avocado.jpg and detects blur degradation", () => {
      const buf = fs.readFileSync(path.join(datasetDir, "ds-03-blurry-avocado.jpg"));
      const { tiles } = extractTilesFromJpeg(buf);

      const { kept, stats } = selectFrames(tiles);
      expect(stats.rejectedBlur).toBeGreaterThanOrEqual(4);
      expect(kept.length).toBeLessThan(2);
    });

    it("evaluates ds-04-dark-avocado.jpg and catches stationary dark tiles", () => {
      const buf = fs.readFileSync(path.join(datasetDir, "ds-04-dark-avocado.jpg"));
      const { tiles } = extractTilesFromJpeg(buf);

      const { kept, stats } = selectFrames(tiles);
      expect(stats.stationaryRatio).toBe(1);
      expect(evaluateFrameRejection(stats, kept.length)).toBe("not_rotated");
    });

    it("evaluates ds-02-empty-oval.jpg and rejects for low exposure / empty surface", () => {
      const buf = fs.readFileSync(path.join(datasetDir, "ds-02-empty-oval.jpg"));
      const { tiles } = extractTilesFromJpeg(buf);

      for (const tile of tiles) {
        expect(exposureScore(tile.gray)).toBeLessThan(0.05);
      }
      const { kept, stats } = selectFrames(tiles);
      expect(stats.rejectedExposure).toBe(6);
      expect(kept).toHaveLength(0);
      expect(evaluateFrameRejection(stats, kept.length)).toBe("too_dark_or_bright");
    });

    it("accepts valid multi-angle rotation grids with full view diversity (ds-01 ripe, ds-06 underripe, ds-07 overripe)", () => {
      const validFixtures = [
        "ds-01-ideal-avocado.jpg",
        "ds-06-underripe-avocado.jpg",
        "ds-07-overripe-avocado.jpg",
      ];

      for (const file of validFixtures) {
        const buf = fs.readFileSync(path.join(datasetDir, file));
        const { tiles } = extractTilesFromJpeg(buf);
        expect(tiles).toHaveLength(6);

        const { kept, stats } = selectFrames(tiles);
        expect(stats.rejectedBlur).toBe(0);
        expect(stats.rejectedExposure).toBe(0);
        expect(stats.rejectedSimilarity).toBe(0);
        expect(stats.stationaryRatio).toBe(0);
        expect(stats.rotationSpread).toBeGreaterThanOrEqual(6.5);
        expect(kept).toHaveLength(6);

        const decision = evaluateFrameRejection(stats, kept.length);
        expect(decision).toBeNull();
      }
    });

    it("evaluates single-frame compare pre-flight validation on real fixtures", () => {
      // 1. Blurry real image should trigger all_blurry
      const blurryBuf = fs.readFileSync(path.join(datasetDir, "ds-03-blurry-avocado.jpg"));
      const blurryTiles = extractTilesFromJpeg(blurryBuf).tiles;
      // Evaluate the most degraded blurry tile as a single capture
      const blurryReject = evaluateCompareFrame(blurryTiles[0].gray, blurryTiles[0].grayW, blurryTiles[0].grayH);
      expect(blurryReject).toBe("all_blurry");

      // 2. Dark real image should trigger too_dark_or_bright
      const darkBuf = fs.readFileSync(path.join(datasetDir, "ds-02-empty-oval.jpg"));
      const darkTiles = extractTilesFromJpeg(darkBuf).tiles;
      const darkReject = evaluateCompareFrame(darkTiles[0].gray, darkTiles[0].grayW, darkTiles[0].grayH);
      expect(darkReject).toBe("too_dark_or_bright");

      // 3. Clear, well-lit real produce frame should pass cleanly (return null)
      const idealBuf = fs.readFileSync(path.join(datasetDir, "ds-01-ideal-avocado.jpg"));
      const idealTiles = extractTilesFromJpeg(idealBuf).tiles;
      const idealPass = evaluateCompareFrame(idealTiles[0].gray, idealTiles[0].grayW, idealTiles[0].grayH);
      expect(idealPass).toBeNull();
    });
  });
});
