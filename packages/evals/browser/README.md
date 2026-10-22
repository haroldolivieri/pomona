# Full-frame masking evals

Run `pnpm --filter @pomona/evals eval:mask` from the repository root. Install Chromium first with `pnpm --filter @pomona/evals exec playwright install chromium` if needed. The runner starts its own Vite HTTPS frontend on port 5177 and refuses to reuse another checkout's server; no provider credentials or proxy are required.

The scenarios cover opaque outside pixels, unchanged inside pixels, concave selections, portrait/landscape geometry, invalid selections, image/canvas failure, whole-photo uploads, and the actual drawing-to-request-to-result UI path. Selected uploads retain full-frame coordinates; the UI keeps the original photo. Cropped helper behavior is not used.

The runner uses the dedicated Clef-local frontend configuration with a test-only port override. A loopback HTTP stub on port 8788 verifies that `/api` reaches the isolated backend. This scenario requires port 8788 to be free and makes no model calls.

Reference scenarios 02, 17, and 20 export `masked-full-frame.png` and `unmasked-control.png` into their directories under `packages/evals/test-results/`. Both use the same 768-pixel upload preparation. The PNGs decode the actual encoded uploads so the live eval runner can consume them without a MIME mismatch.

To run a live check, set `EVAL_SCENARIO_ID` to the matching reference scenario, `EVAL_IMAGE_PATH` to its generated image, `EVAL_REPORT_PATH` to a separate report path, and `EVAL_MAX_ATTEMPTS=1`. From `packages/evals`, run `node --import tsx scripts/run-live-eval.ts --strict`. Existing environment loading finds the configured provider key. Keep masked and control reports separate; do not overwrite checked-in baseline reports.

Pixel/UI success does not establish improved model accuracy or lower image-token costs. Report live failures and skipped checks explicitly. The mask can hide parts of produce crossing the selection boundary; the model must still abstain when remaining evidence is insufficient.
