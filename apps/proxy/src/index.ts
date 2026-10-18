import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import {
  ScanRequestSchema,
  lookupProduceSeasonality,
  type ScanRequest,
  type ScanResponse,
  type SeasonalityInfo,
} from "@pomona/contract";
import type { Env } from "./types";
import {
  type QuotaStore,
  createKvQuotaStore,
  createInMemoryQuotaStore,
  checkQuotaAndSelectModel,
  recordScanOutcome,
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
import { createGeminiVisionAdapter } from "./adapters/gemini";
import { createOpenAIVisionAdapter } from "./adapters/openai";
import { verifyAndResolveScanResponse } from "./verifier/verify-response";

export interface VisionAdapterLike {
  readonly providerId: string;
  readonly modelId: string;
  analyzeProduce(
    input: any,
    signal?: AbortSignal
  ): Promise<{ object?: unknown; rawOutput?: unknown; usage?: any }>;
}

export interface CreateProxyAppOptions {
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
      modelId,
    });
  }
  return createGeminiVisionAdapter({
    apiKey: env.GEMINI_API_KEY ?? "",
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

export function createProxyApp(deps: CreateProxyAppOptions = {}): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // CORS middleware: allow web client origins and expose custom headers
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      allowHeaders: ["Content-Type", DEVICE_TOKEN_HEADER, "Cookie", "X-Pomona-Quota-Override"],
      exposeHeaders: [DEVICE_TOKEN_HEADER, REMAINING_SCANS_HEADER],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    })
  );

  // 500 KB request body limit with JSON error
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
    const { deviceId, token } = await resolveDeviceIdentity(c);
    applyDeviceTokenHeaders(c, token);

    const store = resolveQuotaStore(c.env, deps.quotaStore);
    const ip = getClientIp(c.req.raw);

    // Support query param ?scans=N or header for test override
    const overrideHeader = c.req.header("X-Pomona-Quota-Override");
    const queryScans = c.req.query("scans") ?? overrideHeader;
    if (typeof queryScans !== "undefined" && queryScans !== null) {
      const parsed = parseInt(String(queryScans), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        const dateStr = formatDateKey(new Date());
        await store.setDeviceDailyLimit(deviceId, parsed);
        await store.setDailyDeviceCount(deviceId, dateStr, 0);
      }
    }

    const parsedDeviceLimit = c.env.DEVICE_DAILY_LIMIT ? parseInt(c.env.DEVICE_DAILY_LIMIT, 10) : undefined;
    const quotaResult = await checkQuotaAndSelectModel(store, {
      deviceId,
      ip,
      defaultModel: c.env.DEFAULT_MODEL,
      deviceDailyLimit: Number.isFinite(parsedDeviceLimit) ? parsedDeviceLimit : undefined,
    });

    const monthStr = formatMonthKey(new Date());
    const monthlySpend = await store.getMonthlySpendMicroCents(monthStr);
    const budgetOpen = monthlySpend < MONTHLY_HARD_CAP_MICRO_CENTS;

    c.header(REMAINING_SCANS_HEADER, quotaResult.remainingDeviceScans.toString());

    return c.json({
      remainingDeviceScans: quotaResult.remainingDeviceScans,
      budgetOpen,
    });
  });

  /**
   * POST /api/v1/scan
   */
  app.post("/api/v1/scan", async (c) => {
    const { deviceId, token } = await resolveDeviceIdentity(c);
    applyDeviceTokenHeaders(c, token);

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
    console.log(
      `[proxy] Scan request valid: round ${scanRequest.round}, mime: ${scanRequest.imageMimeType}, base64 length: ${scanRequest.imageBase64.length} chars, focusPolygon: ${scanRequest.focusPolygon ? `${scanRequest.focusPolygon.length} pts` : "null"}`
    );
    const store = resolveQuotaStore(c.env, deps.quotaStore);
    const ip = getClientIp(c.req.raw);

    const parsedDeviceLimitPost = c.env.DEVICE_DAILY_LIMIT ? parseInt(c.env.DEVICE_DAILY_LIMIT, 10) : undefined;
    const quotaResult = await checkQuotaAndSelectModel(store, {
      deviceId,
      ip,
      defaultModel: c.env.DEFAULT_MODEL,
      deviceDailyLimit: Number.isFinite(parsedDeviceLimitPost) ? parsedDeviceLimitPost : undefined,
    });

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

    const modelId = quotaResult.modelId;
    const adapterFactory = deps.adapterFactory ?? defaultAdapterFactory;
    const adapter = adapterFactory(modelId, c.env);
    const promptConfig = getPromptConfig(promptVersion);

    // Adapters may have different analyzeProduce signatures (pure VisionProviderAdapter
    // returns { object, usage }, while test mocks might return { rawOutput, usage }).
    // We normalize to handle both.
    const normalizedAdapter: VisionProviderAdapter = {
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

    try {
      const scanOutcome = await runVerifiedVisionScan(
        scanRequest,
        normalizedAdapter,
        promptConfig
      );

      console.log(
        `[proxy] Scan outcome: status=${scanOutcome.response.status}, candidates=${JSON.stringify(
          scanOutcome.response.candidates?.map((c) => ({ id: c.id, box: c.box, score: c.score }))
        )}`
      );

      const recordResult = await recordScanOutcome(store, {
        deviceId,
        ip,
        modelId,
        usage: scanOutcome.usage,
        status: scanOutcome.response.status,
      });

      c.header(REMAINING_SCANS_HEADER, recordResult.remainingDeviceScans.toString());

      // Deterministic seasonality enrichment: never part of the LLM prompt or model schema.
      const baseResponse = scanOutcome.response;
      let seasonality: SeasonalityInfo | null = null;
      if (baseResponse.status === "ok" && (baseResponse.produce?.type || baseResponse.produce?.displayName)) {
        const cf = (c.req.raw as { cf?: { country?: string; latitude?: string } }).cf;
        const regionInput = {
          cfCountry: cf?.country,
          cfLatitude: cf?.latitude,
          locale: scanRequest.locale,
        };
        const currentMonth = new Date().getUTCMonth() + 1;
        if (baseResponse.produce?.type) {
          seasonality = lookupProduceSeasonality(baseResponse.produce.type, regionInput, currentMonth);
        }
        if (!seasonality && baseResponse.produce?.displayName) {
          seasonality = lookupProduceSeasonality(baseResponse.produce.displayName, regionInput, currentMonth);
        }
      }
      console.log(`[proxy:seasonality] produce=${JSON.stringify(baseResponse.produce)}, seasonality=${seasonality ? seasonality.produceSlug + ' (' + seasonality.status + ')' : 'null'}`);
      return c.json({ ...baseResponse, seasonality } satisfies ScanResponse, 200);

    } catch (err: any) {
      // Catch upstream provider rate limits (429) and translate to status: "rate_limited"
      const is429 =
        err?.statusCode === 429 ||
        err?.status === 429 ||
        String(err?.message || "").includes("429") ||
        String(err?.message || "").toLowerCase().includes("resource has been exhausted");

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

  return app;
}

const app = createProxyApp();
export default app;
export { verifyAndResolveScanResponse } from "./verifier/verify-response";
export { createGeminiVisionAdapter } from "./adapters/gemini";
export { createOpenAIVisionAdapter } from "./adapters/openai";
export { getPromptConfig } from "./prompts";
export { v1PromptConfig } from "./prompts/v1";

