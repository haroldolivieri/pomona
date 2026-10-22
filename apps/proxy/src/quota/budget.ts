import type { ScanStatus } from "@pomona/contract";
import type { TokenUsage } from "../adapters/types";

/**
 * Cloudflare KV Namespace minimal subset required for quota tracking.
 */
export interface KVNamespaceLike {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface QuotaStore {
  getDailyDeviceCount(deviceId: string, dateStr: string): Promise<number>;
  incrementDailyDeviceCount(deviceId: string, dateStr: string): Promise<number>;
  setDailyDeviceCount(deviceId: string, dateStr: string, count: number): Promise<void>;
  getDailyIpCount(ip: string, dateStr: string): Promise<number>;
  incrementDailyIpCount(ip: string, dateStr: string): Promise<number>;
  getMonthlySpendMicroCents(monthStr: string): Promise<number>;
  incrementMonthlySpendMicroCents(monthStr: string, deltaMicroCents: number): Promise<number>;
  setMonthlySpendMicroCents(monthStr: string, microCents: number): Promise<void>;
  getDeviceDailyLimit(deviceId: string): Promise<number | null>;
  setDeviceDailyLimit(deviceId: string, limit: number | null): Promise<void>;
}

export const DEVICE_DAILY_LIMIT = 10;
export const IP_DAILY_LIMIT = 20;

// Pricing thresholds in micro-cents ($1.00 = 100,000 micro-cents)
// 1 micro-cent = $0.00001 = 1 / 100_000 USD
export const MICRO_CENTS_PER_USD = 100_000;
export const MONTHLY_SOFT_CAP_MICRO_CENTS = 950_000; // $9.50
export const MONTHLY_HARD_CAP_MICRO_CENTS = 1_000_000; // $10.00

export const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite";
export const DOWNGRADE_MODEL_ID = "gemini-3.1-flash-lite";

/**
 * Model token rates (in micro-cents per token):
 * 1 USD = 100,000 micro-cents.
 */
interface ModelPricing {
  promptMicroCentsPerToken: number;
  completionMicroCentsPerToken: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "@cf/cloudflare/clef-flash": {
    promptMicroCentsPerToken: 0.0038,
    completionMicroCentsPerToken: 0,
  },
  "gemini-3.8-flash": {
    promptMicroCentsPerToken: 0.0075,
    completionMicroCentsPerToken: 0.03,
  },
  "gemini-3.5-flash-lite": {
    promptMicroCentsPerToken: 0.00375,
    completionMicroCentsPerToken: 0.015,
  },
  "gemini-3.1-flash-lite": {
    promptMicroCentsPerToken: 0.003,
    completionMicroCentsPerToken: 0.012,
  },
  "gemini-2.5-flash": {
    promptMicroCentsPerToken: 0.0075,
    completionMicroCentsPerToken: 0.03,
  },
  "gemini-2.5-flash-lite": {
    promptMicroCentsPerToken: 0.00375,
    completionMicroCentsPerToken: 0.015,
  },
  "gpt-4o-mini": {
    promptMicroCentsPerToken: 0.015,
    completionMicroCentsPerToken: 0.06,
  },
};

/**
 * Calculates token spend in integer micro-cents for a given model and token usage.
 * Returns at least 1 micro-cent if tokens were consumed.
 */
export function calculateTokenSpendMicroCents(modelId: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING["gemini-3.8-flash"];
  const rawSpend =
    usage.promptTokens * pricing.promptMicroCentsPerToken +
    usage.completionTokens * pricing.completionMicroCentsPerToken;

  if (rawSpend > 0 && rawSpend < 1) {
    return 1;
  }
  return Math.round(rawSpend);
}

/**
 * Format date as YYYY-MM-DD for daily counters.
 */
export function formatDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Format date as YYYY-MM for monthly spend counters.
 */
export function formatMonthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function createInMemoryQuotaStore(): QuotaStore {
  const deviceCounts = new Map<string, number>();
  const deviceLimits = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  const monthlySpend = new Map<string, number>();

  return {
    async getDailyDeviceCount(deviceId: string, dateStr: string): Promise<number> {
      return deviceCounts.get(`${dateStr}:${deviceId}`) ?? 0;
    },
    async incrementDailyDeviceCount(deviceId: string, dateStr: string): Promise<number> {
      const key = `${dateStr}:${deviceId}`;
      const count = (deviceCounts.get(key) ?? 0) + 1;
      deviceCounts.set(key, count);
      return count;
    },
    async setDailyDeviceCount(deviceId: string, dateStr: string, count: number): Promise<void> {
      deviceCounts.set(`${dateStr}:${deviceId}`, Math.max(0, count));
    },
    async getDailyIpCount(ip: string, dateStr: string): Promise<number> {
      return ipCounts.get(`${dateStr}:${ip}`) ?? 0;
    },
    async incrementDailyIpCount(ip: string, dateStr: string): Promise<number> {
      const key = `${dateStr}:${ip}`;
      const count = (ipCounts.get(key) ?? 0) + 1;
      ipCounts.set(key, count);
      return count;
    },
    async getMonthlySpendMicroCents(monthStr: string): Promise<number> {
      return monthlySpend.get(`spend:${monthStr}`) ?? 0;
    },
    async incrementMonthlySpendMicroCents(monthStr: string, deltaMicroCents: number): Promise<number> {
      const key = `spend:${monthStr}`;
      const current = monthlySpend.get(key) ?? 0;
      const next = current + deltaMicroCents;
      monthlySpend.set(key, next);
      return next;
    },
    async setMonthlySpendMicroCents(monthStr: string, microCents: number): Promise<void> {
      monthlySpend.set(`spend:${monthStr}`, microCents);
    },
    async getDeviceDailyLimit(deviceId: string): Promise<number | null> {
      return deviceLimits.get(deviceId) ?? null;
    },
    async setDeviceDailyLimit(deviceId: string, limit: number | null): Promise<void> {
      if (limit === null) {
        deviceLimits.delete(deviceId);
      } else {
        deviceLimits.set(deviceId, Math.max(0, limit));
      }
    },
  };
}

/**
 * Cloudflare KV adapter for QuotaStore.
 * Daily counters expire after 48 hours (172,800 seconds).
 */
export function createKvQuotaStore(kv: KVNamespaceLike): QuotaStore {
  const DAILY_TTL_SECONDS = 48 * 3600;

  return {
    async getDailyDeviceCount(deviceId: string, dateStr: string): Promise<number> {
      const val = await kv.get(`device:${dateStr}:${deviceId}`);
      return val ? parseInt(val, 10) || 0 : 0;
    },
    async incrementDailyDeviceCount(deviceId: string, dateStr: string): Promise<number> {
      const key = `device:${dateStr}:${deviceId}`;
      const current = await this.getDailyDeviceCount(deviceId, dateStr);
      const next = current + 1;
      await kv.put(key, next.toString(), { expirationTtl: DAILY_TTL_SECONDS });
      return next;
    },
    async setDailyDeviceCount(deviceId: string, dateStr: string, count: number): Promise<void> {
      const key = `device:${dateStr}:${deviceId}`;
      await kv.put(key, Math.max(0, count).toString(), { expirationTtl: DAILY_TTL_SECONDS });
    },
    async getDailyIpCount(ip: string, dateStr: string): Promise<number> {
      const val = await kv.get(`ip:${dateStr}:${ip}`);
      return val ? parseInt(val, 10) || 0 : 0;
    },
    async incrementDailyIpCount(ip: string, dateStr: string): Promise<number> {
      const key = `ip:${dateStr}:${ip}`;
      const current = await this.getDailyIpCount(ip, dateStr);
      const next = current + 1;
      await kv.put(key, next.toString(), { expirationTtl: DAILY_TTL_SECONDS });
      return next;
    },
    async getMonthlySpendMicroCents(monthStr: string): Promise<number> {
      const val = await kv.get(`spend:${monthStr}`);
      return val ? parseInt(val, 10) || 0 : 0;
    },
    async incrementMonthlySpendMicroCents(monthStr: string, deltaMicroCents: number): Promise<number> {
      const key = `spend:${monthStr}`;
      const current = await this.getMonthlySpendMicroCents(monthStr);
      const next = current + deltaMicroCents;
      // Monthly spend persists across months without early expiration
      await kv.put(key, next.toString());
      return next;
    },
    async setMonthlySpendMicroCents(monthStr: string, microCents: number): Promise<void> {
      await kv.put(`spend:${monthStr}`, microCents.toString());
    },
    async getDeviceDailyLimit(deviceId: string): Promise<number | null> {
      const val = await kv.get(`limit:${deviceId}`);
      if (val === null || val === undefined || val === "") return null;
      const parsed = parseInt(val, 10);
      return Number.isFinite(parsed) ? parsed : null;
    },
    async setDeviceDailyLimit(deviceId: string, limit: number | null): Promise<void> {
      const key = `limit:${deviceId}`;
      if (limit === null) {
        if (typeof (kv as any).delete === "function") {
          await (kv as any).delete(key);
        } else {
          await kv.put(key, "", { expirationTtl: 1 });
        }
      } else {
        await kv.put(key, Math.max(0, limit).toString(), { expirationTtl: 7 * 86400 });
      }
    },
  };
}

export type CheckQuotaResult =
  | {
      allowed: true;
      modelId: string;
      remainingDeviceScans: number;
      monthlySpendMicroCents: number;
    }
  | {
      allowed: false;
      reason: "device_daily_limit" | "ip_daily_limit" | "monthly_budget_cap";
      message: string;
      remainingDeviceScans: number;
    };

/**
 * Checks all daily and monthly quota gates and determines the active vision model:
 * 1. Monthly Hard Cap ($10.00 / 1_000_000 micro-cents) -> rejected ("monthly_budget_cap")
 * 2. Daily Device Limit (10 scans/day default or custom tester override limit) -> rejected ("device_daily_limit")
 * 3. Daily IP Limit (20 scans/day) -> rejected ("ip_daily_limit", bypassed if tester override is set)
 * 4. Monthly Soft Cap ($9.50 / 950_000 micro-cents) -> downgrade to "gemini-2.5-flash-lite"
 */
export async function checkQuotaAndSelectModel(
  store: QuotaStore,
  params: {
    deviceId: string;
    ip: string;
    now?: Date;
    defaultModel?: string;
    deviceDailyLimit?: number;
    ipDailyLimit?: number;
    pendingSpendMicroCents?: number;
  }
): Promise<CheckQuotaResult> {
  const now = params.now ?? new Date();
  const dateStr = formatDateKey(now);
  const monthStr = formatMonthKey(now);
  const customLimit = await store.getDeviceDailyLimit(params.deviceId);
  const deviceLimit = customLimit ?? params.deviceDailyLimit ?? DEVICE_DAILY_LIMIT;
  const ipLimit = params.ipDailyLimit ?? IP_DAILY_LIMIT;

  const [deviceCount, ipCount, monthlySpend] = await Promise.all([
    store.getDailyDeviceCount(params.deviceId, dateStr),
    store.getDailyIpCount(params.ip, dateStr),
    store.getMonthlySpendMicroCents(monthStr),
  ]);

  const effectiveMonthlySpend = monthlySpend + (params.pendingSpendMicroCents ?? 0);
  const remainingDeviceScans = Math.max(0, deviceLimit - deviceCount);

  // Layer 3 hard circuit breaker: Monthly spend cap ($10.00)
  if (effectiveMonthlySpend >= MONTHLY_HARD_CAP_MICRO_CENTS) {
    return {
      allowed: false,
      reason: "monthly_budget_cap",
      message:
        "Monthly community scan budget reached. Free scans will resume on the 1st of next month.",
      remainingDeviceScans,
    };
  }

  // Daily device quota
  if (deviceCount >= deviceLimit) {
    return {
      allowed: false,
      reason: "device_daily_limit",
      message: `You've used all ${deviceLimit} free scans for today. Come back tomorrow!`,
      remainingDeviceScans: 0,
    };
  }

  // Daily IP quota (bypassed if device has an explicit tester override limit)
  if (customLimit === null && ipCount >= ipLimit) {
    return {
      allowed: false,
      reason: "ip_daily_limit",
      message: "Daily scan limit reached for this network. Please try again tomorrow.",
      remainingDeviceScans,
    };
  }

  // Monthly soft cap: Downgrade model at >= $9.50 (950_000 micro-cents)
  const defaultModel = params.defaultModel ?? DEFAULT_MODEL_ID;
  const modelId =
    effectiveMonthlySpend >= MONTHLY_SOFT_CAP_MICRO_CENTS ? DOWNGRADE_MODEL_ID : defaultModel;

  return {
    allowed: true,
    modelId,
    remainingDeviceScans,
    monthlySpendMicroCents: effectiveMonthlySpend,
  };
}

/**
 * Records the outcome of a scan.
 * - Only status === "ok" decrements daily device and IP quotas.
 * - Non-"ok" scans like "analysis_failed" do NOT burn daily quota.
 * - Spend is recorded from actual token usage regardless of status.
 */
export async function recordScanOutcome(
  store: QuotaStore,
  params: {
    deviceId: string;
    ip: string;
    modelId: string;
    usage: TokenUsage;
    status: ScanStatus;
    additionalSpendMicroCents?: number;
    now?: Date;
  }
): Promise<{ remainingDeviceScans: number; monthlySpendMicroCents: number }> {
  const now = params.now ?? new Date();
  const dateStr = formatDateKey(now);
  const monthStr = formatMonthKey(now);

  const deltaMicroCents = calculateTokenSpendMicroCents(params.modelId, params.usage) + (params.additionalSpendMicroCents ?? 0);

  const spendPromise =
    deltaMicroCents > 0
      ? store.incrementMonthlySpendMicroCents(monthStr, deltaMicroCents)
      : store.getMonthlySpendMicroCents(monthStr);

  const monthlySpendMicroCents = await spendPromise;
  let newDeviceCount: number;
  if (params.status === "ok") {
    const [dCount] = await Promise.all([
      store.incrementDailyDeviceCount(params.deviceId, dateStr),
      store.incrementDailyIpCount(params.ip, dateStr),
    ]);
    newDeviceCount = dCount;
  } else {
    newDeviceCount = await store.getDailyDeviceCount(params.deviceId, dateStr);
  }

  const customLimit = await store.getDeviceDailyLimit(params.deviceId);
  const activeLimit = customLimit ?? DEVICE_DAILY_LIMIT;
  const remainingDeviceScans = Math.max(0, activeLimit - newDeviceCount);

  return {
    remainingDeviceScans,
    monthlySpendMicroCents,
  };
}
