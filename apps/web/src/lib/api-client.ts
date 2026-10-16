import type { ScanRequest, ScanResponse } from "@pomona/contract";

export interface QuotaInfo {
  remainingDeviceScans: number;
  budgetOpen: boolean;
}

export interface PomonaApiClient {
  getQuota(): Promise<QuotaInfo>;
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
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch quota: ${res.statusText}`);
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
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw new Error(`Scan request failed: ${res.statusText}`);
      }
      return res.json();
    },
  };
}
