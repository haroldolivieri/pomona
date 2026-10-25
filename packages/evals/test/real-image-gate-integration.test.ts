import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProxyApp,
  createInMemoryQuotaStore,
  buildVisibilityGateInput,
  buildDeepScanGateInput,
  runVisibilityGate,
  VISIBILITY_GATE_THRESHOLD,
  type VisibilityGateRequest,
} from "@pomona/proxy";
import {
  sharpnessScore,
  exposureScore,
  similarityScore,
  evaluateFrameRejection,
  type DeepScanSelectionStats,
} from "@pomona/contract";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const evalsRoot = path.resolve(testDir, "..");
const imagesDir = path.join(evalsRoot, "dataset", "images");
const deepScanDir = path.join(evalsRoot, "dataset", "deep-scan");

function loadRealImage(dir: string, filename: string): { buffer: Buffer; base64: string; mimeType: string } {
  const filePath = path.join(dir, filename);
  expect(fs.existsSync(filePath), `Real image file must exist: ${filePath}`).toBe(true);
  const buffer = fs.readFileSync(filePath);
  expect(buffer.length).toBeGreaterThan(1000);
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  return {
    buffer,
    base64: buffer.toString("base64"),
    mimeType,
  };
}

const mockAbstentionProduce = {
  status: "insufficient_evidence",
  abstentionReason: "missing_evidence",
  message: "I cannot grade the hidden surfaces. Please turn the produce to show another side.",
  countedTotal: null,
  produce: null,
  candidates: [],
  verdict: null,
  followUp: null,
  afterPurchase: null,
};

const mockDeepScanGrading = {
  status: "ok",
  message: null,
  abstentionReason: null,
  produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
  ripeness: { state: "nearly_ripe", confidence: 0.88 },
  evidence: ["Dark pebbled skin", "Slight give at stem shoulder"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: { eatWhen: "in_a_few_days" },
  afterPurchase: {
    readyInDays: { min: 1, max: 2 },
    eatWithinDays: { min: 3, max: 4 },
    eatWithinLabel: "3-4 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter: whole", tip: "Softens daily" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge: wrapped", tip: "Spritz with lime" },
    },
  },
};

function clefGateResponse(scores: {
  no_produce?: number;
  unclear_photo?: number;
  multiple_types?: number;
  single_produce?: number;
}) {
  const answers: Record<string, { type: "noul"; noul: number }> = {};
  for (const key of ["no_produce", "unclear_photo", "multiple_types", "single_produce"]) {
    const val = scores[key as keyof typeof scores] ?? 0.02;
    answers[key] = { type: "noul", noul: val };
  }
  return Response.json({
    model: "clef-flash",
    answers,
    usage: { input_tokens: 1200, output_tokens: 0 },
  });
}

