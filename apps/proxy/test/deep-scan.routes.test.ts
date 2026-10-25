import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore } from "../src/index";
import { signDeviceToken } from "../src/quota/token";
import { formatDateKey } from "../src/quota/budget";
import { translateShared } from "@pomona/contract";
import type { DeepScanResponseModel } from "@pomona/contract";

const deepScanRequest = {
  schemaVersion: "1.0",
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  locale: "en-GB",
  imageBase64: "bWFza2VkLWNvbXBvc2l0ZQ==",
  imageMimeType: "image/webp",
  sampleCount: 25,
};

const okModel: DeepScanResponseModel = {
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  ripeness: { state: "nearly_ripe", confidence: 0.85 },
  evidence: ["Tile 2: color lift", "Tile 5: matte skin"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: null,
  afterPurchase: {
    readyInDays: { min: 1, max: 2 },
    eatWithinDays: { min: 3, max: 4 },
    eatWithinLabel: "3-4 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole on the counter", tip: "Softens daily" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Sealed in the fridge", tip: "Keep chilled" },
    },
  },
};

const clef = (scores: Record<string, number>) => ({
  model: "clef-flash",
  answers: Object.fromEntries(Object.entries(scores).map(([key, noul]) => [key, { type: "noul", noul }])),
  usage: { input_tokens: 1200, output_tokens: 0 },
});

async function deepScan(options: {
  grade?: ReturnType<typeof vi.fn>;
  gradeOutput?: unknown;
  gradeError?: Error;
  bindingRun?: ReturnType<typeof vi.fn>;
  enabled?: string;
  ai?: unknown;
  body?: unknown;
  headers?: Record<string, string>;
  store?: ReturnType<typeof createInMemoryQuotaStore>;
  defaultModel?: string;
} = {}) {
  const grade = options.grade ?? vi.fn().mockResolvedValue({
    object: options.gradeOutput ?? okModel,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  });
  if (options.gradeError) grade.mockRejectedValue(options.gradeError);
  const store = options.store ?? createInMemoryQuotaStore();
  const app = createProxyApp({ quotaStore: store, adapterFactory: () => ({
    providerId: "google", modelId: "test-model", analyzeProduce: grade,
  }) });
  const bindingRun = options.bindingRun ?? vi.fn().mockResolvedValue(Response.json(clef({ no_produce: 0.1, unclear_photo: 0.1, multiple_types: 0.1 })));
  const response = await app.request("/api/v1/deep-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify(options.body ?? deepScanRequest),
  }, {
    DEFAULT_MODEL: options.defaultModel ?? "gemini-test",
    COOKIE_SIGNING_SECRET: "test-secret",
    VISION_GATE_ENABLED: options.enabled ?? "true",
    ...(options.ai !== false ? { AI: { run: bindingRun } } : {}),
  });
  return { response, json: await response.json(), grade, store, bindingRun };
}

