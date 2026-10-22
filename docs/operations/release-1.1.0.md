# Pomona v1.1.0

Based on current main v1.0.0, including Brazilian Portuguese localization and copy gates, this release adds full-frame polygon masking, the short neutral Clef Flash suitability gate at threshold 0.85, and request-correlated model scores/responses and traces. Both models receive the masked upload; the UI retains the original photo and full-frame coordinates. Whole-photo mode remains unmasked. Clef runs only on round one. Gemini can abstain on every round.

Production target: `pomona-proxy` in account `553fb87d04f36b2f088f1250f34503cc`, using existing `pomona` Gateway and quota KV. Deployment preserves existing secrets and variables, adds the native AI binding, and enables the gate. Local experiments remain configured as `pomona-proxy-test` with local KV and separate ignored settings.

Verification before deployment:

- 358 deterministic tests passed across contract, proxy, web, and eval packages.
- Typecheck and production build passed.
- 9 browser masking/routing evals, 20 browser app/localization journeys, and 2 built-Worker localization/offline checks passed.
- 6 version-hook regression tests passed.
- 6/6 live Clef cases passed with the promoted prompt.
- Masked Gemini avocado and uniform-Roma abstention passed. Crowded varied-ripeness Roma failed inventory coverage: four returned candidates did not match distinct annotated produce units. This is a known grading limitation; earlier unmasked controls also failed. It is not represented as a passing live case.
- Code review found no release blockers, including the tracing additions.

The captured pre-release production version is `d2baea23-2d1c-4096-930e-a60406bd6629` (100% deployment `37eb8230-0e9c-4eea-b4af-81dedef4d981`). Restore this version to roll back the combined Worker and assets. Disabling the gate alone does not undo frontend masking.

See [scan observability](./scan-observability.md) for events, spans, scores, response payload handling, and dashboard navigation. No original-image storage is introduced. Native AI uses the existing account's allowance and billing.

Production deployments use `node scripts/deploy-production.mjs`. The guard requires a clean checkout containing current main, a strictly increased version, matching built `/version.json`, and a meaningful change description. Cloudflare receives tag `v1.1.0` and message `v1.1.0: Masked scans; Clef gate at 0.85; model scores/responses and tracing; preserves Portuguese and offline support`. The same guard is used by CI.

Deployed on 2026-10-22 from source revision `c13b95a`, Worker version `84fe6a99-513e-4cf4-a209-ddf30e659ddb`. Production `/version.json` confirms version 1.1.0 and the change description. Cloudflare version metadata confirms the exact message above. Remote settings confirm logs, invocation logs, and persisted traces enabled at full sampling.

Production verification passed for Portuguese HTML, English cookie override, a Portuguese cereal-box rejection (`9f6a319e-8cc3-46a5-af33-092bba255b51`), and masked avocado grading (`b6e0b564-63da-4623-ba6d-131d93753e9a`). The latter passed Clef and returned two Gemini candidates scored 9 and 3. Production logs included correlated Clef scores, raw structured model response, usage, final response, and completion timing.

Release correction: an earlier deployment incorrectly labeled 0.5.0 was built from a stale branch. It was rolled back to the captured previous production version before rebuilding this release directly on main 1.0.0. This release preserves the localization and offline changes that were missing from that stale branch.
