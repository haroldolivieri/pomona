import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore } from "@pomona/proxy";
import type { ScanResponseModel, DeepScanResponseModel } from "@pomona/contract";

const scanReq = {
  schemaVersion: "1.0",
  sessionId: "550e8400-e29b-41d4-a716-446655440001",
  round: 1,
  locale: "en-GB",
  imageBase64: "dGVzdC1zY2FuLWltYWdl",
  imageMimeType: "image/jpeg",
  focusPolygon: null,
  followUpContext: null,
};

const deepScanReq = {
  schemaVersion: "1.0",
  sessionId: "550e8400-e29b-41d4-a716-446655440002",
  locale: "en-GB",
  imageBase64: "dGVzdC1kZWVwLXNjYW4tY29tcG9zaXRl",
  imageMimeType: "image/jpeg",
  sampleCount: 25,
};

const dummyScanModel: ScanResponseModel = {
  status: "ok",
  abstentionReason: null,
  message: null,
  countedTotal: 1,
  produce: { type: "lemon", displayName: "Lemon", variety: null },
  candidates: [{ id: "c1", box: [100, 100, 300, 300], ripeness: "ripe", score: 8, traits: [], flipSummary: null }],
  verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Ripe Lemon" },
  followUp: null,
  afterPurchase: null,
};

const dummyDsModel: DeepScanResponseModel = {
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "lemon", displayName: "Lemon", variety: null },
  ripeness: { state: "ripe", confidence: 0.9 },
  evidence: ["Even yellow skin"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: null,
  afterPurchase: null,
};

const clefPass = () => ({
  model: "clef-flash",
  answers: {
    no_produce: { type: "noul", noul: 0.1 },
    unclear_photo: { type: "noul", noul: 0.1 },
    multiple_types: { type: "noul", noul: 0.1 },
  },
  usage: { input_tokens: 10, output_tokens: 0 },
});

function createMockKv() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string, _opts?: { expirationTtl?: number }) => {
      store.set(k, v);
    }),
    _store: store,
  };
}

function createMockR2() {
  const store = new Map<string, { value: unknown; options?: unknown }>();
  return {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: entry.value,
        arrayBuffer: async () => (entry.value instanceof Uint8Array ? entry.value.buffer : new ArrayBuffer(0)),
        text: async () => (typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)),
        json: async <T>() => (typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value) as T,
        httpMetadata: (entry.options as { httpMetadata?: { contentType?: string } })?.httpMetadata,
        customMetadata: (entry.options as { customMetadata?: Record<string, string> })?.customMetadata,
        size: entry.value instanceof Uint8Array ? entry.value.byteLength : 100,
      };
    }),
    put: vi.fn(async (key: string, value: unknown, options?: unknown) => {
      store.set(key, { value, options });
      return {};
    }),
    delete: vi.fn(async () => {}),
    _store: store,
  };
}

