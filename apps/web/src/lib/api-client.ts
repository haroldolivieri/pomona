import type { ScanRequest, ScanResponse } from "@pomona/contract";

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
}

export function createFetchApiClient(baseUrl: string = ""): PomonaApiClient {
  return {
    async getQuota(): Promise<QuotaInfo> {
      const res = await fetch(`${baseUrl}/api/v1/quota`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch quota: ${res.statusText}`);
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
        throw new Error(`Failed to override quota: ${res.statusText}`);
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
        throw new Error(`Scan request failed (${res.status}): ${errorDetail || "Unknown error"}`);
      }
      const scanResponse: ScanResponse = await res.json();
      const remainingHeader = res.headers?.get?.("X-Pomona-Remaining-Scans");
      const parsedRemaining = remainingHeader ? parseInt(remainingHeader, 10) : 10;
      return {
        remainingScans: isNaN(parsedRemaining) ? 10 : parsedRemaining,
        response: scanResponse,
      };
    },
  };
}
