import { serveLocalizedDocument } from "./document";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import {
  ScanRequestSchema,
  DeepScanRequestSchema,
  isSupportedLocale,
  resolveDisplayLocale,
  translateShared,
  LOCALE_COOKIE,
  lookupProduceSeasonality,
  type ScanRequest,
  type ScanResponse,
  type SeasonalityInfo,
  type DeepScanResponse,
  type DeepScanRequest,
} from "@pomona/contract";
import type { Env } from "./types";
import {
  type QuotaStore,
  createKvQuotaStore,
  createInMemoryQuotaStore,
  checkQuotaAndSelectModel,
  recordScanOutcome,
  calculateTokenSpendMicroCents,
  formatDateKey,
  formatMonthKey,
  MONTHLY_HARD_CAP_MICRO_CENTS,
} from "./quota/budget";
import { signDeviceToken, verifyDeviceToken } from "./quota/token";
import { getPromptConfig } from "./prompts";
import {
  type VisionProviderAdapter,
  runVerifiedVisionScan,
} from "./adapters/types";
import { runVerifiedDeepScan } from "./adapters/deep-scan";
import { createGeminiVisionAdapter } from "./adapters/gemini";
import { createOpenAIVisionAdapter } from "./adapters/openai";
import { getGatewayRouting } from "./adapters/gateway";
import { verifyAndResolveScanResponse } from "./verifier/verify-response";
import {
  runVisibilityGate,
  runDeepScanVisibilityGate,
  visibilityGateResponse,
  deepScanGateResponse,
  gateDenialStatus,
  VISIBILITY_GATE_MODEL,
  VISIBILITY_GATE_THRESHOLD,
} from "./gate/visibility";

import { traceStage, traceResponse, logScanResponse, type ScanTracing } from "./observability/scan-trace";

type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    flowStage: "scan" | "deep-scan";
    gateDecision: string;
    gradingStarted: boolean;
  };
};

export interface VisionAdapterLike {
  readonly providerId: string;
  readonly modelId: string;
  analyzeProduce(
    input: any,
    signal?: AbortSignal
  ): Promise<{ object?: unknown; rawOutput?: unknown; usage?: any }>;
}

export interface CreateProxyAppOptions {
  tracing?: ScanTracing;
  quotaStore?: QuotaStore;
  adapterFactory?: (modelId: string, env: Env) => VisionAdapterLike;
}

const DEVICE_TOKEN_HEADER = "X-Pomona-Device-Token";
const DEVICE_TOKEN_COOKIE = "pomona_device_token";
const REMAINING_SCANS_HEADER = "X-Pomona-Remaining-Scans";
const MAX_BODY_BYTES = 500 * 1024; // 500 KB limit per contract spec

function defaultAdapterFactory(modelId: string, env: Env): VisionProviderAdapter {
  const provider = env.ACTIVE_PROVIDER ?? "gemini";
  if (provider === "openai") {
    return createOpenAIVisionAdapter({
      apiKey: env.OPENAI_API_KEY ?? "",
      gateway: getGatewayRouting(env, "openai"),
      modelId,
    });
  }
  return createGeminiVisionAdapter({
    apiKey: env.GEMINI_API_KEY ?? "",
    gateway: getGatewayRouting(env, "google"),
    modelId,
  });
}

function resolveQuotaStore(env: Env, customStore?: QuotaStore): QuotaStore {
  if (customStore) {
    return customStore;
  }
  if (env.POMONA_QUOTA_KV) {
    return createKvQuotaStore(env.POMONA_QUOTA_KV);
  }
  return createInMemoryQuotaStore();
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1"
  );
}

// Deterministic seasonality enrichment shared by the scan and deep-scan endpoints —
// a single dataset source (contract seasonality data), never part of an LLM prompt.
function deterministicSeasonality(
  produce: { type?: string | null; displayName?: string | null } | null,
  cf: { country?: string; latitude?: string } | undefined,
  locale: string
): SeasonalityInfo | null {
  if (!produce || !(produce.type || produce.displayName)) return null;
  const regionInput = {
    cfCountry: cf?.country,
    cfLatitude: cf?.latitude,
    locale,
  };
  const currentMonth = new Date().getUTCMonth() + 1;
  let seasonality: SeasonalityInfo | null = null;
  if (produce.type) {
    seasonality = lookupProduceSeasonality(produce.type, regionInput, currentMonth, isSupportedLocale(locale) ? locale : "en-GB");
  }
  if (!seasonality && produce.displayName) {
    seasonality = lookupProduceSeasonality(produce.displayName, regionInput, currentMonth, isSupportedLocale(locale) ? locale : "en-GB");
  }
  return seasonality;
}

function resolveAiGatewayConfig(env: Env): { id: string; token?: string } | undefined {
  return env.LOCAL_CLEF_TEST !== "true" && env.AI_GATEWAY_ID
    ? { id: env.AI_GATEWAY_ID, token: env.AI_GATEWAY_TOKEN }
    : undefined;
}