describe("POST /api/v1/deep-scan", () => {
  it("returns a verified deep-scan verdict and decrements shared daily device quota on status ok", async () => {
    const store = createInMemoryQuotaStore();
    const incrementDailyDeviceCount = vi.spyOn(store, "incrementDailyDeviceCount");
    const { response, json, grade } = await deepScan({ store, gradeOutput: okModel });
    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      schemaVersion: "1.0",
      promptVersion: "deep_scan_v1",
      modelId: "test-model",
      status: "ok",
    });
    expect(grade).toHaveBeenCalledTimes(1);
    expect(incrementDailyDeviceCount).toHaveBeenCalledTimes(1);
    expect(response.headers.get("X-Pomona-Remaining-Scans")).toBe("9");
    expect(response.headers.get("X-Pomona-Device-Token")).toBeTruthy();
    expect(json.afterPurchase).toMatchObject({
      eatWithinLabel: "3-4 days",
      storage: { afterCut: { where: "fridge" } },
    });
    // Seasonality comes straight from the same server dataset the normal scan uses.
    expect(json.seasonality).not.toBeNull();
    expect(json.seasonality.produceSlug).toBe("avocado");
    expect(json.seasonality.month).toBe(new Date().getMonth() + 1);
  });

  it("canonicalizes gate-denied outcomes with a null afterPurchase envelope", async () => {
    const { json, grade } = await deepScan({
      bindingRun: vi.fn().mockResolvedValue(Response.json(clef({ no_produce: 0.9, unclear_photo: 0.1 }))),
    });
    expect(json.status).toBe("insufficient_evidence");
    expect(json.afterPurchase).toBeNull();
    expect(json.seasonality).toBeUndefined();
    expect(grade).not.toHaveBeenCalled();
  });

  it("denies through the two-question Clef gate with the localized copy, skipping Gemini", async () => {
    const { json, grade, bindingRun } = await deepScan({
      bindingRun: vi.fn().mockResolvedValue(Response.json(clef({ no_produce: 0.9, unclear_photo: 0.1 }))),
    });
    expect(json.status).toBe("insufficient_evidence");
    expect(json.message).toBe(translateShared("en-GB", "gate.noProduce"));
    expect(grade).not.toHaveBeenCalled();
    expect(bindingRun).toHaveBeenCalledTimes(1);
    const payload = bindingRun.mock.calls[0][1] as Record<string, unknown>;
    expect(String(payload.state)).toContain("This is a grid of multiple views of one fruit.");
    expect(Object.keys(payload.questions as Record<string, unknown>).sort()).toEqual([
      "no_produce",
      "unclear_photo",
    ]);
  });

  it("fails open on Clef errors into the verified Gemini call", async () => {
    const { json, grade, bindingRun } = await deepScan({
      bindingRun: vi.fn().mockRejectedValue(new Error("Clef flashburn")),
    });
    expect(json.status).toBe("ok");
    expect(grade).toHaveBeenCalledTimes(1);
    expect(bindingRun).toHaveBeenCalledTimes(1);
  });

  it("rejects sampleCount above the 30-frame bound", async () => {
    const { response } = await deepScan({ body: { ...deepScanRequest, sampleCount: 31 } });
    expect(response.status).toBe(400);
  });

  it("returns a 413 analysis_failed envelope for oversized bodies without touching gate or Gemini", async () => {
    const { json, grade } = await deepScan({
      body: { ...deepScanRequest, imageBase64: "A".repeat(1_400_000) },
    });
    expect(json.status).toBe("analysis_failed");
    expect(json.message).toBe(translateShared("en-GB", "gate.tooLarge"));
    expect(grade).not.toHaveBeenCalled();
  });

  it("authenticates device and preserves identity across consecutive deep scans, sharing quota", async () => {
    const store = createInMemoryQuotaStore();
    const first = await deepScan({ store, gradeOutput: okModel });
    expect(first.response.status).toBe(200);
    const token = first.response.headers.get("X-Pomona-Device-Token");
    expect(token).toBeTruthy();
    expect(first.response.headers.get("X-Pomona-Remaining-Scans")).toBe("9");

    const second = await deepScan({
      store,
      gradeOutput: okModel,
      headers: { "X-Pomona-Device-Token": token! },
    });
    expect(second.response.status).toBe(200);
    expect(second.response.headers.get("X-Pomona-Device-Token")).toBe(token);
    expect(second.response.headers.get("X-Pomona-Remaining-Scans")).toBe("8");
  });

  it("enforces device quota rate limiting and returns a localized rate-limited response", async () => {
    const store = createInMemoryQuotaStore();
    const dateStr = formatDateKey(new Date());
    const deviceId = "exhausted-device-123";
    const token = await signDeviceToken(deviceId, "test-secret");
    await store.setDailyDeviceCount(deviceId, dateStr, 10);

    const { response, json, grade, bindingRun } = await deepScan({
      store,
      headers: { "X-Pomona-Device-Token": token },
    });
    expect(response.status).toBe(200);
    expect(json.status).toBe("rate_limited");
    expect(json.message).toBe(translateShared("en-GB", "gate.rateLimited"));
    expect(response.headers.get("X-Pomona-Remaining-Scans")).toBe("0");
    expect(grade).not.toHaveBeenCalled();
    expect(bindingRun).not.toHaveBeenCalled();
  });

  it("translates upstream 429 provider errors into rate_limited response", async () => {
    const rateLimitError = new Error("429 Resource has been exhausted");
    (rateLimitError as any).status = 429;
    const { response, json } = await deepScan({
      gradeError: rateLimitError,
    });
    expect(response.status).toBe(200);
    expect(json.status).toBe("rate_limited");
    expect(json.message).toBe(translateShared("en-GB", "gate.rateLimited"));
  });
});
