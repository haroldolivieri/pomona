import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore } from "../src/index";
import type { ScanResponseModel } from "@pomona/contract";

const scanRequest = {
  schemaVersion: "1.0",
  sessionId: "660e8400-e29b-41d4-a716-446655440001",
  round: 1,
  locale: "en-GB",
  imageBase64: "c2Nhbi1waWN0dXJlLWJhc2U2NA==",
  imageMimeType: "image/jpeg",
  focusPolygon: null,
  followUpContext: null,
};

const okScanModel: ScanResponseModel = {
  status: "ok",
  abstentionReason: null,
  message: null,
  countedTotal: 1,
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  candidates: [
    { id: "a", box: [100, 100, 300, 300], ripeness: "ripe", score: 9, traits: ["Dark skin"], flipSummary: null },
  ],
  verdict: { winnerId: "a", runnerUpId: null, confidence: "high", headline: "Take candidate A" },
  followUp: null,
  afterPurchase: {
    readyInDays: { min: 0, max: 1 },
    eatWithinDays: { min: 2, max: 3 },
    eatWithinLabel: "2-3 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Ready to eat", tip: "Consume soon" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "In airtight container", tip: "Keep seed in" },
    },
  },
};

const clefPass = () => ({
  model: "clef-flash",
  answers: {
    no_produce: { type: "noul", noul: 0.1 },
    unclear_photo: { type: "noul", noul: 0.1 },
    multiple_types: { type: "noul", noul: 0.1 },
    single_produce: { type: "noul", noul: 0.1 },
  },
  usage: { input_tokens: 10, output_tokens: 0 },
});

