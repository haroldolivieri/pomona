import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockApiClient } from "../src/lib/mock-api-client";
import type { DeepScanRequest, DeepScanResponse } from "@pomona/contract";

const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", fakeLocalStorage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const dsRequest: DeepScanRequest = {
  schemaVersion: "1.0",
  sessionId: "5f0b8a2e-1c3d-4e5f-6a7b-8c9d0e1f2a3b",
  locale: "en-GB",
  imageBase64: "QUJD",
  imageMimeType: "image/webp",
  sampleCount: 25,
};

function withLocale(locale: string): DeepScanRequest {
  return { ...dsRequest, locale };
}

describe("createMockApiClient.submitDeepScan", () => {
  it("returns the confident verdict shape with no manual checks", async () => {
    const client = createMockApiClient({ deepScanLatencyMs: 0 });
    const response: DeepScanResponse = await client.submitDeepScan(dsRequest);
    expect(response.schemaVersion).toBe("1.0");
    expect(response.promptVersion).toBe("deep_scan_v1");
    expect(response.status).toBe("ok");
    expect(response.quality.sufficientVisualEvidence).toBe(true);
    expect(response.ripeness.state).not.toBe("unknown");
    expect(response.ripeness.confidence).toBeGreaterThanOrEqual(0.8);
    expect(response.manualChecks).toBeNull();
    expect(response.evidence.length).toBeGreaterThanOrEqual(1);
    expect(response.evidence.length).toBeLessThanOrEqual(6);
  });

  it("returns the same_side_only abstention with localized manual checks per locale", async () => {
    const force = (value: string | null) => {
      if (value === null) {
        localStorage.removeItem("pomona-force-ds-error");
      } else {
        localStorage.setItem("pomona-force-ds-error", value);
      }
    };
    const client = createMockApiClient({ deepScanLatencyMs: 0 });

    force("same_side");
    const en = await client.submitDeepScan(withLocale("en-GB"));
    expect(en.status).toBe("insufficient_evidence");
    expect(en.abstentionReason).toBe("same_side_only");
    expect(en.manualChecks?.length).toBe(2);
    const enChecks = en.manualChecks?.map((c) => `${c.trait}${c.how}${c.whatItMeans}`);
    const pt = await client.submitDeepScan(withLocale("pt-BR"));
    expect(pt.manualChecks?.length).toBe(2);
    const ptChecks = pt.manualChecks?.map((c) => `${c.trait}${c.how}${c.whatItMeans}`);
    expect(ptChecks).not.toEqual(enChecks);
    expect(ptChecks?.join("\n")).toMatch(/[\u00C0-\u024F]/); // accents → spot-check localisation

    force("no_produce");
    const denial = await client.submitDeepScan(dsRequest);
    expect(denial.status).toBe("insufficient_evidence");
    expect(denial.message?.length ?? 0).toBeGreaterThanOrEqual(8);

    force(null);
    const normal = await client.submitDeepScan(dsRequest);
    expect(normal.status).toBe("ok");
  });

  it("keeps the laser analysing stage visible for about 2s by default (debug demo pacing)", async () => {
    const client = createMockApiClient();
    const started = Date.now();
    await client.submitDeepScan(dsRequest);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
  });

  it("honours the pomona-mock-ds-latency override and the per-client option", async () => {
    const timed = createMockApiClient({ deepScanLatencyMs: 40 });
    const started = Date.now();
    await timed.submitDeepScan(dsRequest);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);

    fakeLocalStorage.setItem("pomona-mock-ds-latency", "0");
    const viaStorage = createMockApiClient();
    const started2 = Date.now();
    await viaStorage.submitDeepScan(dsRequest);
    expect(Date.now() - started2).toBeLessThan(500);
  });

  it("twins share the ApiClient interface", () => {
    const real = createMockApiClient() as unknown;
    expect(typeof (real as Record<string, unknown>).submitDeepScan).toBe("function");
    expect(typeof (real as Record<string, unknown>).submitScan).toBe("function");
  });
});
