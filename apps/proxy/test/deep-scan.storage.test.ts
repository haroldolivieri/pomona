import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore } from "../src/index";
import type { DeepScanResponseModel } from "@pomona/contract";

const deepScanRequest = {
  schemaVersion: "1.0",
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  locale: "en-GB",
  imageBase64: "bWFza2VkLWNvbXBvc2l0ZQ==",
  imageMimeType: "image/jpeg",
  sampleCount: 25,
};

const okModel: DeepScanResponseModel = {
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  ripeness: { state: "nearly_ripe", confidence: 0.85 },
  evidence: ["Tile 2: color lift"],
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

const clef = () => ({
  model: "clef-flash",
  answers: { no_produce: { type: "noul", noul: 0.1 }, unclear_photo: { type: "noul", noul: 0.1 }, multiple_types: { type: "noul", noul: 0.1 } },
  usage: { input_tokens: 10, output_tokens: 0 },
});

function fakeKv() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
      store.set(key, value);
    }),
    _store: store,
  };
}

function fakeR2() {
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

async function run(options: {
  storage?: string;
  kv?: ReturnType<typeof fakeKv> | null;
  r2?: ReturnType<typeof fakeR2> | null;
} = {}) {
  const kv = options.kv === null ? undefined : (options.kv ?? fakeKv());
  const r2 = options.r2 === null ? undefined : (options.r2 ?? undefined);
  const app = createProxyApp({
    quotaStore: createInMemoryQuotaStore(),
    adapterFactory: () => ({
      providerId: "google",
      modelId: "test-model",
      analyzeProduce: vi.fn().mockResolvedValue({
        object: okModel,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    }),
  });
  const response = await app.request(
    "/api/v1/deep-scan",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deepScanRequest),
    },
    {
      DEFAULT_MODEL: "gemini-test",
      COOKIE_SIGNING_SECRET: "test-secret",
      VISION_GATE_ENABLED: "true",
      DEEP_SCAN_STORAGE_ENABLED: options.storage ?? "true",
      ...(kv ? { POMONA_QUOTA_KV: kv } : {}),
      ...(r2 ? { POMONA_CAPTURES_BUCKET: r2 } : {}),
      AI: { run: vi.fn().mockResolvedValue(Response.json(clef())) },
    }
  );
  return { response, json: await response.json(), kv, r2 };
}

describe("Deep-scan capture storage", () => {
  it("stores the composite image and outcome in KV keyed by requestId, retrievable for trace correlation", async () => {
    const { kv } = await run();
    expect(kv!.put).toHaveBeenCalledTimes(1);
    const [key, , putOpts] = kv!.put.mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(key.startsWith("deep-scan:")).toBe(true);
    expect(putOpts?.expirationTtl).toBe(2592000);

    const getResponse = await createProxyApp({ quotaStore: createInMemoryQuotaStore() }).request(
      `/api/v1/deep-scan/storage/${key.slice("deep-scan:".length)}`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "true", POMONA_QUOTA_KV: kv! }
    );
    expect(getResponse.status).toBe(200);
    const stored = await getResponse.json();
    expect(stored).toMatchObject({
      sessionId: deepScanRequest.sessionId,
      sampleCount: 25,
      compositeImageBase64: "bWFza2VkLWNvbXBvc2l0ZQ==",
      outcome: { outcome: "graded", status: "ok", produce: "Avocado", ripeness: "nearly_ripe" },
    });
  });

  it("emits a deep_scan_stored log row carrying the requestId + key for trace correlation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { kv } = await run();
    const row = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("deep_scan_stored"));
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row!) as { event: string; requestId: string; key: string };
    expect(parsed.event).toBe("deep_scan_stored");
    expect(parsed.key).toBe(`deep-scan:${parsed.requestId}`);
    expect(kv!.put).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
  });

  it("does not store and 404s the retrieval route when the storage flag is off", async () => {
    const { kv } = await run({ storage: "false" });
    expect(kv!.put).not.toHaveBeenCalled();
    const getResponse = await createProxyApp({ quotaStore: createInMemoryQuotaStore() }).request(
      "/api/v1/deep-scan/storage/whatever",
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "false" }
    );
    expect(getResponse.status).toBe(404);
  });

  it("stores the composite image even when deep scan visibility gate denies the photo", async () => {
    const clefDenyDeepScan = () => ({
      model: "clef-flash",
      answers: {
        no_produce: { type: "noul", noul: 0.95 },
        unclear_photo: { type: "noul", noul: 0.1 },
      },
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const kv = fakeKv();
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    await app.request(
      "/api/v1/deep-scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deepScanRequest),
      },
      {
        DEFAULT_MODEL: "gemini-test",
        COOKIE_SIGNING_SECRET: "test-secret",
        VISION_GATE_ENABLED: "true",
        DEEP_SCAN_STORAGE_ENABLED: "true",
        POMONA_QUOTA_KV: kv,
        AI: { run: vi.fn().mockResolvedValue(Response.json(clefDenyDeepScan())) },
      }
    );
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value] = kv.put.mock.calls[0] as [string, string];
    expect(key.startsWith("deep-scan:")).toBe(true);
    const record = JSON.parse(value);
    expect(record.compositeImageBase64).toBe("bWFza2VkLWNvbXBvc2l0ZQ==");
    expect(record.outcome.outcome).toBe("gate_denied");
    expect(record.outcome.gateStatus).toBe("no_produce");
  });

  it("returns 404 for an unknown storage key", async () => {
    const getResponse = await createProxyApp({ quotaStore: createInMemoryQuotaStore() }).request(
      "/api/v1/deep-scan/storage/missing",
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "true", POMONA_QUOTA_KV: fakeKv() }
    );
    expect(getResponse.status).toBe(404);
  });

  it("stores raw binary composite photo and JSON record in R2 when POMONA_CAPTURES_BUCKET is bound", async () => {
    const r2 = fakeR2();
    const { kv } = await run({ r2 });
    expect(kv!.put).toHaveBeenCalledTimes(1);
    expect(r2.put).toHaveBeenCalledTimes(2);

    const calls = r2.put.mock.calls as [string, unknown, { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }][];
    const imageCall = calls.find(([k]) => k.endsWith(".jpg"));
    const jsonCall = calls.find(([k]) => k.endsWith(".json"));

    expect(imageCall).toBeDefined();
    expect(imageCall![0].startsWith("deep-scans/")).toBe(true);
    expect(imageCall![1] instanceof Uint8Array).toBe(true);
    expect(imageCall![2].httpMetadata?.contentType).toBe("image/jpeg");
    expect(imageCall![2].customMetadata?.outcome).toBe("graded");
    expect(imageCall![2].customMetadata?.produce).toBe("Avocado");

    expect(jsonCall).toBeDefined();
    expect(jsonCall![0].startsWith("deep-scans/")).toBe(true);
    expect(typeof jsonCall![1]).toBe("string");

    const requestId = imageCall![0].replace("deep-scans/", "").replace(".jpg", "");
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });

    // Test GET JSON metadata
    const getMeta = await app.request(
      `/api/v1/deep-scan/storage/${requestId}`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "true", POMONA_CAPTURES_BUCKET: r2 }
    );
    expect(getMeta.status).toBe(200);
    const metaBody = await getMeta.json();
    expect(metaBody.imageUrl).toBe(`/api/v1/deep-scan/storage/${requestId}/image`);

    // Test GET raw binary composite image
    const getImage = await app.request(
      `/api/v1/deep-scan/storage/${requestId}/image`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "true", POMONA_CAPTURES_BUCKET: r2 }
    );
    expect(getImage.status).toBe(200);
    expect(getImage.headers.get("Content-Type")).toBe("image/jpeg");
    const bytes = await getImage.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("serves raw composite binary image from KV fallback via GET /api/v1/deep-scan/storage/:id/image", async () => {
    const { kv } = await run();
    const [key] = kv!.put.mock.calls[0] as [string, string];
    const captureId = key.slice("deep-scan:".length);

    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const getImage = await app.request(
      `/api/v1/deep-scan/storage/${captureId}/image`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "true", POMONA_QUOTA_KV: kv! }
    );
    expect(getImage.status).toBe(200);
    expect(getImage.headers.get("Content-Type")).toBe("image/jpeg");
    const bytes = await getImage.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
