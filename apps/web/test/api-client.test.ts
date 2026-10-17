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
});
