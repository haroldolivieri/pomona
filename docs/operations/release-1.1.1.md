# Pomona v1.1.1

Deployment description: `v1.1.1: Span outcomes, Clef scores and Gemini responses; explicit timeout errors; Clef timeout increased to 3s`.

This patch attaches Clef decisions/scores, timeout classification, Gemini structured responses, and final app status directly to the relevant trace spans. Logs now execute inside model spans. The Clef inference deadline increases from 2.5 seconds to 3 seconds. Known 401/403/429 denials remain authoritative after an elapsed timeout and never permit another paid model call. Existing masks, 0.85 threshold, localization, and Gemini grading behavior remain unchanged.

Compression investigation used the supplied carrot photo with 768px and 512px WebP quality 80, three runs each. All six completed under one second. Median duration was 754ms at 768px versus 601ms at 512px; input tokens were 896 versus 616. Both sizes passed the image to grading, so reducing size did not fix the missed glare rejection. This one-image REST experiment does not establish native Gateway latency or classifier accuracy. Production upload resolution remains 768px.

A local gallery exports all 22 eval scenarios through the actual browser upload pipeline at both sizes, preserving focus masks. The 512px files total 1,054,366 bytes versus 2,010,676 bytes at 768px (47.6% smaller). Export command: `node packages/evals/scripts/export-compression-gallery.mjs`, with a local frontend running at `https://127.0.0.1:5177`. Output defaults to `/tmp/pomona-compression-gallery`. The gallery performs no model calls.

Verification: 364 deterministic tests passed, including injected timeout and elapsed-timeout/401/403/429 regressions. All six live Clef gate cases passed at the new deadline. Typecheck, copy gates, and production build passed. Review found no remaining blockers after preserving denial classification. Gemini's model prompt and upload preparation are unchanged; the known crowded-Roma coverage limitation from v1.1.0 remains.
