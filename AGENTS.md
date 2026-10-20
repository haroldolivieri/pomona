# Repository instructions

Read and follow @/Users/olivieri.cezar/.codex/RTK.md.

Every new feature or model behavior change must include an eval covering its acceptance criteria and failure cases. Add or update a runnable scenario and assertion in `packages/evals`; ordinary unit tests alone do not satisfy this requirement. Run the relevant deterministic evals before completion. For model behavior changes, run the relevant live eval when credentials are available and report any unrun or failing cases explicitly. Never claim a live eval passed when it was skipped.

Insufficient visual evidence must permit explicit abstention with `insufficient_evidence` on every scan round. Do not force a winner or infer hidden traits to satisfy ranking instructions.
