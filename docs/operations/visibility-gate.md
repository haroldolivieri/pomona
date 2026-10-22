# Clef Flash visibility gate

Release v1.1.2 enables the Direct gate in the production `pomona-proxy` Worker through its AI binding and existing `pomona` AI Gateway. Local experiments remain isolated under `pomona-proxy-test`. Production activation is explicitly authorized by the user. No login feature or new per-user budgets are introduced.

## Scan behavior

On round one, Clef receives the uploaded image: the full frame with opaque black outside the user's drawing, or the whole photo when no drawing exists. The prompt describes black masking as artificial and excludes it from blur/obstruction judgments.

Clef answers three coarse questions: no actual fresh produce, obvious unreadable surfaces, and co-equal different produce species. From v1.1.2, the Direct prompt is used. Exactly one failure score at or above 0.70 returns the corresponding existing error without calling Gemini. These scores require evaluation; they are not calibrated certainty. The gate never grades ripeness, declares a tie, or chooses a winner.

Lower scores, conflicting answers, malformed output, or ordinary inference failures continue to Gemini. Native inference has a 3-second abort signal and no configured retries. Capacity/budget denials return `rate_limited`; authentication and accounting failures stop the scan. Rounds two and three bypass Clef and keep the existing abstention behavior.

Gemini currently receives the same masked upload. The original photo remains in browser state for UI rendering and a possible future original-image upload; it is not sent as a second image. Both models use full-frame coordinates.

## Local setup and checks

1. Set `CLEF_TEST_ACCOUNT_ID` and `CLEF_PRODUCTION_ACCOUNT_ID` in the ignored `apps/proxy/clef-local/.env` file (see `.env.example`). For the approved same-account experiment, set both IDs to your account ID and keep `CLEF_ALLOW_SHARED_ACCOUNT=true`. Separate accounts remain supported without this opt-in. Missing/invalid IDs or matching IDs without opt-in stop all live commands before credentials or requests. Account IDs are not inferred from the active production CLI configuration.
2. Authenticate with a token in root `.env` (`CLOUDFLARE_API_TOKEN`; existing `CLOUDFARE_API_TOKEN` spelling is also accepted), or with `pnpm --filter @pomona/proxy exec wrangler login`, then run `pnpm --filter @pomona/evals eval:mask` to generate reference captures.
3. Run `pnpm --filter @pomona/evals eval:gate:live`. The runner uses the current Wrangler token in memory, or `CLOUDFLARE_API_TOKEN`. Its only inference URL is the Clef model endpoint in `CLEF_TEST_ACCOUNT_ID`. It does not call a deployed Worker or a Gateway. Never paste tokens into chat or commit them.
4. Review `/tmp/pomona-clef-gate-report.json`. This is a six-case REST smoke test with actual masked captures, not a production accuracy/savings benchmark or proof of native binding/Gateway operation. Missing credentials/captures and failed cases exit nonzero. No Gemini calls are made. Denials stop further requests.
5. After the smoke checks pass, run `pnpm --filter @pomona/evals dev:clef:local` to verify the native binding. This fixed command launches local `wrangler dev` (without `--remote`; `--local` would disable the remote AI binding) on `127.0.0.1:8788` using only `apps/proxy/clef-local/wrangler.jsonc`. It pins the account to `CLEF_TEST_ACCOUNT_ID`, uses the dedicated Worker name `pomona-proxy-test`, and declares local-only KV with no real namespace ID. It cannot forward extra CLI arguments or deploy. Test state lives under `/tmp/pomona-clef-local-state`.
6. Gemini fallback is optional for local testing. If needed, create `apps/proxy/clef-local/.dev.vars` from its example and use a dedicated test Gemini key. The launcher removes inherited Gemini/OpenAI keys and Gateway credentials. The isolated config has its own secrets directory; do not copy production `.dev.vars` into it. Local mode ignores Gateway settings even if accidentally supplied.

For the combined local frontend and Worker, run `pnpm dev:clef` from the repository root with both account IDs saved in the local settings file or environment. Open `https://127.0.0.1:5178`; this frontend routes `/api` exclusively to the isolated Worker at `http://127.0.0.1:8788`. Both ports must be free. The command validates account selection and any shared-account opt-in before starting either process. Clef inference still runs remotely in the test account. Without a dedicated test Gemini key, requests that pass the gate cannot complete Gemini analysis.

Real Clef inference is remote: it uses the declared test account's Workers AI allowance. With same-account opt-in, inference shares production's Workers AI allowance, capacity, and billing. A separate Worker does not isolate account-level AI usage. These commands do not deploy/update Workers, alter secrets, use production KV, or send traffic through the production Gateway. The mask browser eval is fully offline with respect to inference and needs no Cloudflare account.

## Cost and rollback

Known gate token usage is recorded under `@cf/cloudflare/clef-flash`, separately from Gemini, at the currently documented $0.038 per million input tokens with no output charge. Non-ok gate decisions do not consume the daily successful-scan allowance. Missing usage and aborted/failed requests are logged as unknown, not asserted to be free. Gateway/provider records remain necessary for actual billed spend.

Stop the local process to end the experiment. For production rollback, restore the prior known-good deployment through Cloudflare deployment rollback, or disable `VISION_GATE_ENABLED` in the production configuration and redeploy. A frontend rollback is needed to undo masking; disabling the gate alone leaves masked Gemini uploads enabled.

References: [Clef Flash schema](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [native error/raw-response behavior](https://github.com/cloudflare/workerd/blob/main/src/cloudflare/internal/ai-api.ts).
