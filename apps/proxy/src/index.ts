import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import {
  ScanRequestSchema,
  type ScanRequest,
  type ScanResponse,
} from "@pomona/contract";
import type { Env } from "./types";
import {
  type QuotaStore,
  createKvQuotaStore,
  createInMemoryQuotaStore,
  checkQuotaAndSelectModel,
  recordScanOutcome,
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
      allowHeaders: ["Content-Type", DEVICE_TOKEN_HEADER, "Cookie"],
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
   * GET /api/v1/quota
   */
  app.get("/api/v1/quota", async (c) => {
    const { deviceId, token } = await resolveDeviceIdentity(c);
    applyDeviceTokenHeaders(c, token);

    const store = resolveQuotaStore(c.env, deps.quotaStore);
    const ip = getClientIp(c.req.raw);

    const quotaResult = await checkQuotaAndSelectModel(store, {
      deviceId,
      ip,
      defaultModel: c.env.DEFAULT_MODEL,
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
      `[proxy] Scan request valid: round ${scanRequest.round}, mime: ${scanRequest.imageMimeType}, base64 length: ${scanRequest.imageBase64.length} chars`
    );
    const store = resolveQuotaStore(c.env, deps.quotaStore);
    const ip = getClientIp(c.req.raw);

    const quotaResult = await checkQuotaAndSelectModel(store, {
      deviceId,
      ip,
      defaultModel: c.env.DEFAULT_MODEL,
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
      return c.json(scanOutcome.response, 200);
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

