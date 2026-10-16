import { describe, expect, it } from "vitest";
import { signDeviceToken, verifyDeviceToken } from "../src/quota/token";
import { createInMemoryQuotaStore, checkQuotaAndSelectModel, recordScanOutcome, calculateTokenSpendMicroCents } from "../src/quota/budget";

describe("HMAC device token & $10/month budget circuit breaker", () => {
  it("signs and verifies a tamper-proof HMAC-SHA256 device token", async () => {
    const token = await signDeviceToken("dev-123", "super-secret");
    expect(await verifyDeviceToken(token, "super-secret")).toBe("dev-123");
    expect(await verifyDeviceToken(token + "x", "super-secret")).toBeNull();
    expect(await verifyDeviceToken("invalid.token", "super-secret")).toBeNull();
    expect(await verifyDeviceToken("malformed", "super-secret")).toBeNull();
    expect(await verifyDeviceToken(token, "wrong-secret")).toBeNull();
  });

  it("enforces 10 scans/day per device and does not decrement quota on analysis_failed", async () => {
    const store = createInMemoryQuotaStore();
    const now = new Date("2026-10-16T12:00:00Z");

    // Failed analysis does NOT burn quota
    await recordScanOutcome(store, {
      deviceId: "dev-1",
      ip: "1.2.3.4",
      modelId: "gemini-2.5-flash",
      usage: { promptTokens: 400, completionTokens: 100, totalTokens: 500 },
      status: "analysis_failed",
      now,
    });
    const afterFail = await checkQuotaAndSelectModel(store, { deviceId: "dev-1", ip: "1.2.3.4", now });
    expect(afterFail.allowed).toBe(true);
    if (afterFail.allowed) expect(afterFail.remainingDeviceScans).toBe(10);

    // 10 successful scans burn the daily device quota
    for (let i = 0; i < 10; i++) {
      await recordScanOutcome(store, {
        deviceId: "dev-1",
        ip: "1.2.3.4",
        modelId: "gemini-2.5-flash",
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        status: "ok",
        now,
      });
    }
    const eleventh = await checkQuotaAndSelectModel(store, { deviceId: "dev-1", ip: "1.2.3.4", now });
    expect(eleventh).toEqual({
      allowed: false,
      reason: "device_daily_limit",
      message: "You've used all 10 free scans for today. Come back tomorrow!",
      remainingDeviceScans: 0,
    });
  });

  it("enforces 20 scans/day per IP address", async () => {
    const store = createInMemoryQuotaStore();
    const now = new Date("2026-10-16T12:00:00Z");

    // Simulate 20 scans from distinct devices on the same IP
    for (let i = 0; i < 20; i++) {
      await recordScanOutcome(store, {
        deviceId: `dev-ip-${i}`,
        ip: "9.9.9.9",
        modelId: "gemini-2.5-flash",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        status: "ok",
        now,
      });
    }

    // Next scan from another new device on the same IP is blocked
    const blockedByIp = await checkQuotaAndSelectModel(store, {
      deviceId: "dev-ip-21",
      ip: "9.9.9.9",
      now,
    });
    expect(blockedByIp).toEqual({
      allowed: false,
      reason: "ip_daily_limit",
      message: "Daily scan limit reached for this network. Please try again tomorrow.",
      remainingDeviceScans: 10,
    });
  });

  it("downgrades model to gemini-2.5-flash-lite at $9.50 and trips the hard circuit breaker at $10.00", async () => {
    const store = createInMemoryQuotaStore();
    const now = new Date("2026-10-16T12:00:00Z");
    await store.setMonthlySpendMicroCents("2026-10", 960_000); // $9.60

    const softCap = await checkQuotaAndSelectModel(store, { deviceId: "dev-2", ip: "5.6.7.8", now });
    expect(softCap.allowed).toBe(true);
    if (softCap.allowed) expect(softCap.modelId).toBe("gemini-2.5-flash-lite");

    await store.setMonthlySpendMicroCents("2026-10", 1_000_000); // $10.00 hard cap
    const hardCap = await checkQuotaAndSelectModel(store, { deviceId: "dev-2", ip: "5.6.7.8", now });
    expect(hardCap.allowed).toBe(false);
    if (!hardCap.allowed) {
      expect(hardCap.reason).toBe("monthly_budget_cap");
      expect(hardCap.message).toContain("Monthly community scan budget reached");
      expect(hardCap.remainingDeviceScans).toBe(10);
    }
  });

  it("calculates model token spend in micro-cents and increments monthly spend", async () => {
    const spend = calculateTokenSpendMicroCents("gemini-2.5-flash", {
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
    });
    expect(spend).toBeGreaterThan(0);

    const store = createInMemoryQuotaStore();
    const now = new Date("2026-10-16T12:00:00Z");
    const res = await recordScanOutcome(store, {
      deviceId: "dev-calc",
      ip: "1.1.1.1",
      modelId: "gemini-2.5-flash",
      usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 },
      status: "ok",
      now,
    });
    expect(res.remainingDeviceScans).toBe(9);
    expect(res.monthlySpendMicroCents).toBe(spend);
  });
});