const clefDeny = () => ({
  model: "clef-flash",
  answers: {
    no_produce: { type: "noul", noul: 0.95 },
    unclear_photo: { type: "noul", noul: 0.1 },
    multiple_types: { type: "noul", noul: 0.1 },
    single_produce: { type: "noul", noul: 0.1 },
  },
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

async function runScan(options: {
  storage?: string;
  kv?: ReturnType<typeof fakeKv> | null;
  r2?: ReturnType<typeof fakeR2> | null;
  clefResponse?: unknown;
} = {}) {
  const kv = options.kv === null ? undefined : (options.kv ?? fakeKv());
  const r2 = options.r2 === null ? undefined : (options.r2 ?? undefined);
  const app = createProxyApp({
    quotaStore: createInMemoryQuotaStore(),
    adapterFactory: () => ({
      providerId: "google",
      modelId: "test-model",
      analyzeProduce: vi.fn().mockResolvedValue({
        rawOutput: okScanModel,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    }),
  });
  const response = await app.request(
    "/api/v1/scan",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanRequest),
    },
    {
      DEFAULT_MODEL: "gemini-test",
      COOKIE_SIGNING_SECRET: "test-secret",
      VISION_GATE_ENABLED: "true",
      SCAN_STORAGE_ENABLED: options.storage ?? "true",
      ...(kv ? { POMONA_QUOTA_KV: kv } : {}),
      ...(r2 ? { POMONA_CAPTURES_BUCKET: r2 } : {}),
      AI: { run: vi.fn().mockResolvedValue(Response.json(options.clefResponse ?? clefPass())) },
    }
  );
  return { response, json: await response.json(), kv, r2 };
}

describe("Compare scan capture storage (30-day retention)", () => {
  it("stores the photo and grading outcome in KV with 30-day TTL (2,592,000s)", async () => {
    const { kv } = await runScan();
    expect(kv!.put).toHaveBeenCalledTimes(1);
    const [key, value, putOpts] = kv!.put.mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(key.startsWith("scan:")).toBe(true);
    expect(putOpts.expirationTtl).toBe(2592000); // 30 days in seconds

    const record = JSON.parse(value);
    expect(record.sessionId).toBe(scanRequest.sessionId);
    expect(record.imageBase64).toBe(scanRequest.imageBase64);
    expect(record.mimeType).toBe("image/jpeg");
    expect(record.focusPolygon).toEqual(scanRequest.focusPolygon);
    expect(record.outcome.outcome).toBe("graded");
    expect(record.outcome.produce).toBe("Avocado");
  });

  it("retrieves the stored scan capture via GET /api/v1/scan/storage/:id", async () => {
    const { kv } = await runScan();
    const [key] = kv!.put.mock.calls[0] as [string, string];
    const captureId = key.slice("scan:".length);

    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const getRes = await app.request(
      `/api/v1/scan/storage/${captureId}`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", SCAN_STORAGE_ENABLED: "true", POMONA_QUOTA_KV: kv! }
    );
    expect(getRes.status).toBe(200);
    const stored = await getRes.json();
    expect(stored).toMatchObject({
      sessionId: scanRequest.sessionId,
      imageBase64: scanRequest.imageBase64,
      round: 1,
    });
  });

  it("stores the capture even when visibility gate denies the photo (auditability)", async () => {
    const { kv } = await runScan({ clefResponse: clefDeny() });
    expect(kv!.put).toHaveBeenCalledTimes(1);
    const [key, value] = kv!.put.mock.calls[0] as [string, string];
    expect(key.startsWith("scan:")).toBe(true);
    const record = JSON.parse(value);
    expect(record.imageBase64).toBe(scanRequest.imageBase64);
    expect(record.outcome.outcome).toBe("gate_denied");
    expect(record.outcome.gateStatus).toBe("no_produce");
  });

  it("does not store and returns 404 on retrieval when storage is disabled", async () => {
    const { kv } = await runScan({ storage: "false" });
    expect(kv!.put).not.toHaveBeenCalled();

    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const getRes = await app.request(
      "/api/v1/scan/storage/whatever",
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", SCAN_STORAGE_ENABLED: "false", POMONA_QUOTA_KV: kv! }
    );
    expect(getRes.status).toBe(404);
  });

  it("stores raw binary photo and JSON record in R2 bucket when POMONA_CAPTURES_BUCKET is bound", async () => {
    const r2 = fakeR2();
    const { kv } = await runScan({ r2 });
    expect(kv!.put).toHaveBeenCalledTimes(1);
    expect(r2.put).toHaveBeenCalledTimes(2);

    const calls = r2.put.mock.calls as [string, unknown, { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }][];
    const imageCall = calls.find(([k]) => k.endsWith(".jpg"));
    const jsonCall = calls.find(([k]) => k.endsWith(".json"));

    expect(imageCall).toBeDefined();
    expect(imageCall![0].startsWith("scans/")).toBe(true);
    expect(imageCall![1] instanceof Uint8Array).toBe(true);
    expect(imageCall![2].httpMetadata?.contentType).toBe("image/jpeg");
    expect(imageCall![2].customMetadata?.outcome).toBe("graded");
    expect(imageCall![2].customMetadata?.produce).toBe("Avocado");

    expect(jsonCall).toBeDefined();
    expect(jsonCall![0].startsWith("scans/")).toBe(true);
    expect(typeof jsonCall![1]).toBe("string");

    const requestId = imageCall![0].replace("scans/", "").replace(".jpg", "");
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });

    // Test GET JSON metadata
    const getMeta = await app.request(
      `/api/v1/scan/storage/${requestId}`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", SCAN_STORAGE_ENABLED: "true", POMONA_CAPTURES_BUCKET: r2 }
    );
    expect(getMeta.status).toBe(200);
    const metaBody = await getMeta.json();
    expect(metaBody.imageUrl).toBe(`/api/v1/scan/storage/${requestId}/image`);

    // Test GET raw binary image
    const getImage = await app.request(
      `/api/v1/scan/storage/${requestId}/image`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", SCAN_STORAGE_ENABLED: "true", POMONA_CAPTURES_BUCKET: r2 }
    );
    expect(getImage.status).toBe(200);
    expect(getImage.headers.get("Content-Type")).toBe("image/jpeg");
    const bytes = await getImage.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("serves raw binary image from KV fallback via GET /api/v1/scan/storage/:id/image", async () => {
    const { kv } = await runScan();
    const [key] = kv!.put.mock.calls[0] as [string, string];
    const captureId = key.slice("scan:".length);

    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const getImage = await app.request(
      `/api/v1/scan/storage/${captureId}/image`,
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", SCAN_STORAGE_ENABLED: "true", POMONA_QUOTA_KV: kv! }
    );
    expect(getImage.status).toBe(200);
    expect(getImage.headers.get("Content-Type")).toBe("image/jpeg");
    const bytes = await getImage.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
