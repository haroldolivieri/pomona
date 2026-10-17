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
