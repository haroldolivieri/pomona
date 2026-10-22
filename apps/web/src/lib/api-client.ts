import { uiCopy } from "../i18n/copy";
import type { ScanRequest, ScanResponse, DeepScanRequest, DeepScanResponse } from "@pomona/contract";

export class ApiClientError extends Error {
  readonly copyKey = "errors.analysisFailed";
  constructor(readonly status: number, detail: string) { super(detail); }
}

export interface QuotaInfo {
  remainingDeviceScans: number;
  budgetOpen: boolean;
}

export interface QuotaOverrideResult {
  success: boolean;
  deviceId: string;
  deviceLimit: number;
  remainingDeviceScans: number;
  isTesterOverride?: boolean;
}

export interface PomonaApiClient {
  getQuota(): Promise<QuotaInfo>;
  overrideQuota(
    params: { remainingScans?: number; deviceDailyLimit?: number; reset?: boolean } | number
  ): Promise<QuotaOverrideResult>;
  submitScan(request: ScanRequest): Promise<{
    remainingScans: number;
    response: ScanResponse;
  }>;
  submitDeepScan(request: DeepScanRequest): Promise<DeepScanResponse>;
}

export function createFetchApiClient(baseUrl: string = ""): PomonaApiClient {
  return {
    async getQuota(): Promise<QuotaInfo> {
      const res = await fetch(`${baseUrl}/api/v1/quota`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        throw new ApiClientError(res.status, uiCopy("copy.failedToFetchQuota", { value1: res.statusText }));
      }
      return res.json();
    },

    async overrideQuota(
      params: { remainingScans?: number; deviceDailyLimit?: number; reset?: boolean } | number
    ): Promise<QuotaOverrideResult> {
      const payload = typeof params === "number" ? { remainingScans: params } : params;
      const res = await fetch(`${baseUrl}/api/v1/quota/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new ApiClientError(res.status, uiCopy("copy.failedToOverrideQuota", { value1: res.statusText }));
      }
      return res.json();
    },

    async submitScan(request: ScanRequest): Promise<{
      remainingScans: number;
      response: ScanResponse;
    }> {
      const res = await fetch(`${baseUrl}/api/v1/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        let errorDetail = res.statusText || "";
        try {
          const errorJson = await res.json();
          errorDetail =
            errorJson.error ||
            errorJson.message ||
            (Array.isArray(errorJson.details) ? JSON.stringify(errorJson.details) : "") ||
            JSON.stringify(errorJson);
        } catch {
          try {
            const errorText = await res.text();
            if (errorText) errorDetail = errorText;
          } catch {
            // ignore
          }
        }
        console.error(`[api-client] Scan request failed (${res.status}): ${errorDetail}`);
        throw new ApiClientError(res.status, uiCopy("copy.scanRequestFailed", { value1: res.status, value2: errorDetail || uiCopy("errors.analysisFailed") }));
      }
      const scanResponse: ScanResponse = await res.json();
      const requestId = res.headers?.get?.("X-Pomona-Request-Id");
      if (requestId) console.log("[scan] trace", { requestId, sessionId: request.sessionId, round: request.round });
      const remainingHeader = res.headers?.get?.("X-Pomona-Remaining-Scans");
      const parsedRemaining = remainingHeader ? parseInt(remainingHeader, 10) : 10;
      return {
        remainingScans: isNaN(parsedRemaining) ? 10 : parsedRemaining,
        response: scanResponse,
      };
    },

    async submitDeepScan(request: DeepScanRequest): Promise<DeepScanResponse> {
      const res = await fetch(`${baseUrl}/api/v1/deep-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        let errorDetail = res.statusText || "";
        try {
          const errorJson = await res.json();
          errorDetail =
            errorJson.error ||
            errorJson.message ||
            (Array.isArray(errorJson.details) ? JSON.stringify(errorJson.details) : "") ||
            JSON.stringify(errorJson);
        } catch {
          try {
            const errorText = await res.text();
            if (errorText) errorDetail = errorText;
          } catch {
            // ignore
          }
        }
        console.error(`[api-client] Deep scan request failed (${res.status}): ${errorDetail}`);
        throw new ApiClientError(res.status, uiCopy("copy.scanRequestFailed", { value1: res.status, value2: errorDetail || uiCopy("errors.analysisFailed") }));
      }
      return res.json();
    },
  };
}
