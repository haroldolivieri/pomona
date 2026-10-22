import { describe, expect, it, vi } from "vitest";
import { createProxyApp, createInMemoryQuotaStore, calculateTokenSpendMicroCents } from "@pomona/proxy";
import { ScanResponseSchema } from "@pomona/contract";

const request = {
  schemaVersion: "1.0", sessionId: "550e8400-e29b-41d4-a716-446655440000", round: 1,
  locale: "en-GB", imageBase64: "bWFza2VkLWZ1bGwtZnJhbWU=", imageMimeType: "image/webp",
  focusPolygon: [[200, 200], [800, 200], [800, 800], [200, 800]], followUpContext: null,
};
const abstention = {
  status: "insufficient_evidence", abstentionReason: "missing_evidence",
  message: "I cannot grade the hidden surfaces. Please turn the produce to show another side.",
  countedTotal: null, produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null,
};
const output = (scores: number[]) => ({
  model: "clef-flash",
  answers: Object.fromEntries(["no_produce", "unclear_photo", "multiple_types"].map((key, i) => [key, { type: "noul", noul: scores[i] }])),
  usage: { input_tokens: 1500, output_tokens: 0 },
});

async function scan(run: ReturnType<typeof vi.fn>, options: {
  enabled?: string; body?: Record<string, unknown>; store?: ReturnType<typeof createInMemoryQuotaStore>;
  noBinding?: boolean; gatewayId?: string; local?: boolean; tracing?: NonNullable<Parameters<typeof createProxyApp>[0]>["tracing"];
} = {}) {
  const grade = vi.fn().mockResolvedValue({ object: abstention, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
  const store = options.store ?? createInMemoryQuotaStore();
  const app = createProxyApp({ quotaStore: store, tracing: options.tracing, adapterFactory: modelId => ({ providerId: "google", modelId, analyzeProduce: grade }) });
  const response = await app.request("/api/v1/scan", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, ...options.body }),
  }, { COOKIE_SIGNING_SECRET: "test-secret", VISION_GATE_ENABLED: options.enabled ?? "true",
    ...(!options.noBinding ? { AI: { run } } : {}), AI_GATEWAY_ID: options.gatewayId,
    LOCAL_CLEF_TEST: options.local ? "true" : undefined });
  return { response, json: await response.json(), grade, store };
}

