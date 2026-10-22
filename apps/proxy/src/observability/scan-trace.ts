export interface ScanSpan {
  setAttributes(attributes: Record<string, string | number | boolean>): unknown;
  recordException?(error: { name: string; message: string }): unknown;
}
export interface ScanTracing {
  enterSpan<T>(name: string, callback: (span: ScanSpan) => T): T;
}

export async function traceStage<T>(tracing: ScanTracing | undefined, name: string,
  attributes: Record<string, string | number | boolean>, run: (span?: ScanSpan) => Promise<T>): Promise<T> {
  const execute = async (span?: ScanSpan) => {
    const start = Date.now();
    span?.setAttributes(attributes);
    try {
      const result = await run(span);
      span?.setAttributes({ "stage.outcome": "success" });
      return result;
    } catch (error) {
      const type = error instanceof Error ? error.name : "UnknownError";
      const status = error && typeof error === "object"
        ? (error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode : undefined;
      span?.setAttributes({ "stage.outcome": type === "TimeoutError" ? "timeout" : "error",
        "error.type": type, "error.timeout": type === "TimeoutError",
        ...(typeof status === "number" ? { "upstream.status": status } : {}) });
      span?.recordException?.({ name: type, message: type === "TimeoutError" ? "Stage timed out" : "Stage failed" });
      throw error;
    } finally {
      span?.setAttributes({ "duration_ms": Date.now() - start });
    }
  };
  return tracing ? tracing.enterSpan(name, execute) : execute();
}

export function traceResponse(span: ScanSpan | undefined, prefix: string, response: unknown) {
  if (!span) return;
  const text = JSON.stringify(response) ?? "null";
  const status = response && typeof response === "object" && "status" in response ? String(response.status) : "unknown";
  span.setAttributes({ [`${prefix}.status`]: status, [`${prefix}.response`]: text.slice(0, 32000),
    [`${prefix}.response_truncated`]: text.length > 32000 });
}

// Normal responses stay readable; larger responses are chunked with explicit truncation.
// Never pass request bodies, image bytes, prompts, headers, or credentials here.
export function logScanResponse(event: string, trace: Record<string, unknown>, response: unknown) {
  const text = JSON.stringify(response) ?? "null";
  if (text.length <= 8000) {
    console.log(JSON.stringify({ event, ...trace, response }));
    return;
  }
  const limit = 64000;
  const parts = Math.ceil(Math.min(text.length, limit) / 8000);
  for (let part = 0; part < parts; part++) console.log(JSON.stringify({ event, ...trace,
    part: part + 1, parts, truncated: text.length > limit, responseCharacters: text.length,
    responseChunk: text.slice(part * 8000, Math.min((part + 1) * 8000, limit)) }));
}
