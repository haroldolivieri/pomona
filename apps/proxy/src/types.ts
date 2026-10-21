import type { KVNamespaceLike } from "./quota/budget";

export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  POMONA_QUOTA_KV?: KVNamespaceLike;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  COOKIE_SIGNING_SECRET: string;
  ACTIVE_PROMPT_VERSION?: string;
  ACTIVE_PROVIDER?: string;
  DEFAULT_MODEL?: string;
  DEVICE_DAILY_LIMIT?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_TOKEN?: string;
}