describe("Clef visibility gate acceptance and failure scenarios", () => {
  it.each([401, 403, 429])("an elapsed timeout cannot hide a known HTTP %s denial", async status => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("Timed out", "TimeoutError")));
    try {
      const { grade, json } = await scan(vi.fn().mockResolvedValue(Response.json({ error: "Denied" }, { status })));
      expect(json.status).toBe(status === 429 ? "rate_limited" : "analysis_failed");
      expect(grade).not.toHaveBeenCalled();
    } finally { timeout.mockRestore(); }
  });

  it("the three-second timeout stays on the Clef span and Gemini response stays on its own span", async () => {
    const stages = new Map<string, ReturnType<typeof vi.fn>>();
    const tracing = { enterSpan<T>(name: string, callback: (span: { setAttributes: ReturnType<typeof vi.fn> }) => T): T {
      const setAttributes = vi.fn(); stages.set(name, setAttributes); return callback({ setAttributes });
    } };
    const run = vi.fn().mockImplementation((_model, _input, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const pending = scan(run, { tracing });
      await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
      expect(stages.get("scan.gemini_or_provider")).toBeUndefined();
      controller.abort(new DOMException("Timed out", "TimeoutError"));
      const { grade, json } = await pending;
      expect(timeout).toHaveBeenCalledWith(3000);
      expect(grade).toHaveBeenCalledOnce();
      expect(json.status).toBe("insufficient_evidence");
      expect(stages.get("scan.clef")).toHaveBeenCalledWith(expect.objectContaining({ "stage.outcome": "timeout", "error.timeout": true }));
      expect(stages.get("scan.clef")).toHaveBeenCalledWith(expect.objectContaining({ "gate.timed_out": true, "gate.decision": "pass_to_grading" }));
      expect(stages.get("scan.gemini_or_provider")).toHaveBeenCalledWith(expect.objectContaining({ "model.status": "insufficient_evidence", "model.response": JSON.stringify(abstention) }));
      expect(stages.get("scan.request")).toHaveBeenCalledWith(expect.objectContaining({ "scan.status": "insufficient_evidence" }));
    } finally { timeout.mockRestore(); }
  });

  it("preserves Portuguese gate responses when extending the localized release", async () => {
    const { json, grade } = await scan(vi.fn().mockResolvedValue(Response.json(output([0.95, 0.01, 0.01]))),
      { body: { locale: "pt-BR" } });
    expect(json.status).toBe("no_produce");
    expect(json.message).toBe("Não há frutas, verduras ou legumes frescos visíveis. Fotografe os itens que deseja comparar.");
    expect(grade).not.toHaveBeenCalled();
  });
  it.each([
    ["no_produce", [0.9025, 0.2521, 0.088]],
    ["unclear_photo", [0.7103, 0.9661, 0.1972]],
    ["multiple_types", [0.0344, 0.0439, 0.8803]],
  ])("clear %s skips grading, preserves quota and accounts gate usage", async (status, scores) => {
    const run = vi.fn().mockResolvedValue(Response.json(output(scores as number[])));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await scan(run);
    const events = log.mock.calls.flatMap(args => { try { return [JSON.parse(String(args[0]))]; } catch { return []; } });
    const requestId = result.response.headers.get("X-Pomona-Request-Id");
    expect(events).toContainEqual(expect.objectContaining({ event: "gate_usage", requestId, threshold: 0.85,
      scores: { no_produce: scores[0], unclear_photo: scores[1], multiple_types: scores[2] } }));
    expect(events).toContainEqual(expect.objectContaining({ event: "scan_response", requestId,
      response: expect.objectContaining({ status }) }));
    log.mockRestore();
    expect(result.json.status).toBe(status);
    expect(ScanResponseSchema.safeParse(result.json).success).toBe(true);
    expect(result.grade).not.toHaveBeenCalled();
    expect(result.response.headers.get("X-Pomona-Remaining-Scans")).toBe("10");
    expect(await result.store.getMonthlySpendMicroCents(new Date().toISOString().slice(0, 7))).toBe(6);
    const [model, input] = run.mock.calls[0];
    expect(model).toBe("@cf/cloudflare/clef-flash");
    expect(input.images).toEqual([`data:image/webp;base64,${request.imageBase64}`]);
    expect(input.state).toContain("mask");
    expect(input.state).toContain("not");
    expect(input.questions.no_produce.instructions).toBe("Is there no real fresh fruit or vegetable visible?");
    expect(input.state).toContain("Missing underside views alone");
  });

  it.each([[0.01, 0.01, 0.01], [0.8499, 0.01, 0.01], [0.85, 0.85, 0.01]])(
    "usable, uncertain, or contradictory decisions preserve Gemini abstention: %j", async (...scores) => {
      const { json, grade } = await scan(vi.fn().mockResolvedValue(Response.json(output(scores))));
      expect(json.status).toBe("insufficient_evidence");
      expect(grade).toHaveBeenCalledOnce();
      expect(grade.mock.calls[0][0].imageBase64).toBe(request.imageBase64);
    },
  );

  it.each([{}, { ...output([1, 0, 0]), answers: { no_produce: { type: "noul", noul: 2 } } }])(
    "malformed decisions do not reject a usable photo", async raw => {
      const { json, grade } = await scan(vi.fn().mockResolvedValue(Response.json(raw)));
      expect(json.status).toBe("insufficient_evidence");
      expect(grade).toHaveBeenCalledOnce();
    },
  );

  it("ordinary gate outage continues to grading without a gate retry", async () => {
    const run = vi.fn().mockRejectedValue(new Error("temporary failure"));
    const { grade } = await scan(run);
    expect(run).toHaveBeenCalledOnce();
    expect(grade).toHaveBeenCalledOnce();
  });

  it("gate 429 stops further paid calls", async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error("budget or capacity"), { status: 429 }));
    const { json, grade } = await scan(run);
    expect(json.status).toBe("rate_limited");
    expect(run).toHaveBeenCalledOnce();
    expect(grade).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429])("native raw HTTP %s stops grading even without an error status property", async status => {
    const { json, grade } = await scan(vi.fn().mockResolvedValue(Response.json({ internalCode: 3040,
      description: "Capacity temporarily exceeded" }, { status })));
    expect(json.status).toBe(status === 429 ? "rate_limited" : "analysis_failed");
    expect(grade).not.toHaveBeenCalled();
  });

  it("a broken denial response body cannot erase its HTTP status", async () => {
    const response = new Response(new ReadableStream({ start(controller) {
      controller.error(new Error("upstream stream failed"));
    } }), { status: 429 });
    const { json, grade } = await scan(vi.fn().mockResolvedValue(response));
    expect(json.status).toBe("rate_limited");
    expect(grade).not.toHaveBeenCalled();
  });

  it.each([401, 403])("gate authentication denial %s stops further paid calls", async status => {
    const { json, grade } = await scan(vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { status })));
    expect(json.status).toBe("analysis_failed");
    expect(grade).not.toHaveBeenCalled();
  });

  it("missing binding fails explicitly instead of pretending the gate ran", async () => {
    const { json, grade } = await scan(vi.fn(), { noBinding: true });
    expect(json.status).toBe("analysis_failed");
    expect(grade).not.toHaveBeenCalled();
  });

  it("a gate accounting failure does not authorize another paid call", async () => {
    const store = createInMemoryQuotaStore();
    store.incrementMonthlySpendMicroCents = async () => { throw new Error("KV unavailable"); };
    const { json, grade } = await scan(vi.fn().mockResolvedValue(Response.json(output([0.01, 0.01, 0.01]))), { store });
    expect(json.status).toBe("analysis_failed");
    expect(grade).not.toHaveBeenCalled();
  });

  it("rechecks the aggregate cap after gate spending before grading", async () => {
    const store = createInMemoryQuotaStore();
    await store.setMonthlySpendMicroCents(new Date().toISOString().slice(0, 7), 999999);
    const { json, grade } = await scan(vi.fn().mockResolvedValue(Response.json(output([0.01, 0.01, 0.01]))), { store });
    expect(json.status).toBe("rate_limited");
    expect(grade).not.toHaveBeenCalled();
  });

  it("threshold equality rejects and native Gateway metadata stays within five entries", async () => {
    const run = vi.fn().mockResolvedValue(Response.json(output([0.85, 0.01, 0.01])));
    const { json } = await scan(run, { gatewayId: "pomona-test" });
    expect(json.status).toBe("no_produce");
    const options = run.mock.calls[0][2];
    expect(options.gateway).toMatchObject({ id: "pomona-test", skipCache: true, collectLog: false, retries: { maxAttempts: 1 } });
    expect(Object.keys(options.gateway.metadata)).toHaveLength(5);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("local testing never sends Clef inference through an inherited production Gateway", async () => {
    const run = vi.fn().mockResolvedValue(Response.json(output([0.99, 0.01, 0.01])));
    const { json } = await scan(run, { gatewayId: "production", local: true });
    expect(json.status).toBe("no_produce");
    expect(run.mock.calls[0][2].gateway).toBeUndefined();
    expect(run.mock.calls[0][2].extraHeaders).toBeUndefined();
  });

  it("disabled mode bypasses Clef", async () => {
    const run = vi.fn();
    const { json } = await scan(run, { enabled: "false" });
    expect(run).not.toHaveBeenCalled();
    expect(json.status).toBe("insufficient_evidence");
  });

  it("Clef cannot reject a later round", async () => {
    const run = vi.fn().mockResolvedValue(Response.json(output([1, 0, 0])));
    const { grade } = await scan(run, { body: { round: 2, focusPolygon: null } });
    expect(run).not.toHaveBeenCalled();
    expect(grade).toHaveBeenCalled();
  });

  it("prices Clef input separately and never bills output tokens", () => {
    expect(calculateTokenSpendMicroCents("@cf/cloudflare/clef-flash", { promptTokens: 10000, completionTokens: 500, totalTokens: 10500 })).toBe(38);
  });
});
