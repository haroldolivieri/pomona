import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore } from "@pomona/proxy";
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
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    _store: store,
  };
}

async function run(options: { storage?: string; kv?: ReturnType<typeof fakeKv> | null } = {}) {
  const kv = options.kv === null ? undefined : (options.kv ?? fakeKv());
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
      AI: { run: vi.fn().mockResolvedValue(Response.json(clef())) },
    }
  );
  return { response, json: await response.json(), kv };
}

describe("Deep-scan capture storage", () => {
  it("stores the composite image and outcome in KV keyed by requestId, retrievable for trace correlation", async () => {
    const { kv } = await run();
    expect(kv!.put).toHaveBeenCalledTimes(1);
    const [key] = kv!.put.mock.calls[0] as [string, string];
    expect(key.startsWith("deep-scan:")).toBe(true);

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

  it("returns 404 for an unknown storage key", async () => {
    const getResponse = await createProxyApp({ quotaStore: createInMemoryQuotaStore() }).request(
      "/api/v1/deep-scan/storage/missing",
      {},
      { COOKIE_SIGNING_SECRET: "test-secret", DEEP_SCAN_STORAGE_ENABLED: "true", POMONA_QUOTA_KV: fakeKv() }
    );
    expect(getResponse.status).toBe(404);
  });
});
