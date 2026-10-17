import { describe, expect, it } from "vitest";
import { createProxyApp } from "../src/index";
import { createInMemoryQuotaStore } from "../src/quota/budget";

describe("Hono Worker routes (/api/v1/quota & /api/v1/scan)", () => {
  const env = {
    GEMINI_API_KEY: "test-gemini-key",
    OPENAI_API_KEY: "test-openai-key",
    COOKIE_SIGNING_SECRET: "test-signing-secret-32-bytes-long",
    ACTIVE_PROMPT_VERSION: "v1",
    ACTIVE_PROVIDER: "gemini",
  };

  it("GET /api/v1/quota issues an X-Pomona-Device-Token and returns 10 remaining scans", async () => {
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const res = await app.request("/api/v1/quota", { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Pomona-Device-Token")).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ remainingDeviceScans: 10, budgetOpen: true });
  });

  it("POST /api/v1/scan executes the vision adapter, verifies the contract, and decrements quota to 9", async () => {
    const store = createInMemoryQuotaStore();
    const app = createProxyApp({
      quotaStore: store,
      adapterFactory: (modelId) => ({
        providerId: "gemini",
        modelId,
        analyzeProduce: async () => ({
          rawOutput: {
            status: "ok",
            message: null,
            produce: { type: "watermelon", displayName: "Watermelon", variety: null },
            candidates: [
              { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot", "Matte rind"], flipSummary: null },
            ],
            verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
            followUp: null,
            afterPurchase: {
              readyInDays: { min: 0, max: 0 },
              eatWithinDays: { min: 3, max: 5 },
              eatWithinLabel: "3–5 days",
              storage: {
                beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep whole" },
                afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
              },
            },
          },
          usage: { promptTokens: 450, completionTokens: 250, totalTokens: 700 },
        }),
      }),
    });

    const scanRes = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        }),
      },
      env
    );
    expect(scanRes.status).toBe(200);
    const json = await scanRes.json();
    expect(json.status).toBe("ok");
    expect(json.promptVersion).toBe("v1");
    expect(scanRes.headers.get("X-Pomona-Remaining-Scans")).toBe("9");
  });

  it("converts upstream provider HTTP 429 errors into a graceful status: 'rate_limited' contract response", async () => {
    const app = createProxyApp({
      quotaStore: createInMemoryQuotaStore(),
      adapterFactory: (modelId) => ({
        providerId: "gemini",
        modelId,
        analyzeProduce: async () => {
          const err: any = new Error("Resource has been exhausted (429)");
          err.statusCode = 429;
          throw err;
        },
      }),
    });

    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        }),
      },
      env
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("rate_limited");
  });

  it("enforces 500 KB request body limit on /api/v1/scan", async () => {
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    // Create payload larger than 500 KB (500 * 1024 = 512,000 bytes)
    const largeBase64 = "a".repeat(550 * 1024);
    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: largeBase64,
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        }),
      },
      env
    );
    expect(res.status).toBe(413);
    const errBody = await res.json();
    expect(errBody.error).toMatch(/Maximum size is 500 KB/i);
  });

  it("rejects scan requests with non-UUID sessionId with status 400", async () => {
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "session-invalid-not-uuid",
          round: 1,
          locale: "en-GB",
          imageBase64: "dGVzdA==",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        }),
      },
      env
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid scan request");
    expect(json.details.some((d: any) => d.path.includes("sessionId"))).toBe(true);
  });

  it("recognizes existing device token from cookie or header without re-issuing a new one", async () => {
    const store = createInMemoryQuotaStore();
    const app = createProxyApp({ quotaStore: store });

    // 1st request gets token
    const firstRes = await app.request("/api/v1/quota", { method: "GET" }, env);
    const issuedToken = firstRes.headers.get("X-Pomona-Device-Token");
    expect(issuedToken).toBeTruthy();

    // 2nd request provides token via header
    const secondRes = await app.request(
      "/api/v1/quota",
      {
        method: "GET",
        headers: { "X-Pomona-Device-Token": issuedToken! },
      },
      env
    );
    expect(secondRes.headers.get("X-Pomona-Device-Token")).toBe(issuedToken);

    // 3rd request provides token via cookie
    const thirdRes = await app.request(
      "/api/v1/quota",
      {
        method: "GET",
        headers: { Cookie: `pomona_device_token=${issuedToken}` },
      },
      env
    );
    expect(thirdRes.headers.get("X-Pomona-Device-Token")).toBe(issuedToken);
  });
});