describe("Backend capture retention evals (30-day storage requirement)", () => {
  it("acceptance: stores standard scan photos with 30-day TTL (2,592,000 seconds)", async () => {
    const kv = createMockKv();
    const app = createProxyApp({
      quotaStore: createInMemoryQuotaStore(),
      adapterFactory: () => ({
        providerId: "google",
        modelId: "gemini-flash",
        analyzeProduce: vi.fn().mockResolvedValue({ rawOutput: dummyScanModel, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }),
      }),
    });

    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanReq),
      },
      {
        DEFAULT_MODEL: "gemini-flash",
        COOKIE_SIGNING_SECRET: "secret",
        VISION_GATE_ENABLED: "true",
        SCAN_STORAGE_ENABLED: "true",
        POMONA_QUOTA_KV: kv,
        AI: { run: vi.fn().mockResolvedValue(Response.json(clefPass())) },
      }
    );

    expect(res.status).toBe(200);
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value, options] = kv.put.mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(key.startsWith("scan:")).toBe(true);
    expect(options.expirationTtl).toBe(2592000); // 30 days
    const record = JSON.parse(value);
    expect(record.imageBase64).toBe(scanReq.imageBase64);
    expect(record.sessionId).toBe(scanReq.sessionId);
  });

  it("acceptance: stores inspect composite photos with 30-day TTL (2,592,000 seconds)", async () => {
    const kv = createMockKv();
    const app = createProxyApp({
      quotaStore: createInMemoryQuotaStore(),
      adapterFactory: () => ({
        providerId: "google",
        modelId: "gemini-flash",
        analyzeProduce: vi.fn().mockResolvedValue({ object: dummyDsModel, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }),
      }),
    });

    const res = await app.request(
      "/api/v1/deep-scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deepScanReq),
      },
      {
        DEFAULT_MODEL: "gemini-flash",
        COOKIE_SIGNING_SECRET: "secret",
        VISION_GATE_ENABLED: "true",
        DEEP_SCAN_STORAGE_ENABLED: "true",
        POMONA_QUOTA_KV: kv,
        AI: { run: vi.fn().mockResolvedValue(Response.json(clefPass())) },
      }
    );

    expect(res.status).toBe(200);
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value, options] = kv.put.mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(key.startsWith("deep-scan:")).toBe(true);
    expect(options.expirationTtl).toBe(2592000); // 30 days
    const record = JSON.parse(value);
    expect(record.compositeImageBase64).toBe(deepScanReq.imageBase64);
    expect(record.sampleCount).toBe(25);
  });

  it("failure case: storage cleanly skips writing when KV binding is absent without crashing the scan", async () => {
    const app = createProxyApp({
      quotaStore: createInMemoryQuotaStore(),
      adapterFactory: () => ({
        providerId: "google",
        modelId: "gemini-flash",
        analyzeProduce: vi.fn().mockResolvedValue({ rawOutput: dummyScanModel, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }),
      }),
    });

    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanReq),
      },
      {
        DEFAULT_MODEL: "gemini-flash",
        COOKIE_SIGNING_SECRET: "secret",
        VISION_GATE_ENABLED: "true",
        SCAN_STORAGE_ENABLED: "true",
        POMONA_QUOTA_KV: undefined, // Absent KV
        AI: { run: vi.fn().mockResolvedValue(Response.json(clefPass())) },
      }
    );

    expect(res.status).toBe(200);
  });

  it("acceptance: stores binary image with content type in Cloudflare R2 bucket for visual inspection", async () => {
    const r2 = createMockR2();
    const app = createProxyApp({
      quotaStore: createInMemoryQuotaStore(),
      adapterFactory: () => ({
        providerId: "google",
        modelId: "gemini-flash",
        analyzeProduce: vi.fn().mockResolvedValue({ rawOutput: dummyScanModel, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }),
      }),
    });

    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanReq),
      },
      {
        DEFAULT_MODEL: "gemini-flash",
        COOKIE_SIGNING_SECRET: "secret",
        VISION_GATE_ENABLED: "true",
        SCAN_STORAGE_ENABLED: "true",
        POMONA_CAPTURES_BUCKET: r2,
        AI: { run: vi.fn().mockResolvedValue(Response.json(clefPass())) },
      }
    );

    expect(res.status).toBe(200);
    expect(r2.put).toHaveBeenCalledTimes(2);

    const calls = r2.put.mock.calls as [string, unknown, { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }][];
    const imageCall = calls.find(([k]) => k.endsWith(".jpg"));
    expect(imageCall).toBeDefined();
    expect(imageCall![1] instanceof Uint8Array).toBe(true);
    expect(imageCall![2].httpMetadata?.contentType).toBe("image/jpeg");
    expect(imageCall![2].customMetadata?.outcome).toBe("graded");

    const requestId = imageCall![0].replace("scans/", "").replace(".jpg", "");

    // Direct image rendering test
    const imageRes = await app.request(
      `/api/v1/scan/storage/${requestId}/image`,
      {},
      {
        COOKIE_SIGNING_SECRET: "secret",
        SCAN_STORAGE_ENABLED: "true",
        POMONA_CAPTURES_BUCKET: r2,
      }
    );
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get("Content-Type")).toBe("image/jpeg");
    const bytes = await imageRes.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
