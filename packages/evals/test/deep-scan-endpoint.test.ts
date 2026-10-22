import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore } from "@pomona/proxy";
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
    headers: { "Content-Type": "application/json" },
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
  it("returns a verified deep-scan verdict without touching device quota", async () => {
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
    expect(incrementDailyDeviceCount).not.toHaveBeenCalled();
    expect(response.headers.get("X-Pomona-Remaining-Scans")).toBeNull();
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
    const { json, grade, store } = await deepScan({
      body: { ...deepScanRequest, imageBase64: "A".repeat(1_400_000) },
    });
    expect(json.status).toBe("analysis_failed");
    expect(json.message).toBe(translateShared("en-GB", "gate.tooLarge"));
    expect(grade).not.toHaveBeenCalled();
  });
});
