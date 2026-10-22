export interface ScanTracing {
  enterSpan<T>(name: string, callback: (span: {
    setAttributes(attributes: Record<string, string | number | boolean>): unknown;
  }) => T): T;
}

export function traceStage<T>(tracing: ScanTracing | undefined, name: string,
  attributes: Record<string, string | number | boolean>, run: () => T): T {
  return tracing ? tracing.enterSpan(name, span => { span.setAttributes(attributes); return run(); }) : run();
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
