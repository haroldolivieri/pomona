# Following a scan in Cloudflare

The production `pomona-proxy` Worker enables Workers Logs and Traces with full sampling. AI Gateway `pomona` records provider request metrics. The application adds named `scan.request`, `scan.clef`, and `scan.gemini_or_provider` spans through the runtime's `ExecutionContext.tracing` API.

Find a scan's `X-Pomona-Request-Id` response header in browser Network tools, or the `[scan] trace` browser console entry. In Cloudflare, open Workers & Pages, `pomona-proxy`, then Observability. Search logs for this request ID; all events from the request share it. The request span carries the same ID. Gateway metadata also includes the request ID (Clef uses `request_id`; Gemini uses `requestId`). `sessionId` connects scan rounds; every round gets its own request ID.

The event sequence is:

From v1.1.1, outcomes are inspectable directly on each span. `scan.clef` includes `gate.decision`, `gate.scores`, `gate.threshold`, `gate.timeout_ms` (3000), and `gate.timed_out`. A timed-out stage records `stage.outcome=timeout`, `error.type=TimeoutError`, and a sanitized exception. Model spans contain `model.status`, `model.response`, token counts, and duration; the request span contains `scan.status` and `scan.response`. Model and gate logs are emitted while their own span is active. Span response attributes are capped at 32,000 characters with an explicit truncation flag; the separate log response chunks retain the existing 64,000-character limit. Known authentication/capacity denials retain their classification even if the deadline has elapsed.

1. `scan_received`: session, round, MIME, payload size, and whether a selection is present. `requestId` links the scan to model events and spans.
2. `gate_usage`: all three Clef scores, threshold 0.70, model, duration, token usage, and decision. `pass_to_grading` continues to Gemini. `gate_failure` instead records failure type and fallback/denial outcome. Later rounds bypass the gate.
3. `model_response`: every structured Gemini/provider response, before verification, including candidate scores and coordinates. `attempt` distinguishes initial inference from repair. `model_usage` records per-attempt tokens, latency, provider/model, and success or HTTP failure.
4. `scan_usage`: verified model outcome and total grading tokens/attempts. Gate token spend is separate in `gate_usage`; add both for scan-level usage.
5. `scan_response`: final application response, including gate rejection, verified result, abstention, seasonality, or error. `scan_complete` records overall duration and HTTP status; a response's application status explains failures returned with HTTP 200.

Use Workers Observability to filter/group events by status and model and inspect durations. Use AI Gateway analytics for billed provider usage, request count, latency, and errors. Gate rejection rate is the share of `gate_usage` events whose status is one of `no_produce`, `unclear_photo`, or `multiple_types`. `gate_failure` with `pass_to_grading` measures fallback frequency. Group `model_usage` by `attempt` to find repair overhead. Logs and spans remain subject to Cloudflare retention, ingestion limits, sampling settings, and platform availability; they are not permanent storage or a custom metrics dashboard.

Image bytes, request bodies, prompts, authorization headers, cookies, IP addresses, and API keys are excluded from these structured events. AI Gateway payload logging remains disabled. Model output is intentionally logged as requested. Ordinary responses are logged in one event; responses above 8,000 characters use numbered `responseChunk` events that can be joined in order. Output above 64,000 characters marks `truncated: true`. Account/provider records remain necessary for unknown usage on aborted requests. No original-image gallery is created by this release.

References: [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Workers Traces](https://developers.cloudflare.com/workers/observability/traces/), [Custom spans](https://developers.cloudflare.com/workers/observability/traces/custom-spans/).

## Deep Scan (`POST /api/v1/deep-scan`)

Deep Scan reuses the same request tracing stack with `stage: "deep_scan"` on every `scan_usage` row so the two surfaces stay distinguishable. A Deep Scan request emits:

1. `scan_usage` (stage `deep_scan`): `framesSubmitted` (sampled frames echoed by the client), `compositeImageBytes`, `attempts` (verify/repair cycles), verified `status`, `promptVersion` (`deep_scan_v1`), provider/model, and total grading tokens. The two-question Clef visibility gate runs on the composite first — its outcome, scores, usage, and duration appear in `gate_usage`-style events with `stage: "deep-scan"` attributes; `pass_to_grading` continues to the grading provider, and denials never reach the model.
2. Device quota is intentionally NOT consumed on this route in the current release; do not infer budget behavior from `remainingScans` (never sent on Deep Scan responses).

Web-side product events (`deep_scan_started`, `deep_scan_abandoned`, `deep_scan_completed`, `deep_scan_accepted`, `deep_scan_rescanned`) carry the entry origin (`insufficient` / `tie` / `result_banner`) and result status so funnel drop-off between capture, gate denial, and verdicts can be grouped without any image data.

Live deep-scan eval reports land in `packages/evals/dataset/last-deep-scan-eval-report.json` (contract-level arms, en-GB + pt-BR); gate-level smoke reports use the Clef test account as in the round-1 gate eval.

See [native Clef quality dashboard](clef-grading-metrics.md) for joined gate/grading outcome fields and chart definitions.