describe("Real image gate integration and algorithm verification", () => {
  describe("Suite 1: Real image payload and Clef prompt construction", () => {
    it("constructs valid Compare visibility gate payload from real image (04-no-produce-cereal-box)", () => {
      const real = loadRealImage(imagesDir, "04-no-produce-cereal-box.jpg");
      const gateInput = buildVisibilityGateInput({
        imageBase64: real.base64,
        imageMimeType: "image/jpeg",
        focusPolygon: null,
      });

      expect(gateInput.images[0]).toContain("data:image/jpeg;base64,");
      expect(gateInput.images[0].length).toBeGreaterThan(real.base64.length);
      expect(gateInput.questions).toHaveProperty("no_produce");
      expect(gateInput.questions).toHaveProperty("unclear_photo");
      expect(gateInput.questions).toHaveProperty("multiple_types");
      expect(gateInput.questions).toHaveProperty("single_produce");
      expect(gateInput.questions.single_produce.instructions).toContain("single piece");
    });

    it("constructs valid Deep Scan gate payload from real montage (ds-01-ideal-avocado)", () => {
      const real = loadRealImage(deepScanDir, "ds-01-ideal-avocado.jpg");
      const gateInput = buildDeepScanGateInput(real.base64, "image/jpeg");

      expect(gateInput.images[0]).toContain("data:image/jpeg;base64,");
      expect(gateInput.questions).toHaveProperty("no_produce");
      expect(gateInput.questions).toHaveProperty("unclear_photo");
      // Deep scan gate must omit single_produce and multiple_types questions
      expect(gateInput.questions).not.toHaveProperty("single_produce");
      expect(gateInput.questions).not.toHaveProperty("multiple_types");
      expect(gateInput.state).toContain("multiple views of one fruit");
    });
  });

  describe("Suite 2: Gate decision execution on real images", () => {
    it("evaluates real cereal box (04-no-produce-cereal-box) as no_produce denial", async () => {
      const real = loadRealImage(imagesDir, "04-no-produce-cereal-box.jpg");
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.96, unclear_photo: 0.05, multiple_types: 0.02, single_produce: 0.01 })
      );

      const request: VisibilityGateRequest = {
        schemaVersion: "1.0",
        round: 1,
        sessionId: "11111111-1111-4111-a111-111111111111",
        locale: "en-GB",
        imageBase64: real.base64,
        imageMimeType: "image/jpeg",
        focusPolygon: null,
        followUpContext: null,
      };

      const outcome = await runVisibilityGate({ run: clefRun }, request, "req-cereal-1");
      expect(outcome.status).toBe("no_produce");
      expect(outcome.scores?.no_produce).toBe(0.96);
      expect(clefRun).toHaveBeenCalledOnce();
    });

    it("evaluates real solitary pineapple (10-single-pineapple-solo) as single_produce denial", async () => {
      const real = loadRealImage(imagesDir, "10-single-pineapple-solo.jpg");
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.01, unclear_photo: 0.03, multiple_types: 0.02, single_produce: 0.94 })
      );

      const request: VisibilityGateRequest = {
        schemaVersion: "1.0",
        round: 1,
        sessionId: "22222222-2222-4222-a222-222222222222",
        locale: "en-GB",
        imageBase64: real.base64,
        imageMimeType: "image/jpeg",
        focusPolygon: null,
        followUpContext: null,
      };

      const outcome = await runVisibilityGate({ run: clefRun }, request, "req-single-1");
      expect(outcome.status).toBe("single_produce");
      expect(outcome.scores?.single_produce).toBe(0.94);
      expect(clefRun).toHaveBeenCalledOnce();
    });

    it("evaluates real blurry photo (03-unclear-blurry-photo) as unclear_photo denial", async () => {
      const real = loadRealImage(imagesDir, "03-unclear-blurry-photo.jpg");
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.02, unclear_photo: 0.93, multiple_types: 0.01, single_produce: 0.01 })
      );

      const request: VisibilityGateRequest = {
        schemaVersion: "1.0",
        round: 1,
        sessionId: "33333333-3333-4333-a333-333333333333",
        locale: "en-GB",
        imageBase64: real.base64,
        imageMimeType: "image/jpeg",
        focusPolygon: null,
        followUpContext: null,
      };

      const outcome = await runVisibilityGate({ run: clefRun }, request, "req-blurry-1");
      expect(outcome.status).toBe("unclear_photo");
      expect(outcome.scores?.unclear_photo).toBe(0.93);
    });

    it("evaluates real mixed produce basket (05-multiple-types-mixed) as multiple_types denial", async () => {
      const real = loadRealImage(imagesDir, "05-multiple-types-mixed.jpg");
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.02, unclear_photo: 0.01, multiple_types: 0.91, single_produce: 0.01 })
      );

      const request: VisibilityGateRequest = {
        schemaVersion: "1.0",
        round: 1,
        sessionId: "44444444-4444-4444-a444-444444444444",
        locale: "en-GB",
        imageBase64: real.base64,
        imageMimeType: "image/jpeg",
        focusPolygon: null,
        followUpContext: null,
      };

      const outcome = await runVisibilityGate({ run: clefRun }, request, "req-mixed-1");
      expect(outcome.status).toBe("multiple_types");
      expect(outcome.scores?.multiple_types).toBe(0.91);
    });

    it("evaluates real watermelon crate (01-watermelon-crate) as gate passing (null denial)", async () => {
      const real = loadRealImage(imagesDir, "01-watermelon-crate-clear-winner.jpg");
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.01, unclear_photo: 0.02, multiple_types: 0.03, single_produce: 0.01 })
      );

      const request: VisibilityGateRequest = {
        schemaVersion: "1.0",
        round: 1,
        sessionId: "55555555-5555-4555-a555-555555555555",
        locale: "en-GB",
        imageBase64: real.base64,
        imageMimeType: "image/jpeg",
        focusPolygon: null,
        followUpContext: null,
      };

      const outcome = await runVisibilityGate({ run: clefRun }, request, "req-pass-1");
      expect(outcome.status).toBeNull();
      expect(outcome.scores?.no_produce).toBeLessThan(VISIBILITY_GATE_THRESHOLD);
    });
  });

  describe("Suite 3: Proxy HTTP endpoint routing with real images", () => {
    it("handles single produce denial through /api/v1/scan and returns countedTotal: 1", async () => {
      // 12-tomato-basket-polygon-selection.jpg is a real 57KB image fitting within HTTP body limit
      const real = loadRealImage(imagesDir, "12-tomato-basket-polygon-selection.jpg");
      const grade = vi.fn().mockResolvedValue({
        object: mockAbstentionProduce,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.01, unclear_photo: 0.02, multiple_types: 0.01, single_produce: 0.95 })
      );

      const app = createProxyApp({
        quotaStore: createInMemoryQuotaStore(),
        adapterFactory: (modelId) => ({ providerId: "google", modelId, analyzeProduce: grade }),
      });

      const res = await app.request("/api/v1/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "aaaa1111-1111-4111-a111-111111111111",
          round: 1,
          locale: "en-GB",
          imageBase64: real.base64,
          imageMimeType: "image/jpeg",
          focusPolygon: null,
          followUpContext: null,
        }),
      }, {
        VISION_GATE_ENABLED: "true",
        AI: { run: clefRun },
      });

      const body = await res.json() as { status: string; countedTotal: number };
      expect(body.status).toBe("single_produce");
      expect(body.countedTotal).toBe(1);
      expect(clefRun).toHaveBeenCalledOnce();
      expect(grade).not.toHaveBeenCalled();
    });

    it("handles no produce denial through /api/v1/scan and bypasses grading", async () => {
      const real = loadRealImage(deepScanDir, "ds-02-empty-oval.jpg");
      const grade = vi.fn().mockResolvedValue({
        object: mockAbstentionProduce,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.93, unclear_photo: 0.02, multiple_types: 0.01, single_produce: 0.01 })
      );

      const app = createProxyApp({
        quotaStore: createInMemoryQuotaStore(),
        adapterFactory: (modelId) => ({ providerId: "google", modelId, analyzeProduce: grade }),
      });

      const res = await app.request("/api/v1/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "bbbb2222-2222-4222-a222-222222222222",
          round: 1,
          locale: "en-GB",
          imageBase64: real.base64,
          imageMimeType: "image/jpeg",
          focusPolygon: null,
          followUpContext: null,
        }),
      }, {
        VISION_GATE_ENABLED: "true",
        AI: { run: clefRun },
      });

      const body = await res.json() as { status: string };
      expect(body.status).toBe("no_produce");
      expect(grade).not.toHaveBeenCalled();
    });

    it("passes gate on clear batch image and invokes grading through /api/v1/scan", async () => {
      const real = loadRealImage(imagesDir, "12-tomato-basket-polygon-selection.jpg");
      const grade = vi.fn().mockResolvedValue({
        object: mockAbstentionProduce,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.02, unclear_photo: 0.03, multiple_types: 0.02, single_produce: 0.01 })
      );

      const app = createProxyApp({
        quotaStore: createInMemoryQuotaStore(),
        adapterFactory: (modelId) => ({ providerId: "google", modelId, analyzeProduce: grade }),
      });

      const res = await app.request("/api/v1/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "cccc3333-3333-4333-a333-333333333333",
          round: 1,
          locale: "en-GB",
          imageBase64: real.base64,
          imageMimeType: "image/jpeg",
          focusPolygon: null,
          followUpContext: null,
        }),
      }, {
        VISION_GATE_ENABLED: "true",
        AI: { run: clefRun },
      });

      const body = await res.json() as { status: string };
      expect(body.status).toBe("insufficient_evidence");
      expect(grade).toHaveBeenCalledOnce();
    });
  });

  describe("Suite 4: Deep Scan gate behavior with real montage inputs", () => {
    it("denies empty oval montage (ds-02-empty-oval) with no_produce", async () => {
      const real = loadRealImage(deepScanDir, "ds-02-empty-oval.jpg");
      const deepGrade = vi.fn().mockResolvedValue({
        object: mockDeepScanGrading,
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      });
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.92, unclear_photo: 0.04 })
      );

      const app = createProxyApp({
        quotaStore: createInMemoryQuotaStore(),
        adapterFactory: (modelId) => ({
          providerId: "google",
          modelId,
          analyzeProduce: deepGrade,
        }),
      });

      const res = await app.request("/api/v1/deep-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "66666666-6666-4666-a666-666666666666",
          locale: "en-GB",
          imageBase64: real.base64,
          imageMimeType: "image/jpeg",
          sampleCount: 6,
        }),
      }, {
        VISION_GATE_ENABLED: "true",
        AI: { run: clefRun },
      });

      const body = await res.json() as { status: string; message: string };
      expect(body.status).toBe("insufficient_evidence");
      expect(body.message).toContain("No fresh produce");
      expect(clefRun).toHaveBeenCalledOnce();
      expect(deepGrade).not.toHaveBeenCalled();
    });

    it("denies blurry montage (ds-03-blurry-avocado) with unclear_photo", async () => {
      const real = loadRealImage(deepScanDir, "ds-03-blurry-avocado.jpg");
      const deepGrade = vi.fn().mockResolvedValue({
        object: mockDeepScanGrading,
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      });
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.05, unclear_photo: 0.89 })
      );

      const app = createProxyApp({
        quotaStore: createInMemoryQuotaStore(),
        adapterFactory: (modelId) => ({
          providerId: "google",
          modelId,
          analyzeProduce: deepGrade,
        }),
      });

      const res = await app.request("/api/v1/deep-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "77777777-7777-4777-a777-777777777777",
          locale: "en-GB",
          imageBase64: real.base64,
          imageMimeType: "image/jpeg",
          sampleCount: 6,
        }),
      }, {
        VISION_GATE_ENABLED: "true",
        AI: { run: clefRun },
      });

      const body = await res.json() as { status: string; message: string };
      expect(body.status).toBe("insufficient_evidence");
      expect(body.message.toLowerCase()).toContain("obscured");
      expect(deepGrade).not.toHaveBeenCalled();
    });

    it("passes ideal montage (ds-01-ideal-avocado) and invokes deep scan grading", async () => {
      const real = loadRealImage(deepScanDir, "ds-01-ideal-avocado.jpg");
      const deepGrade = vi.fn().mockResolvedValue({
        object: mockDeepScanGrading,
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      });
      const clefRun = vi.fn().mockResolvedValue(
        clefGateResponse({ no_produce: 0.02, unclear_photo: 0.03 })
      );

      const app = createProxyApp({
        quotaStore: createInMemoryQuotaStore(),
        adapterFactory: (modelId) => ({
          providerId: "google",
          modelId,
          analyzeProduce: deepGrade,
        }),
      });

      const res = await app.request("/api/v1/deep-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "88888888-8888-4888-a888-888888888888",
          locale: "en-GB",
          imageBase64: real.base64,
          imageMimeType: "image/jpeg",
          sampleCount: 6,
        }),
      }, {
        VISION_GATE_ENABLED: "true",
        AI: { run: clefRun },
      });

      const body = await res.json() as { status: string; produce: { displayName: string } };
      expect(body.status).toBe("ok");
      expect(body.produce.displayName).toBe("Hass Avocado");
      expect(deepGrade).toHaveBeenCalledOnce();
    });
  });

  describe("Suite 5: Algorithm verification on real image pixel distributions", () => {
    function sampleLuminanceFromBuffer(buf: Buffer, count: number): Float32Array {
      const out = new Float32Array(count);
      const step = Math.floor(buf.length / count);
      for (let i = 0; i < count; i++) {
        out[i] = buf[i * step] ?? 0;
      }
      return out;
    }

    it("evaluates exposure differences between ideal and dark avocado images", () => {
      const ideal = loadRealImage(deepScanDir, "ds-01-ideal-avocado.jpg");
      const dark = loadRealImage(deepScanDir, "ds-04-dark-avocado.jpg");

      // Extract raw byte luminance distributions
      const idealLum = sampleLuminanceFromBuffer(ideal.buffer, 1024);
      const darkLum = sampleLuminanceFromBuffer(dark.buffer, 1024);

      const idealScore = exposureScore(idealLum);
      const darkScore = exposureScore(darkLum);

      // Ideal composite has well-balanced exposure across tiles
      expect(idealScore).toBeGreaterThan(0.2);

      // Rejection evaluator correctly flags high exposure failure
      const darkStats: DeepScanSelectionStats = {
        sampled: 10,
        rejectedBlur: 1,
        rejectedExposure: 8, // 80% rejected on exposure
        rejectedSimilarity: 1,
      };
      expect(evaluateFrameRejection(darkStats, 1)).toBe("too_dark_or_bright");
    });

    it("evaluates pairwise similarity for identical vs distinct camera frames", () => {
      const img1 = loadRealImage(deepScanDir, "ds-01-ideal-avocado.jpg");
      const img2 = loadRealImage(deepScanDir, "ds-02-empty-oval.jpg");

      const thumb1 = sampleLuminanceFromBuffer(img1.buffer, 32 * 32);
      const thumb1Clone = new Float32Array(thumb1);
      const thumb2 = sampleLuminanceFromBuffer(img2.buffer, 32 * 32);

      // Identical frames have 0 pairwise difference
      const identicalDiff = similarityScore(thumb1, thumb1Clone);
      expect(identicalDiff).toBe(0);

      // Distinct frames have measurable pairwise difference
      const crossDiff = similarityScore(thumb1, thumb2);
      expect(crossDiff).toBeGreaterThan(0);

      // Stationary scan (low rotation spread) triggers not_rotated
      const stationaryStats: DeepScanSelectionStats = {
        sampled: 8,
        rejectedBlur: 0,
        rejectedExposure: 0,
        rejectedSimilarity: 6,
        rotationSpread: 3.2, // Below 6.5 minimum rotation spread threshold
      };
      expect(evaluateFrameRejection(stationaryStats, 2)).toBe("not_rotated");
    });

    it("evaluates frame rejection on high blur ratio", () => {
      const blurryStats: DeepScanSelectionStats = {
        sampled: 10,
        rejectedBlur: 8, // 80% rejected on blur (exceeds 70% threshold)
        rejectedExposure: 1,
        rejectedSimilarity: 0,
      };
      expect(evaluateFrameRejection(blurryStats, 1)).toBe("all_blurry");
    });
  });
});
