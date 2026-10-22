# Native Cloudflare Observability dashboard

Use Cloudflare's own Workers Observability Query Builder and Custom Dashboards. No separate dashboard app, Analytics Engine dataset, or external service is needed.

The `gate_grading_outcome` structured log is emitted once per first-round Gemini grading flow after Clef. It contains `requestId`, `gateDecision`, `gradingStatus`, `clefPassGeminiNonOk`, and numeric `nonOkValue` (0 or 1). The root trace also contains `flow.gate_decision`, `flow.grading_status`, and `flow.clef_pass_gemini_non_ok`. No images or secrets enter this metric.

This measures the final verified grading response, not each raw Gemini attempt. Retries count once. A non-ok result may be a legitimate abstention, not necessarily a Clef error. Timeout/provider errors (`error_fallback`) and invalid Clef output (`invalid_output_fallback`) stay separate from valid passes. Disabled gates, later rounds, rejections, and quota stops before grading do not enter the denominator.

## Dashboard: Pomona — Clef gate quality

Dataset: Workers Observability logs. Default time range: 24 hours. Filter Worker to `pomona-proxy` and `event` to `gate_grading_outcome`.

| Panel | Additional filters | Aggregation |
| --- | --- | --- |
| Clef passes reaching Gemini | `gateDecision = pass_to_grading` | Count |
| Gemini non-ok after Clef pass | `gateDecision = pass_to_grading` | Sum of numeric `nonOkValue` |
| Non-ok rate after Clef pass | `gateDecision = pass_to_grading` | Average of numeric `nonOkValue`; format as percentage |
| Gemini outcome breakdown | `gateDecision = pass_to_grading` | Count grouped by `gradingStatus` |
| Gate fallback breakdown | none | Count grouped by `gateDecision` |

Use timeseries for trends, stat cards for totals/rate, and bars for statuses. Keep the denominator visible beside the rate. Count and rate reflect retained telemetry, not billing counters.

Save a drilldown query named `Pomona — Clef passed, Gemini non-ok`: the same base filters, plus `clefPassGeminiNonOk = true`. Include `requestId` and `gradingStatus` columns. Open an invocation to inspect its model spans and responses. Saved queries belong to the Cloudflare account and can be shared with account members.

The charts must be configured and verified in the native Cloudflare UI after the CI release supplies these fields. Source changes alone do not create a remote dashboard. No scheduled alert is configured.

## Release policy

Production deploys only through `.github/workflows/deploy.yml` on main after source is pushed. `scripts/deploy-production.mjs` rejects ordinary local execution. CI validates version and release description, passes both to Wrangler's deployment message, and writes them with commit SHA to the GitHub Actions job summary. Every release bumps the version.
