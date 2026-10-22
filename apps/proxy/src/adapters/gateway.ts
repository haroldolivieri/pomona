import type { Env } from "../types";
import type { ModelTrace } from "./types";

export interface GatewayRouting {
  baseURL: string;
  headers: Record<string, string>;
}

export function getGatewayRouting(env: Env, provider: "google" | "openai"): GatewayRouting | undefined {
  if (env.LOCAL_CLEF_TEST === "true") return undefined;
  const accountId = env.AI_GATEWAY_ACCOUNT_ID?.trim();
  const gatewayId = env.AI_GATEWAY_ID?.trim();
  if (!accountId && !gatewayId && !env.AI_GATEWAY_TOKEN) return undefined;
  if (!accountId || !gatewayId) throw new Error("AI_GATEWAY_ACCOUNT_ID and AI_GATEWAY_ID must be configured together");
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(gatewayId)) {
    throw new Error("Invalid AI Gateway account or gateway identifier");
  }
  const root = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}`;
  return {
    baseURL: provider === "google" ? `${root}/google-ai-studio/v1beta` : `${root}/openai`,
    headers: {
      "cf-aig-collect-log": "true",
      "cf-aig-collect-log-payload": "false",
      "cf-aig-skip-cache": "true",
      ...(env.AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}` } : {}),
    },
  };
}

export function getGatewayTraceHeaders(gateway: GatewayRouting | undefined, trace?: ModelTrace): Record<string, string> | undefined {
  if (!gateway || !trace) return undefined;
  const traceId = trace.requestId.replaceAll("-", "");
  return {
    "cf-aig-metadata": JSON.stringify({ app: "pomona", ...trace }),
    ...(/^[a-f0-9]{32}$/i.test(traceId) ? { "cf-aig-otel-trace-id": traceId } : {}),
  };
}
