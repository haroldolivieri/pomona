import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFetchApiClient } from "../src/lib/api-client";
import type { ScanRequest } from "@pomona/contract";

describe("createFetchApiClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const dummyRequest: ScanRequest = {
    schemaVersion: "1.0",
    sessionId: "12345678-1234-4234-8234-123456789abc",
    round: 1,
    locale: "en-GB",
    imageBase64: "dGVzdA==",
    imageMimeType: "image/jpeg",
    focusPolygon: null,
    followUpContext: null,
  };

  it("extracts error details from JSON response when scan fails with 413 or 400", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      statusText: "",
      json: async () => ({ error: "Request body too large. Maximum size is 500 KB." }),
      text: async () => JSON.stringify({ error: "Request body too large. Maximum size is 500 KB." }),
    });

    const client = createFetchApiClient("http://localhost:8787");

    await expect(client.submitScan(dummyRequest)).rejects.toThrow(
      "Scan request failed (413): Request body too large. Maximum size is 500 KB."
    );
  });

  it("extracts error details from plain text when json parsing fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "",
      json: async () => {
        throw new Error("Invalid JSON");
      },
      text: async () => "Bad Gateway Error from Upstream",
    });

    const client = createFetchApiClient("http://localhost:8787");

    await expect(client.submitScan(dummyRequest)).rejects.toThrow(
      "Scan request failed (502): Bad Gateway Error from Upstream"
    );
  });

  it("returns { remainingScans, response } on successful scan", async () => {
    const mockScanResponse = {
      schemaVersion: "1.0",
      promptVersion: "v1",
      modelId: "gemini-2.5-flash",
      round: 1,
      status: "ok",
      produce: { name: "Avocado", variety: "Hass" },
      candidates: [],
      verdict: null,
      followUp: null,
      afterPurchase: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (header: string) => (header === "X-Pomona-Remaining-Scans" ? "8" : null),
      },
      json: async () => mockScanResponse,
    });

    const client = createFetchApiClient("http://localhost:8787");
    const result = await client.submitScan(dummyRequest);

    expect(result.remainingScans).toBe(8);
    expect(result.response).toEqual(mockScanResponse);
    expect(result.response.status).toBe("ok");
  });
});

describe("createFetchApiClient.submitDeepScan", () => {
  const dummyDsRequest = {
    schemaVersion: "1.0" as const,
    sessionId: "5f0b8a2e-1c3d-4e5f-6a7b-8c9d0e1f2a3b",
    locale: "en-GB",
    imageBase64: "QUJD",
    imageMimeType: "image/webp" as const,
    sampleCount: 25,
  };

  const dsResponse = {
    schemaVersion: "1.0",
    promptVersion: "deep_scan_v1",
    modelId: "gemini-3.1-flash-lite",
    status: "ok",
    abstentionReason: null,
    message: null,
    produce: { type: "avocado", displayName: "Avocado", variety: null },
    ripeness: { state: "nearly_ripe", confidence: 0.85 },
    evidence: ["Tile 1: color lift"],
    quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
    manualChecks: null,
    recommendation: null,
  };

  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("posts the composite to /api/v1/deep-scan and returns { remainingScans, response }", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dsResponse,
      headers: { get: (name: string) => (name === "X-Pomona-Remaining-Scans" ? "8" : null) },
    });

    const client = createFetchApiClient("http://localhost:8787");
    const result = await client.submitDeepScan(dummyDsRequest);

    expect(result).toEqual({
      remainingScans: 8,
      response: dsResponse,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8787/api/v1/deep-scan");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual(dummyDsRequest);
  });

  it("surfaces non-2xx responses as ApiClientError without parsing quota", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 413, statusText: "Payload Too Large", json: async () => ({ message: "gate.tooLarge" }),
    });
    const client = createFetchApiClient("");
    await expect(client.submitDeepScan(dummyDsRequest)).rejects.toMatchObject({ status: 413 });
  });
});
