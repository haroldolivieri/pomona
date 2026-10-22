# Repository instructions

Read and follow @/Users/olivieri.cezar/.codex/RTK.md.

Every new feature or model behavior change must include an eval covering its acceptance criteria and failure cases. Add or update a runnable scenario and assertion in `packages/evals`; ordinary unit tests alone do not satisfy this requirement. Run the relevant deterministic evals before completion. For model behavior changes, run the relevant live eval when credentials are available and report any unrun or failing cases explicitly. Never claim a live eval passed when it was skipped.

Insufficient visual evidence must permit explicit abstention with `insufficient_evidence` on every scan round. Do not force a winner or infer hidden traits to satisfy ranking instructions.

Every production deployment must increase the app version and include a description of that version's changes. Fetch current main before preparing a release; preserve its features and localization. Use `node scripts/deploy-production.mjs` so the version, built release metadata, and production target are checked and the deployment receives a version tag and change description. Never deploy from a stale checkout or publish the same or a lower version as a new release.
