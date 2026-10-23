import { afterEach, describe, expect, it, vi } from "vitest";
import { createProxyApp } from "@pomona/proxy";

type TestEnv = Record<string, string | undefined> & { COOKIE_SIGNING_SECRET: string };

const env: TestEnv = {
  COOKIE_SIGNING_SECRET: "test-signing-secret-at-least-32-characters",
  GEMINI_API_KEY: "test-google-key",
  OPENAI_API_KEY: "test-openai-key",
  AI_GATEWAY_ACCOUNT_ID: "a".repeat(32),
  AI_GATEWAY_ID: "pomona-test",
  AI_GATEWAY_TOKEN: "test-gateway-token",
};
const request = {
  schemaVersion: "1.0", sessionId: "550e8400-e29b-41d4-a716-446655440000", round: 1,
  locale: "en-GB", imageBase64: "YWJj", imageMimeType: "image/jpeg",
  focusPolygon: null, followUpContext: null,
};
const abstention = {
  abstentionReason: "missing_evidence",
  status: "insufficient_evidence", message: "I cannot confidently choose. Turn the produce to show its hidden grading surface.",
  countedTotal: null, produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null,
};
function providerResponse(provider: string, object: unknown): Response {
  const text = JSON.stringify(object);
  return Response.json(provider === "gemini" ? {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    modelVersion: "gemini-3.1-flash-lite",
  } : {
    id: "resp_test", object: "response", created_at: 0, model: "gpt-4o-mini", status: "completed",
    output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });
}
async function scan(bindings: TestEnv) {
  const app = createProxyApp();
  return app.request("/api/v1/scan", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://pomona.example" },
    body: JSON.stringify(request),
  }, bindings);
}
function metrics(log: ReturnType<typeof vi.spyOn>) {
  return log.mock.calls.flatMap((args) => {
    try { const value = JSON.parse(String(args[0])); return value.event ? [value] : []; } catch { return []; }
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Deep Scan scan_usage telemetry", () => {
  const dsRequest = {
    schemaVersion: "1.0", sessionId: "550e8400-e29b-41d4-a716-446655440000", locale: "en-GB",
    imageBase64: "Y29tcG9zaXRl", imageMimeType: "image/webp", sampleCount: 25,
  };
  const dsOk = {
    status: "ok", abstentionReason: null, message: null,
    produce: { type: "avocado", displayName: "Avocado", variety: null },
    ripeness: { state: "nearly_ripe", confidence: 0.85 },
    evidence: ["Tile 2: color lift"], quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
    manualChecks: null, recommendation: null,
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
  const dsClef = {
    model: "clef-flash",
    answers: { no_produce: { type: "noul", noul: 0.1 }, unclear_photo: { type: "noul", noul: 0.1 } },
    usage: { input_tokens: 900, output_tokens: 0 },
  };

  it("logs the deep-scan usage row with frames and composite bytes, still never charging quota", async () => {
    const fetch = vi.fn().mockImplementation(async () => providerResponse("gemini", dsOk));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = createProxyApp();
    const response = await app.request("/api/v1/deep-scan", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://pomona.example" },
      body: JSON.stringify(dsRequest),
    }, { ...env, DEFAULT_MODEL: "gemini-3.1-flash-lite", AI: { run: vi.fn().mockResolvedValue(Response.json(dsClef)) } });
    expect(response.status).toBe(200);
    const rows = metrics(log);
    const usageRow = rows.find((row) => row.event === "scan_usage" && row.stage === "deep_scan");
    expect(usageRow).toBeDefined();
    expect(usageRow.framesSubmitted).toBe(25);
    expect(usageRow.compositeImageBytes).toBeGreaterThan(0);
    expect(usageRow.attempts).toBeGreaterThanOrEqual(1);
    expect(usageRow.status).toBe("ok");
    expect(usageRow.promptVersion).toBe("deep_scan_v1");
  });
});

describe("Gateway production routing and usage scenarios", () => {
  it.each(["gemini", "openai"])("%s: routes a real SDK request through Gateway with trace metadata and usage", async (provider) => {
    const fetch = vi.fn().mockImplementation(async () => providerResponse(provider, abstention));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await scan({ ...env, ACTIVE_PROVIDER: provider, DEFAULT_MODEL: provider === "gemini" ? "gemini-3.1-flash-lite" : "gpt-4o-mini" });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("insufficient_evidence");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe(provider === "gemini"
      ? `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/pomona-test/google-ai-studio/v1beta/models/gemini-3.1-flash-lite:generateContent`
      : `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/pomona-test/openai/responses`);
    const headers = new Headers(options.headers);
    expect(headers.get("cf-aig-authorization")).toBe("Bearer test-gateway-token");
    expect(headers.get("cf-aig-collect-log")).toBe("true");
    expect(headers.get("cf-aig-collect-log-payload")).toBe("false");
    expect(headers.get("cf-aig-skip-cache")).toBe("true");
    expect(headers.get(provider === "gemini" ? "x-goog-api-key" : "authorization")).toBe(provider === "gemini" ? "test-google-key" : "Bearer test-openai-key");
    const requestId = response.headers.get("X-Pomona-Request-Id")!;
    expect(headers.get("cf-aig-otel-trace-id")).toBe(requestId.replaceAll("-", ""));
    expect(JSON.parse(headers.get("cf-aig-metadata")!)).toMatchObject({ app: "pomona", requestId, sessionId: request.sessionId, round: 1, promptVersion: "v1", attempt: 1 });
    expect(response.headers.get("access-control-expose-headers")).toContain("X-Pomona-Request-Id");
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "model_usage", requestId, success: true, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }));
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "scan_usage", requestId, attempts: 1, status: "insufficient_evidence" }));
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "scan_received", requestId,
      selectionPresent: false }));
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "model_response", requestId,
      response: expect.objectContaining({ status: "insufficient_evidence" }) }));
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "scan_response", requestId,
      response: expect.objectContaining({ status: "insufficient_evidence" }) }));
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "scan_complete", requestId,
      httpStatus: 200, durationMs: expect.any(Number) }));
    expect(JSON.stringify(metrics(log))).not.toMatch(/test-gateway-token|test-google-key|test-openai-key|YWJj|systemPrompt|imageBase64/);
  });

  it("repair: preserves correlation and records each attempt without losing token totals", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(providerResponse("gemini", { ...abstention, status: "ok" })).mockResolvedValueOnce(providerResponse("gemini", abstention));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await scan({ ...env, ACTIVE_PROVIDER: "gemini" });
    expect((await response.json()).status).toBe("insufficient_evidence");
    expect(fetch).toHaveBeenCalledTimes(2);
    const traces = fetch.mock.calls.map(([, options]) => JSON.parse(new Headers(options.headers).get("cf-aig-metadata")!));
    expect(traces.map((t) => t.attempt)).toEqual([1, 2]);
    expect(traces[0].requestId).toBe(traces[1].requestId);
    expect(metrics(log)).toContainEqual(expect.objectContaining({ event: "scan_usage", attempts: 2, usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 } }));
  });

  it("upstream failure: records failures and returns the existing fallback without direct-provider bypass", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: "Bad request", status: "INVALID_ARGUMENT" } }, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await scan({ ...env, ACTIVE_PROVIDER: "gemini" });
    expect((await response.json()).status).toBe("analysis_failed");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://gateway.ai.cloudflare.com/"))).toBe(true);
    expect(metrics(log).filter((m) => m.event === "model_usage")).toEqual([
      expect.objectContaining({ attempt: 1, success: false, upstreamStatus: 400 }),
      expect.objectContaining({ attempt: 2, success: false, upstreamStatus: 400 }),
    ]);
  });

  it("configuration: rejects incomplete routing and preserves direct local requests when unconfigured", async () => {
    const fetch = vi.fn().mockImplementation(async () => providerResponse("gemini", abstention));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const directEnv = { COOKIE_SIGNING_SECRET: "test", GEMINI_API_KEY: "test-google-key" };
    for (const config of [
      { AI_GATEWAY_ID: "only-id" }, { AI_GATEWAY_TOKEN: "only-token" }, { AI_GATEWAY_ACCOUNT_ID: "a".repeat(32) },
      { AI_GATEWAY_ACCOUNT_ID: "invalid", AI_GATEWAY_ID: "valid" },
      { AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), AI_GATEWAY_ID: "../other" },
    ]) {
      const failure = await scan({ ...directEnv, ...config });
      expect(failure.status).toBe(200);
      expect((await failure.json()).status).toBe("analysis_failed");
    }
    expect(fetch).not.toHaveBeenCalled();
    const local = await scan(directEnv);
    expect((await local.json()).status).toBe("insufficient_evidence");
    expect(String(fetch.mock.calls[0][0])).toMatch(/^https:\/\/generativelanguage.googleapis.com\//);
    expect(new Headers(fetch.mock.calls[0][1].headers).has("cf-aig-metadata")).toBe(false);
    const unauthenticated = await scan({ ...env, AI_GATEWAY_TOKEN: undefined });
    expect((await unauthenticated.json()).status).toBe("insufficient_evidence");
    expect(new Headers(fetch.mock.calls[1][1].headers).has("cf-aig-authorization")).toBe(false);
  });
});
