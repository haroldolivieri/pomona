import type { KVNamespaceLike } from "./quota/budget";
import type { GateAiBinding } from "./gate/visibility";

export interface R2ObjectBodyLike {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
  };
  customMetadata?: Record<string, string>;
  size: number;
}

export interface R2PutOptionsLike {
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob | null,
    options?: R2PutOptionsLike
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  AI?: GateAiBinding;
  VISION_GATE_ENABLED?: string;
  DEEP_SCAN_STORAGE_ENABLED?: string;
  SCAN_STORAGE_ENABLED?: string;
  LOCAL_CLEF_TEST?: string;
  POMONA_QUOTA_KV?: KVNamespaceLike;
  POMONA_CAPTURES_BUCKET?: R2BucketLike;
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