function resolveNormalizedVisionAdapter(
  modelId: string,
  env: Env,
  customFactory?: (modelId: string, env: Env) => VisionAdapterLike
): VisionProviderAdapter {
  const factory = customFactory ?? defaultAdapterFactory;
  const adapter = factory(modelId, env);
  return {
    providerId: adapter.providerId,
    modelId: adapter.modelId,
    async analyzeProduce(input, signal) {
      const res: any = await adapter.analyzeProduce(input, signal);
      if (res && "rawOutput" in res && !("object" in res)) {
        return {
          object: res.rawOutput,
          usage: res.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      return res;
    },
  };
}

function isUpstreamRateLimited(err: unknown): boolean {
  const status = (err as any)?.statusCode ?? (err as any)?.status;
  const msg = String((err as any)?.message || "").toLowerCase();
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("resource has been exhausted")
  );
}

function enrichWithSeasonality<T extends { produce: { type?: string | null; displayName?: string | null } | null }>(
  response: T,
  req: Request,
  locale: string,
  stage?: string
): T & { seasonality: SeasonalityInfo | null } {
  const cf = (req as { cf?: { country?: string; latitude?: string } }).cf;
  const seasonality = deterministicSeasonality(response.produce, cf, locale);
  console.log(
    `[proxy:seasonality]${stage ? ` stage=${stage}` : ""} produce=${JSON.stringify(response.produce)}, seasonality=${seasonality ? `${seasonality.produceSlug} (${seasonality.status})` : "null"}`
  );
  return { ...response, seasonality };
}

export function createProxyApp(deps: CreateProxyAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const requestTracing = async (c: any, next: () => Promise<void>) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("X-Pomona-Request-Id", requestId);
    const startedAt = Date.now();
    await traceStage(deps.tracing, "scan.request", { requestId }, async span => {
      try {
        await next();
        const response = await c.res.clone().json().catch(() => null);
        traceResponse(span, "scan", response);
        span?.setAttributes({ "http.status": c.res.status });
        logScanResponse("scan_response", { requestId }, response);
        if (c.get("gradingStarted") && c.get("gateDecision")) {
          const gateDecision = c.get("gateDecision");
          const flowStage = c.get("flowStage") ?? (c.req.path.includes("deep-scan") ? "deep-scan" : "scan");
          const status = typeof response?.status === "string" ? response.status : "analysis_failed";
          const scanClefBlockStatuses = new Set(["no_produce", "unclear_photo", "multiple_types", "single_produce", "analysis_failed"]);
          const deepScanClefBlockStatuses = new Set(["no_produce", "unclear_photo", "analysis_failed"]);
          const isScan = flowStage === "scan";
          const relevantStatuses = isScan ? scanClefBlockStatuses : deepScanClefBlockStatuses;
          const mismatch = gateDecision === "pass_to_grading" && relevantStatuses.has(status);

          span?.setAttributes({
            "flow.gate_decision": gateDecision,
            "flow.grading_status": status,
            "flow.clef_pass_gemini_non_ok": mismatch,
            ...(isScan
              ? { "flow.clef_pass_gemini_blocked_scan": mismatch }
              : { "flow.clef_pass_gemini_blocked_deep_scan": mismatch }),
          });

          console.log(JSON.stringify({
            event: "gate_grading_outcome",
            requestId,
            flowStage,
            gateDecision,
            gradingStatus: status,
            clefPassGeminiNonOk: mismatch,
            nonOkValue: mismatch ? 1 : 0,
            ...(isScan
              ? { clefPassGeminiBlockedScan: mismatch, scanBlockedValue: mismatch ? 1 : 0 }
              : { clefPassGeminiBlockedDeepScan: mismatch, deepScanBlockedValue: mismatch ? 1 : 0 }),
          }));
        }
      } finally {
        console.log(JSON.stringify({ event: "scan_complete", requestId,
          durationMs: Date.now() - startedAt, httpStatus: c.res.status }));
      }
    });
  };
  app.use("/api/v1/scan", requestTracing);
  app.use("/api/v1/deep-scan", requestTracing);

  // CORS middleware: allow web client origins and expose custom headers
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      allowHeaders: ["Content-Type", DEVICE_TOKEN_HEADER, "Cookie", "X-Pomona-Quota-Override"],
      exposeHeaders: [DEVICE_TOKEN_HEADER, REMAINING_SCANS_HEADER, "X-Pomona-Request-Id"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    })
  );

  // Set security and permissions policy headers
  app.use("*", async (c, next) => {
    await next();
    c.header("Permissions-Policy", "camera=(self), microphone=()");
  });


  app.use(
    "/api/v1/scan",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        console.warn("[proxy] Request body exceeded size limit:", c.req.header("content-length"));
        return c.json({ error: "Request body too large. Maximum size is 500 KB." }, 413);
      },
    })
  );

  /**
   * Helper: extract or issue a verified device token.
   */
  async function resolveDeviceIdentity(
    c: any
  ): Promise<{ deviceId: string; token: string; isNew: boolean }> {
    const secret = c.env.COOKIE_SIGNING_SECRET || "default-dev-signing-secret-key-32";
    const headerToken = c.req.header(DEVICE_TOKEN_HEADER);
    const cookieToken = getCookie(c, DEVICE_TOKEN_COOKIE);
    const candidateToken = headerToken || cookieToken;

    if (candidateToken) {
      const verifiedId = await verifyDeviceToken(candidateToken, secret);
      if (verifiedId) {
        return { deviceId: verifiedId, token: candidateToken, isNew: false };
      }
    }

    // Generate new device token
    const newDeviceId = crypto.randomUUID();
    const newToken = await signDeviceToken(newDeviceId, secret);
    return { deviceId: newDeviceId, token: newToken, isNew: true };
  }

  function applyDeviceTokenHeaders(c: any, token: string) {
    c.header(DEVICE_TOKEN_HEADER, token);
    setCookie(c, DEVICE_TOKEN_COOKIE, token, {
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });
  }

  interface AuthenticatedDeviceContext {
    deviceId: string;
    token: string;
    ip: string;
    store: QuotaStore;
    quotaResult: Awaited<ReturnType<typeof checkQuotaAndSelectModel>>;
  }

  async function authenticateDeviceAndCheckQuota(
    c: any,
    defaultModel?: string
  ): Promise<AuthenticatedDeviceContext> {
    const { deviceId, token } = await resolveDeviceIdentity(c);
    applyDeviceTokenHeaders(c, token);

    const store = resolveQuotaStore(c.env, deps.quotaStore);
    const ip = getClientIp(c.req.raw);

    const parsedDeviceLimit = c.env.DEVICE_DAILY_LIMIT
      ? parseInt(c.env.DEVICE_DAILY_LIMIT, 10)
      : undefined;
    const quotaResult = await checkQuotaAndSelectModel(store, {
      deviceId,
      ip,
      defaultModel: defaultModel ?? c.env.DEFAULT_MODEL,
      deviceDailyLimit: Number.isFinite(parsedDeviceLimit) ? parsedDeviceLimit : undefined,
    });

    c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());

    return {
      deviceId,
      token,
      ip,
      store,
      quotaResult,
    };
  }

  /**
   * POST /api/v1/quota/override
   * Tester endpoint: override backend quota / remaining scans for this device only.
   */
  app.post("/api/v1/quota/override", async (c) => {
    const { deviceId, token } = await resolveDeviceIdentity(c);
    applyDeviceTokenHeaders(c, token);

    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      // Body is optional; query params also supported
    }

    const scansParam = c.req.query("scans") ?? body.remainingScans;
    const limitParam = c.req.query("limit") ?? body.deviceDailyLimit;
    const reset = c.req.query("reset") === "true" || body.reset === true;

    const store = resolveQuotaStore(c.env, deps.quotaStore);
    const dateStr = formatDateKey(new Date());

    if (reset) {
      await store.setDailyDeviceCount(deviceId, dateStr, 0);
      await store.setDeviceDailyLimit(deviceId, null);
    } else if (typeof scansParam !== "undefined" && scansParam !== null) {
      const parsedScans = typeof scansParam === "number" ? scansParam : parseInt(String(scansParam), 10);
      if (!isNaN(parsedScans) && parsedScans >= 0) {
        await store.setDeviceDailyLimit(deviceId, parsedScans);
        await store.setDailyDeviceCount(deviceId, dateStr, 0);
      }
    } else if (typeof limitParam !== "undefined" && limitParam !== null) {
      const parsedLimit = typeof limitParam === "number" ? limitParam : parseInt(String(limitParam), 10);
      if (!isNaN(parsedLimit) && parsedLimit >= 0) {
        await store.setDeviceDailyLimit(deviceId, parsedLimit);
      }
    }

    const customLimit = await store.getDeviceDailyLimit(deviceId);
    const defaultLimit = c.env.DEVICE_DAILY_LIMIT ? parseInt(c.env.DEVICE_DAILY_LIMIT, 10) : 10;
    const activeLimit = customLimit ?? defaultLimit;
    const deviceCount = await store.getDailyDeviceCount(deviceId, dateStr);
    const remainingDeviceScans = Math.max(0, activeLimit - deviceCount);

    c.header(REMAINING_SCANS_HEADER, remainingDeviceScans.toString());

    return c.json({
      success: true,
      deviceId,
      deviceLimit: activeLimit,
      remainingDeviceScans,
      isTesterOverride: customLimit !== null || deviceCount !== 0,
    });
  });

  /**
   * GET /api/v1/quota
   */
  app.get("/api/v1/quota", async (c) => {
    // Support query param ?scans=N or header for test override
    const overrideHeader = c.req.header("X-Pomona-Quota-Override");
    const queryScans = c.req.query("scans") ?? overrideHeader;
    if (typeof queryScans !== "undefined" && queryScans !== null) {
      const { deviceId, token } = await resolveDeviceIdentity(c);
      applyDeviceTokenHeaders(c, token);
      const parsed = parseInt(String(queryScans), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        const store = resolveQuotaStore(c.env, deps.quotaStore);
        const dateStr = formatDateKey(new Date());
        await store.setDeviceDailyLimit(deviceId, parsed);
        await store.setDailyDeviceCount(deviceId, dateStr, 0);
      }
    }

    const auth = await authenticateDeviceAndCheckQuota(c);

    const monthStr = formatMonthKey(new Date());
    const monthlySpend = await auth.store.getMonthlySpendMicroCents(monthStr);
    const budgetOpen = monthlySpend < MONTHLY_HARD_CAP_MICRO_CENTS;

    return c.json({
      remainingDeviceScans: auth.quotaResult.remainingDeviceScans,
      budgetOpen,
    });
  });

  const CAPTURE_STORAGE_TTL_SECONDS = 2592000; // 30 days (30 * 24 * 60 * 60 seconds)
  const scanStorageEnabled = (env: Env) => env.SCAN_STORAGE_ENABLED === "true" || env.DEEP_SCAN_STORAGE_ENABLED === "true";

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const clean = base64.replace(/^data:[^;]+;base64,/, "").trim();
    if (typeof Buffer !== "undefined") {
      return Buffer.from(clean, "base64");
    }
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const storeScanCapture = async (
    env: Env,
    request: ScanRequest,
    outcome: Record<string, unknown>
  ) => {
    if (!scanStorageEnabled(env) || (!env.POMONA_CAPTURES_BUCKET && !env.POMONA_QUOTA_KV)) return null;
    const requestId = outcome.requestId ?? request.sessionId;
    delete outcome.requestId;
    const key = `scan:${requestId}`;
    const storedAt = new Date().toISOString();
    const mimeType = request.imageMimeType || "image/jpeg";
    const imageBytes = base64ToUint8Array(request.imageBase64);

    const record = {
      key,
      requestId,
      sessionId: request.sessionId,
      round: request.round,
      locale: request.locale ?? "en-GB",
      mimeType,
      focusPolygon: request.focusPolygon ?? null,
      imageBase64: request.imageBase64,
      storedAt,
      outcome,
    };

    if (env.POMONA_CAPTURES_BUCKET) {
      try {
        const imageKey = `scans/${requestId}.jpg`;
        const metaKey = `scans/${requestId}.json`;
        await env.POMONA_CAPTURES_BUCKET.put(imageKey, imageBytes, {
          httpMetadata: { contentType: mimeType },
          customMetadata: {
            requestId: String(requestId),
            sessionId: String(request.sessionId),
            outcome: String(outcome.outcome ?? "unknown"),
            produce: String((outcome.produce as Record<string, string>)?.displayName ?? outcome.produce ?? "unknown"),
            storedAt,
          },
        });
        await env.POMONA_CAPTURES_BUCKET.put(metaKey, JSON.stringify(record), {
          httpMetadata: { contentType: "application/json" },
        });
        console.log(JSON.stringify({ event: "scan_stored_r2", requestId, imageKey, metaKey, bytes: imageBytes.byteLength }));
      } catch (err) {
        console.warn("[proxy] scan R2 storage failed:", err instanceof Error ? err.message : err);
      }
    }

    if (env.POMONA_QUOTA_KV) {
      try {
        await env.POMONA_QUOTA_KV.put(key, JSON.stringify(record), {
          expirationTtl: CAPTURE_STORAGE_TTL_SECONDS,
        });
        console.log(JSON.stringify({ event: "scan_stored", requestId, key, bytes: record.imageBase64.length }));
      } catch (error) {
        console.warn("[proxy] scan capture storing failed:", error instanceof Error ? error.message : error);
      }
    }

    return key;
  };

  /**
   * POST /api/v1/scan
   */
  app.post("/api/v1/scan", async (c) => {
    const auth = await authenticateDeviceAndCheckQuota(c);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch (err: any) {
      console.warn("[proxy] Failed to parse JSON body:", err?.message);
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Auto-heal oversized focusPolygons (>40 points) so clients drawing high-density loops are never rejected
    if (rawBody && typeof rawBody === "object" && Array.isArray((rawBody as any).focusPolygon)) {
      const poly = (rawBody as any).focusPolygon;
      if (poly.length > 40) {
        console.log(`[proxy] Auto-downsampling oversized focusPolygon from ${poly.length} to 32 points`);
        const step = (poly.length - 1) / 31;
        const sampled: any[] = [];
        for (let i = 0; i < 31; i++) {
          sampled.push(poly[Math.round(i * step)]);
        }
        sampled.push(poly[poly.length - 1]);
        (rawBody as any).focusPolygon = sampled;
      }
    }

    const parseResult = ScanRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.warn(
        "[proxy] ScanRequestSchema validation failed:",
        JSON.stringify(parseResult.error.errors)
      );
      return c.json(
        {
          error: "Invalid scan request",
          details: parseResult.error.errors,
        },
        400
      );
    }

    const scanRequest: ScanRequest = parseResult.data;
    const requestId = c.get("requestId");
    c.set("flowStage", "scan");
    console.log(JSON.stringify({ event: "scan_received", requestId, sessionId: scanRequest.sessionId,
      round: scanRequest.round, mimeType: scanRequest.imageMimeType, imagePayloadCharacters: scanRequest.imageBase64.length,
      selectionPresent: !!scanRequest.focusPolygon }));
    console.log(
      `[proxy] Scan request valid: round ${scanRequest.round}, mime: ${scanRequest.imageMimeType}, base64 length: ${scanRequest.imageBase64.length} chars, focusPolygon: ${scanRequest.focusPolygon ? `${scanRequest.focusPolygon.length} pts` : "null"}`
    );
    const store = auth.store;
    const ip = auth.ip;
    const deviceId = auth.deviceId;
    const quotaResult = auth.quotaResult;

    const promptVersion = c.env.ACTIVE_PROMPT_VERSION || "v1";

    if (!quotaResult.allowed) {
      c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());
      const rateLimitedResponse: ScanResponse = {
        schemaVersion: "1.0",
        promptVersion,
        modelId: "quota-gate",
        round: scanRequest.round,
        status: "rate_limited",
        message: quotaResult.message,
        produce: null,
        candidates: [],
        verdict: null,
        followUp: null,
        afterPurchase: null,
      };
      return c.json(rateLimitedResponse, 200);
    }

    let modelId = quotaResult.modelId;
    let pendingGateSpend = 0;
    const recordGateSpend = async () => {
      if (!pendingGateSpend) return;
      const spend = pendingGateSpend;
      pendingGateSpend = 0;
      await store.incrementMonthlySpendMicroCents(formatMonthKey(new Date()), spend);
    };
    if (c.env.VISION_GATE_ENABLED === "true" && scanRequest.round === 1) {
      const startedAt = Date.now();
      let receivedGateOutput = false;
      if (!c.env.AI) {
        c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());
        return c.json(visibilityGateResponse("analysis_failed", scanRequest, promptVersion), 200);
      }
      try {
        const gate = await traceStage(deps.tracing, "scan.clef", {
          requestId, model: VISIBILITY_GATE_MODEL, "gate.timeout_ms": 3000, "gate.threshold": VISIBILITY_GATE_THRESHOLD,
          "image.payload_characters": scanRequest.imageBase64.length,
          "image.selection_present": !!scanRequest.focusPolygon,
        }, async span => {
          try {
            const result = await runVisibilityGate(c.env.AI!, scanRequest, requestId, resolveAiGatewayConfig(c.env));
            span?.setAttributes({ "gate.decision": result.status ?? "pass_to_grading",
              "gate.scores": JSON.stringify(result.scores),
              "gate.usage_known": result.usage !== null, "gate.timed_out": false,
              ...(result.usage ? { "tokens.input": result.usage.promptTokens, "tokens.output": result.usage.completionTokens } : {}) });
            console.log(JSON.stringify({ event: "gate_usage", requestId, sessionId: scanRequest.sessionId,
              model: VISIBILITY_GATE_MODEL, durationMs: Date.now() - startedAt,
              status: result.status ?? "pass_to_grading", scores: result.scores, threshold: VISIBILITY_GATE_THRESHOLD, usage: result.usage }));
            return result;
          } catch (error) {
            const outcome = gateDenialStatus(error) ?? "pass_to_grading";
            const timedOut = error instanceof Error && error.name === "TimeoutError";
            span?.setAttributes({ "gate.decision": outcome, "gate.timed_out": timedOut });
            console.log(JSON.stringify({ event: "gate_failure", requestId, model: VISIBILITY_GATE_MODEL,
              durationMs: Date.now() - startedAt, outcome, timedOut, timeoutMs: 3000,
              errorType: error instanceof Error ? error.name : "UnknownError", usage: null }));
            throw error;
          }
        });
        receivedGateOutput = true;
        c.set("gateDecision", gate.scores ? gate.status ?? "pass_to_grading" : "invalid_output_fallback");
        if (gate.usage) {
          pendingGateSpend = calculateTokenSpendMicroCents(VISIBILITY_GATE_MODEL, gate.usage);
        }
        if (gate.status) {
          await recordGateSpend();
          await storeScanCapture(c.env, scanRequest, {
            requestId,
            outcome: "gate_denied",
            gateStatus: gate.status,
          });
          c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());
          return c.json(visibilityGateResponse(gate.status, scanRequest, promptVersion), 200);
        }
        const parsedLimit = c.env.DEVICE_DAILY_LIMIT ? parseInt(c.env.DEVICE_DAILY_LIMIT, 10) : undefined;
        const afterGate = await checkQuotaAndSelectModel(store, { deviceId, ip, defaultModel: modelId, pendingSpendMicroCents: pendingGateSpend,
          deviceDailyLimit: Number.isFinite(parsedLimit) ? parsedLimit : undefined });
        if (!afterGate.allowed) {
          await recordGateSpend();
          await storeScanCapture(c.env, scanRequest, {
            requestId,
            outcome: "rate_limited",
          });
          c.header(REMAINING_SCANS_HEADER, afterGate.remainingDeviceScans.toString());
          return c.json(visibilityGateResponse("rate_limited", scanRequest, promptVersion), 200);
        }
        modelId = afterGate.modelId;
      } catch (error) {
        await recordGateSpend();
        const denial = receivedGateOutput ? "analysis_failed" : gateDenialStatus(error);
        if (receivedGateOutput) console.log(JSON.stringify({ event: "gate_accounting_failure", requestId,
          model: VISIBILITY_GATE_MODEL, outcome: "analysis_failed", usage: null }));
        if (!denial) c.set("gateDecision", "error_fallback");
        if (denial) {
          await storeScanCapture(c.env, scanRequest, {
            requestId,
            outcome: "gate_denied",
            gateStatus: denial,
          });
          c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());
          return c.json(visibilityGateResponse(denial, scanRequest, promptVersion), 200);
        }
      }
    }
    try {
      const adapter = resolveNormalizedVisionAdapter(modelId, c.env, deps.adapterFactory);
      const promptConfig = getPromptConfig(promptVersion);

      c.set("gradingStarted", adapter.providerId === "google");
      const scanOutcome = await runVerifiedVisionScan(
        scanRequest,
        adapter,
        promptConfig,
        undefined,
        requestId,
        deps.tracing
      );

      console.log(
        `[proxy] Scan outcome: status=${scanOutcome.response.status}, candidates=${JSON.stringify(
          scanOutcome.response.candidates?.map((c) => ({ id: c.id, box: c.box, score: c.score }))
        )}`
      );

      const repairNeeded = scanOutcome.attempts > 1;
      console.log(JSON.stringify({
        event: "scan_usage", requestId, sessionId: scanRequest.sessionId, round: scanRequest.round,
        provider: adapter.providerId, model: modelId, promptVersion: promptConfig.version,
        attempts: scanOutcome.attempts, repairNeeded, repairNeededValue: repairNeeded ? 1 : 0,
        status: scanOutcome.response.status, usage: scanOutcome.usage,
      }));

      const gateSpend = pendingGateSpend;
      pendingGateSpend = 0;
      // One monthly KV write for both models; the pre-grading check includes pending gate spend.
      const recordResult = await recordScanOutcome(store, {
        deviceId,
        ip,
        modelId,
        usage: scanOutcome.usage,
        status: scanOutcome.response.status,
        additionalSpendMicroCents: gateSpend,
      });

      c.header(REMAINING_SCANS_HEADER, recordResult.remainingDeviceScans.toString());

      await storeScanCapture(c.env, scanRequest, {
        requestId,
        outcome: "graded",
        status: scanOutcome.response.status,
        attempts: scanOutcome.attempts,
        provider: adapter.providerId,
        model: modelId,
        produce: scanOutcome.response.produce?.displayName ?? null,
        candidatesCount: scanOutcome.response.candidates?.length ?? 0,
        verdict: scanOutcome.response.verdict?.headline ?? null,
      });

      return c.json(enrichWithSeasonality(scanOutcome.response, c.req.raw, scanRequest.locale) satisfies ScanResponse, 200);

    } catch (err: any) {
      await recordGateSpend();
      await storeScanCapture(c.env, scanRequest, {
        requestId,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      const is429 = isUpstreamRateLimited(err);

      if (is429) {
        c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());
        const rateLimitedResponse: ScanResponse = {
          schemaVersion: "1.0",
          promptVersion,
          modelId,
          round: scanRequest.round,
          status: "rate_limited",
          message:
            "AI provider capacity currently exhausted. Please try again in a few moments.",
          produce: null,
          candidates: [],
          verdict: null,
          followUp: null,
          afterPurchase: null,
        };
        return c.json(rateLimitedResponse, 200);
      }

      // Other unexpected failure: return analysis_failed
      c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());
      const failedResponse: ScanResponse = {
        schemaVersion: "1.0",
        promptVersion,
        modelId,
        round: scanRequest.round,
        status: "analysis_failed",
        message: err instanceof Error ? err.message : "Internal analysis error",
        produce: null,
        candidates: [],
        verdict: null,
        followUp: null,
        afterPurchase: null,
      };
      return c.json(failedResponse, 200);
    }
  });

  app.get("/", (c) => c.env.ASSETS ? serveLocalizedDocument(c.req.raw, c.env.ASSETS) : c.notFound());
  app.get("/index.html", (c) => c.env.ASSETS ? serveLocalizedDocument(c.req.raw, c.env.ASSETS) : c.notFound());
  /**
   * POST /api/v1/deep-scan — guided multi-angle capture of a single fruit.
   * Free during MVP: no device quota consumption, no budget charge
   * (TODO: add deep-scan pricing to MODEL_PRICING before charging).
   */
  const DEEP_SCAN_BODY_BYTES = 1_048_576;
  const deepScanStorageEnabled = (env: Env) => env.DEEP_SCAN_STORAGE_ENABLED === "true";

  const storeDeepScanCapture = async (
    env: Env,
    request: DeepScanRequest,
    outcome: Record<string, unknown>
  ) => {
    if (!deepScanStorageEnabled(env) || (!env.POMONA_CAPTURES_BUCKET && !env.POMONA_QUOTA_KV)) return null;
    const requestId = outcome.requestId ?? request.sessionId;
    delete outcome.requestId;
    const key = `deep-scan:${requestId}`;
    const storedAt = new Date().toISOString();
    const mimeType = request.imageMimeType || "image/jpeg";
    const imageBytes = base64ToUint8Array(request.imageBase64);

    const record = {
      key,
      requestId,
      sessionId: request.sessionId,
      locale: request.locale,
      mimeType,
      sampleCount: request.sampleCount,
      compositeImageBase64: request.imageBase64,
      storedAt,
      outcome,
    };

    if (env.POMONA_CAPTURES_BUCKET) {
      try {
        const imageKey = `deep-scans/${requestId}.jpg`;
        const metaKey = `deep-scans/${requestId}.json`;
        await env.POMONA_CAPTURES_BUCKET.put(imageKey, imageBytes, {
          httpMetadata: { contentType: mimeType },
          customMetadata: {
            requestId: String(requestId),
            sessionId: String(request.sessionId),
            sampleCount: String(request.sampleCount),
            outcome: String(outcome.outcome ?? "unknown"),
            produce: String((outcome.produce as Record<string, string>)?.displayName ?? outcome.produce ?? "unknown"),
            storedAt,
          },
        });
        await env.POMONA_CAPTURES_BUCKET.put(metaKey, JSON.stringify(record), {
          httpMetadata: { contentType: "application/json" },
        });
        console.log(JSON.stringify({ event: "deep_scan_stored_r2", requestId, imageKey, metaKey, bytes: imageBytes.byteLength }));
      } catch (err) {
        console.warn("[proxy] deep-scan R2 storage failed:", err instanceof Error ? err.message : err);
      }
    }

    if (env.POMONA_QUOTA_KV) {
      try {
        await env.POMONA_QUOTA_KV.put(key, JSON.stringify(record), {
          expirationTtl: CAPTURE_STORAGE_TTL_SECONDS,
        });
        console.log(JSON.stringify({ event: "deep_scan_stored", requestId, key, bytes: record.compositeImageBase64.length }));
      } catch (error) {
        console.warn("[proxy] deep-scan capture storing failed:", error instanceof Error ? error.message : error);
      }
    }
    return key;
  };
  const DEEP_SCAN_PROMPT_VERSION = "deep_scan_v1";

  app.use(
    "/api/v1/deep-scan",
    bodyLimit({
      maxSize: DEEP_SCAN_BODY_BYTES,
      onError: (c) => {
        console.warn("[proxy] Deep-scan body exceeded size limit:", c.req.header("content-length"));
        const locale = resolveDisplayLocale(getCookie(c, LOCALE_COOKIE), c.req.header("accept-language"));
        return c.json(
          { status: "analysis_failed", message: translateShared(locale, "gate.tooLarge") },
          413
        );
      },
    })
  );

  app.post("/api/v1/deep-scan", async (c) => {
    const auth = await authenticateDeviceAndCheckQuota(c);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parseResult = DeepScanRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.warn("[proxy] DeepScanRequestSchema validation failed:", JSON.stringify(parseResult.error.errors));
      return c.json({ error: "Invalid deep scan request", details: parseResult.error.errors }, 400);
    }
    const deepScanRequest = parseResult.data;
    const requestId = c.get("requestId");
    c.set("flowStage", "deep-scan");
    console.log(JSON.stringify({ event: "deep_scan_received", requestId,
      sessionId: deepScanRequest.sessionId, mimeType: deepScanRequest.imageMimeType,
      sampleCount: deepScanRequest.sampleCount, imagePayloadCharacters: deepScanRequest.imageBase64.length }));

    if (!auth.quotaResult.allowed) {
      return c.json(deepScanGateResponse("rate_limited", deepScanRequest.locale, DEEP_SCAN_PROMPT_VERSION), 200);
    }

    const gateEnabled = c.env.VISION_GATE_ENABLED === "true";

    if (gateEnabled) {
      if (!c.env.AI) {
        return c.json(deepScanGateResponse("analysis_failed", deepScanRequest.locale, DEEP_SCAN_PROMPT_VERSION), 200);
      }
      const startedAt = Date.now();
      try {
        const gate = await traceStage(deps.tracing, "scan.clef", {
          requestId, model: VISIBILITY_GATE_MODEL, "gate.timeout_ms": 3000, "gate.threshold": VISIBILITY_GATE_THRESHOLD,
          "gate.stage": "deep-scan", stage: "deep-scan",
          "image.payload_characters": deepScanRequest.imageBase64.length,
          "image.selection_present": false,
        }, async span => {
          try {
            const result = await runDeepScanVisibilityGate(
              c.env.AI!, deepScanRequest.imageBase64, deepScanRequest.imageMimeType, requestId,
              resolveAiGatewayConfig(c.env)
            );
            span?.setAttributes({ "gate.decision": result.status ?? "pass_to_grading",
              "gate.scores": JSON.stringify(result.scores), "gate.usage_known": result.usage !== null, "gate.timed_out": false,
              ...(result.usage ? { "tokens.input": result.usage.promptTokens, "tokens.output": result.usage.completionTokens } : {}) });
            console.log(JSON.stringify({ event: "gate_usage", requestId, sessionId: deepScanRequest.sessionId,
              model: VISIBILITY_GATE_MODEL, stage: "deep-scan", durationMs: Date.now() - startedAt,
              status: result.status ?? "pass_to_grading", scores: result.scores, threshold: VISIBILITY_GATE_THRESHOLD, usage: result.usage }));
            return result;
          } catch (error) {
            const outcome = gateDenialStatus(error) ?? "pass_to_grading";
            const timedOut = error instanceof Error && error.name === "TimeoutError";
            span?.setAttributes({ "gate.decision": outcome, "gate.timed_out": timedOut });
            console.log(JSON.stringify({ event: "gate_failure", requestId, model: VISIBILITY_GATE_MODEL, stage: "deep-scan",
              durationMs: Date.now() - startedAt, outcome, timedOut, timeoutMs: 3000,
              errorType: error instanceof Error ? error.name : "UnknownError", usage: null }));
            throw error;
          }
        });
        c.set("gateDecision", gate.scores ? gate.status ?? "pass_to_grading" : "invalid_output_fallback");
        // Timeline below skips gate token spend on purpose: deep scan is free during MVP.
        if (gate.status) {
          const denialMessage = gate.status === "no_produce" ? "gate.noProduce" : "gate.unclearPhoto";
          console.log(JSON.stringify({ event: "deep_scan_gate_denial", requestId, stage: "deep-scan",
            gateStatus: gate.status, message: denialMessage }));
          await storeDeepScanCapture(c.env, deepScanRequest, {
            requestId,
            outcome: "gate_denied",
            gateStatus: gate.status,
          });
          return c.json(deepScanGateResponse(gate.status, deepScanRequest.locale, DEEP_SCAN_PROMPT_VERSION), 200);
        }
      } catch (error) {
        const denial = gateDenialStatus(error);
        c.set("gateDecision", denial ? "gate_denied" : "error_fallback");
        if (denial) {
          await storeDeepScanCapture(c.env, deepScanRequest, {
            requestId,
            outcome: "gate_denied",
            gateStatus: denial,
          });
          return c.json(deepScanGateResponse(denial === "rate_limited" ? "rate_limited" : "analysis_failed", deepScanRequest.locale, DEEP_SCAN_PROMPT_VERSION), 200);
        }
        // Clef timeout/errors fail open into Gemini, mirroring round-1.
        if (error instanceof Error && error.name === "TimeoutError") c.set("gateDecision", "timeout_fallback");
      }
    }

    try {
      const modelId = auth.quotaResult.modelId;
      const adapter = resolveNormalizedVisionAdapter(modelId, c.env, deps.adapterFactory);

      c.set("gradingStarted", adapter.providerId === "google");
      const scanOutcome = await runVerifiedDeepScan(
        deepScanRequest,
        adapter,
        DEEP_SCAN_PROMPT_VERSION,
        undefined,
        requestId,
        deps.tracing
      );
      const resultSizeBytes = Math.floor((deepScanRequest.imageBase64.length * 3) / 4);
      const repairNeeded = scanOutcome.attempts > 1;
      console.log(JSON.stringify({
        event: "scan_usage", requestId, sessionId: deepScanRequest.sessionId, stage: "deep_scan",
        provider: adapter.providerId, model: adapter.modelId, promptVersion: DEEP_SCAN_PROMPT_VERSION,
        attempts: scanOutcome.attempts, repairNeeded, repairNeededValue: repairNeeded ? 1 : 0,
        status: scanOutcome.response.status,
        framesSubmitted: deepScanRequest.sampleCount, compositeImageBytes: resultSizeBytes,
        usage: scanOutcome.usage,
      }));

      const recordResult = await recordScanOutcome(auth.store, {
        deviceId: auth.deviceId,
        ip: auth.ip,
        modelId,
        usage: scanOutcome.usage,
        status: scanOutcome.response.status,
      });

      c.header(REMAINING_SCANS_HEADER, recordResult.remainingDeviceScans.toString());

      await storeDeepScanCapture(c.env, deepScanRequest, {
        requestId,
        outcome: "graded",
        status: scanOutcome.response.status,
        attempts: scanOutcome.attempts,
        provider: adapter.providerId,
        model: adapter.modelId,
        produce: scanOutcome.response.produce?.displayName ?? null,
        ripeness: scanOutcome.response.ripeness?.state ?? null,
        confidence: scanOutcome.response.ripeness?.confidence ?? null,
      });

      return c.json(enrichWithSeasonality(scanOutcome.response, c.req.raw, deepScanRequest.locale, "deep-scan"), 200);
    } catch (err) {
      console.warn("[proxy] deep-scan analysis error:", err instanceof Error ? err.message : err);
      await storeDeepScanCapture(c.env, deepScanRequest, {
        requestId,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      if (isUpstreamRateLimited(err)) {
        return c.json(deepScanGateResponse("rate_limited", deepScanRequest.locale, DEEP_SCAN_PROMPT_VERSION), 200);
      }
      return c.json(deepScanGateResponse("analysis_failed", deepScanRequest.locale, DEEP_SCAN_PROMPT_VERSION), 200);
    }
  });

  app.get("/api/v1/scan/storage/:id", async (c) => {
    if (!scanStorageEnabled(c.env) || (!c.env.POMONA_CAPTURES_BUCKET && !c.env.POMONA_QUOTA_KV)) {
      return c.json({ error: "Scan storage is disabled" }, 404);
    }
    const id = c.req.param("id");
    if (c.env.POMONA_CAPTURES_BUCKET) {
      const obj = await c.env.POMONA_CAPTURES_BUCKET.get(`scans/${id}.json`);
      if (obj) {
        try {
          const data = await obj.json<Record<string, unknown>>();
          return c.json({ ...data, imageUrl: `/api/v1/scan/storage/${id}/image` }, 200);
        } catch {
          return c.json({ error: "Stored scan capture is unreadable" }, 500);
        }
      }
    }
    if (c.env.POMONA_QUOTA_KV) {
      const raw = await c.env.POMONA_QUOTA_KV.get(`scan:${id}`, "text");
      if (raw) {
        try {
          const data = JSON.parse(raw);
          return c.json({ ...data, imageUrl: `/api/v1/scan/storage/${id}/image` }, 200);
        } catch {
          return c.json({ error: "Stored scan capture is unreadable" }, 500);
        }
      }
    }
    return c.json({ error: "Scan capture not found" }, 404);
  });

  app.get("/api/v1/scan/storage/:id/image", async (c) => {
    if (!scanStorageEnabled(c.env) || (!c.env.POMONA_CAPTURES_BUCKET && !c.env.POMONA_QUOTA_KV)) {
      return c.json({ error: "Scan storage is disabled" }, 404);
    }
    const id = c.req.param("id");
    if (c.env.POMONA_CAPTURES_BUCKET) {
      const obj = await c.env.POMONA_CAPTURES_BUCKET.get(`scans/${id}.jpg`);
      if (obj) {
        return new Response(obj.body, {
          headers: {
            "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
    if (c.env.POMONA_QUOTA_KV) {
      const raw = await c.env.POMONA_QUOTA_KV.get(`scan:${id}`, "text");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const bytes = base64ToUint8Array(parsed.imageBase64);
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "Content-Type": parsed.mimeType || "image/jpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch {
          return c.json({ error: "Failed to decode stored image" }, 500);
        }
      }
    }
    return c.json({ error: "Scan capture not found" }, 404);
  });

  app.get("/api/v1/deep-scan/storage/:id", async (c) => {
    if (!deepScanStorageEnabled(c.env) || (!c.env.POMONA_CAPTURES_BUCKET && !c.env.POMONA_QUOTA_KV)) {
      return c.json({ error: "Deep-scan storage is disabled" }, 404);
    }
    const id = c.req.param("id");
    if (c.env.POMONA_CAPTURES_BUCKET) {
      const obj = await c.env.POMONA_CAPTURES_BUCKET.get(`deep-scans/${id}.json`);
      if (obj) {
        try {
          const data = await obj.json<Record<string, unknown>>();
          return c.json({ ...data, imageUrl: `/api/v1/deep-scan/storage/${id}/image` }, 200);
        } catch {
          return c.json({ error: "Stored deep-scan capture is unreadable" }, 500);
        }
      }
    }
    if (c.env.POMONA_QUOTA_KV) {
      const raw = await c.env.POMONA_QUOTA_KV.get(`deep-scan:${id}`, "text");
      if (raw) {
        try {
          const data = JSON.parse(raw);
          return c.json({ ...data, imageUrl: `/api/v1/deep-scan/storage/${id}/image` }, 200);
        } catch {
          return c.json({ error: "Stored deep-scan capture is unreadable" }, 500);
        }
      }
    }
    return c.json({ error: "Deep-scan capture not found" }, 404);
  });

  app.get("/api/v1/deep-scan/storage/:id/image", async (c) => {
    if (!deepScanStorageEnabled(c.env) || (!c.env.POMONA_CAPTURES_BUCKET && !c.env.POMONA_QUOTA_KV)) {
      return c.json({ error: "Deep-scan storage is disabled" }, 404);
    }
    const id = c.req.param("id");
    if (c.env.POMONA_CAPTURES_BUCKET) {
      const obj = await c.env.POMONA_CAPTURES_BUCKET.get(`deep-scans/${id}.jpg`);
      if (obj) {
        return new Response(obj.body, {
          headers: {
            "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
    if (c.env.POMONA_QUOTA_KV) {
      const raw = await c.env.POMONA_QUOTA_KV.get(`deep-scan:${id}`, "text");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const bytes = base64ToUint8Array(parsed.compositeImageBase64);
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "Content-Type": parsed.mimeType || "image/jpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch {
          return c.json({ error: "Failed to decode stored composite image" }, 500);
        }
      }
    }
    return c.json({ error: "Deep-scan capture not found" }, 404);
  });

  return app;
}

const app = createProxyApp();
export default app;
export { verifyAndResolveScanResponse } from "./verifier/verify-response";
export { createGeminiVisionAdapter } from "./adapters/gemini";
export { createOpenAIVisionAdapter } from "./adapters/openai";
export { getPromptConfig } from "./prompts";
export { v1PromptConfig } from "./prompts/v1";
export { deepScanPromptConfig, deepScanProviderSchema } from "./prompts/deep-scan";
export { getGatewayRouting } from "./adapters/gateway";
export { traceStage, traceResponse, logScanResponse } from "./observability/scan-trace";
export { createInMemoryQuotaStore, calculateTokenSpendMicroCents } from "./quota/budget";
export { buildVisibilityGateInput, resolveVisibilityGate, runVisibilityGate, VISIBILITY_GATE_MODEL, VISIBILITY_GATE_THRESHOLD } from "./gate/visibility";
export { buildDeepScanGateInput, resolveDeepScanGate } from "./gate/visibility";
export { verifyAndResolveDeepScanResponse } from "./verifier/verify-deep-scan";
export { runVerifiedDeepScan } from "./adapters/deep-scan";
export type { VisibilityGateRequest } from "./gate/visibility";

