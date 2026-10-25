# Deep Scan — Design (Multi-Angle Closer Scan)

**Date:** 2026-10-22
**Status:** Decisions finalized with product owner in brainstorm + visual companion session (screens: `.superpowers/brainstorm/72254-1792679858/content/`, hi-fi iterations v1–v5)
**Owner decisions live here; buildable specifics deferred to the plan.**

## 1. Intent and why

Today Pomona grades produce from a single photo. When one fruit alone remains, or several fruits look too similar to rank confidently, the model is asked to decide with too little visual coverage and either guesses or abstains. Deep Scan adds a guided ~5-second multi-angle capture of a single fruit, so the assessment is made from 6 best-of-capture views instead of 1 lucky frame. It is positioned as an **accuracy escalation mechanism**, not a second camera mode: it appears only where the single-photo flow already admitted it can't fully answer.

The MVP hypothesis this feature exists to test: *does a guided multi-angle scan produce a meaningfully better ripeness assessment than a single photo?* The feature must therefore be built so that accuracy can eventually be measured against real fruit outcomes (opportunistic, see §10), not just shipped.

## 2. Goals

- One fruit, one guided scan → one structured answer (verdict, confidence, evidence, coverage verdict).
- All-ripeness-unknown abstentions from the photo flow gain a better exit: a closer scan instead of only "try another photo."
- Assessed-tie answers gain "Precise scan" as a resolution path.
- Zero network and zero AI during the capture window (hard owner constraint): capture + frame selection + montage are pure deterministic local math; exactly **one** model call happens after capture, and it is guarded by exactly **one** cheap Clef gate call.
- Full localization parity **en-GB + pt-BR** for everything user-visible, including model-generated free text (evidence, manual checks).
- Cheap: one composite image (~½ the tokens of 6–8 separate attachments), no focus polygon, no second prompt stage on the client, no quota consumption during MVP.

## 3. Non-goals (explicit)

- No live/animated/AI feedback during the capture window (the "you're not rotating" nudge idea was cut by owner constraint).
- No 3D/photogrammetry/LiDAR, no fruit detection or segmentation, no on-device classifier, no embeddings/clustering, no rotation/orientation estimation on device.
- Deep Scan results do **not** feed back into the round 1–3 comparison/ranking machinery. A deep-scan result terminates the session for that fruit ("Start a new scan" → `S1_LiveCamera`).
- No image or scan/result pair persistence server-side; privacy posture identical to today (no cache, no gateway log collection, request-scoped only).
- No automatic Deep Scan of every capture — entry is user-initiated from explicit surfaces only.
- No per-page quota charging in MVP (the gate spend accounting already exists; that stays).

## 4. Anti-goals (a failure even if everything works)

- The app pretending a confident verdict from a coverage-poor montage (same side photographed 6 times).
- Manual touch-check advice contrasting with the visual verdict on confident answers, or unsafely instructing destructive tests.
- Any user-visible string shipping in en-GB only (copy gates fail it; pt-BR must be co-equal in the same change).
- The capture phase feeling like a "video recording" (no shutter sound, no visible recording affordance) — it is a silent multi-snapshot.

## 5. Flow and surfaces (all past v5 hi-fi review)

```text
Photo flow (unchanged)
  └─ insufficient_evidence  → ScanErrorStage (amber eyebrow, warn tip)
  └─ assessed_tie           → ScanErrorStage (green eyebrow, ok tip, "No clear standout")
        BOTH get CTA row: [✦ Precise scan] gold #F5D547 | [existing action] green #2F5D34
        (side-by-side, single row, all buttons filled — no white/outline buttons; owner rule)
        marginal single-fruit result additionally shows a hint-ok box + gold CTA in the result sheet
              ↓ "Precise scan"
DS_CAPTURE: camera feed full-bleed, fixed center OVAL (not polygon — owner correction),
  dark-shadow outside oval, ivory floating prompt card (existing camera pattern), top gradient bar
  Phase 1 "Show the stem side" (~2 s) → Phase 2 "Rotate slowly" (~3 s)
  Sampling ~200 ms → ~25 frames, cropped to oval bbox, ~512px WebP, in-memory only
  START = press shutter (owner default adopted; my call — never explicitly picked in review)
        ↓ deterministic local selection (0 network, 0 AI)
  Reject blur (edge energy, bottom band), reject dark/bright (32×32 histogram),
  similarity-gate vs most recent kept neighbor (<4 too similar, >45 suspicious jump),
  score 0.5·sharp + 0.2·exposure + 0.3·temporalSpread → best 6
        ↓ composite
  2×3 numbered tile montage, single image, bbox crop only (no oval masking)
        ↓ POST /api/v1/deep-scan
  [Clef gate, deep-scan mode: 2 questions (no_produce, unclear_photo); NO multiple_types;
   preamble states "grid of multiple views of one fruit"; fail-open mirrors current semantics]
        ↓ survivors
  ONE Gemini call (deep_scan_v1 prompt, structured output):
    produce/type, ripeness{state incl. unknown, confidence}, evidence[], quality{sufficient_visual_evidence,
    view_coverage, reason}, manualChecks[]{trait, how, whatItMeans}, recommendation
        ↓ verifier (deep-scan lane)
  ┌ verdict card (gold ✦ header, evidence bullets) when coverage good
  ├ "views mostly show same side / not enough angles" card + localized manualChecks panel
  ├ gate denial card (reuses localized gate.noProduce / gate.unclearPhoto copy)
  └ local quality failure card (too blurry / too dark) — never reaches network
  ALL outcomes end with "Start a new scan" → S1
```

Visual recipes (owner-approved, v5): curved ivory sheets 26px radius w/ grab bar; eyebrows amber `#B45309` (insufficient) / green `#2F5D34` (tie/result); Fraunces serif titles; hint boxes `hint-warn`/`hint-ok` as today; **DS CTA fill `#F5D547` dark text**; existing CTAs stay green `#2F5D34` white text; capture screen = gradient top bar + blurred ivory prompt card + 64–68px white-ring shutter (yellow core = start/GO; dimmed gray = stop/cancel-underway); gold dur ring `#F5D547` around oval; cancel ✕ top-right while running.

## 6. System decisions (decided)

- **Server shape:** dedicated endpoint `/api/v1/deep-scan` with own request/response schemas; NOT a new round value; nothing in round 1/2/3 semantics is touched. Body limit for this route raised to ~1MB only.
- **Composite replaces multi-attachment:** the request carries ONE image (add mosaic). Token math favors it (~500–1,000 vs ~2,100); contract-wise this is "one image, special prompt."
- **Coverage validation is Gemini's job** inside the single call (Phase-4 owner idea retained in the lite form: model returns `view_coverage` + sufficient flag; verifier maps insufficient/same-side to abstention cards).
- **Manual checks are first-class abstention UX:** when evidence is capped (not merely angle-poor), the outcome card includes 2–3 produce-appropriate physical checks (pressure, smell, stem look, weight, days-on-counter — safe checks only, never destructive), generated **in the request locale**. They must NOT co-render with a confident verdict (validator-enforced).
- **Gate:** existing Clef gate reused with a deep-scan question-mode (2 questions, no species question); denials short-circuit before Gemini; timeout/failure fail-open like round-1 today; `multiple_types` deliberately omitted (owner confirmed).
- **Quota:** deep scan is free for now; no `budget.ts` charge path; keep gate spend accounting; record a TODO pricing entry for post-MVP (decision logged).
- **Determinism:** numerically fixed metrics and weights (0.5/0.2/0.3, similarLow 4, similarHigh 45, blur-reject band ~bottom 20%); no randomized tie-breaking; selection and montage are byte-stable given identical inputs.
- **i18n:** every new copy key lands in `en.json` + `pt-BR.json` in the same change (copy gates enforce); free-text model fields constrained to request locale by prompt instruction; eval asserts locale.

## 7. Constraints

- Cloudflare Worker + Hono; Vercel AI SDK `generateObject` + `@ai-sdk/google`; Clef `@cf/cloudflare/clef-flash` via Workers AI binding.
- Body limit: deep-scan route ≤ 1MB; composite ≤ ~250KB target (512px tiles, q≈0.7 WebP).
- Max 6 frames from ≤ 25 samples; montage 2×3 with visible tile numbers referenced in the prompt.
- Privacy: identical to scan v1 — `skipCache: true, collectLog: false`, gateway trace headers, request-scoped frames only.
- en-GB + pt-BR locale parity for all copy (client + contract shared copy + model output locale).
- Production deploys: CI-only via `.github/workflows/deploy.yml` after push to GitHub main; app version bump happens at release time only, never during feature work.

## 8. What the builder decides

Exact pixel sizes/radii beyond the v5 mockups' intent; exact metric implementation details that still satisfy the numbers above; exact prompt wording within the documented semantics; minor copy tone within meaning once localized; test fixture target imagery.

## 9. What remains owner-owned after handoff

- Approving final aggressively-worded copy per locale (parity initially in en-GB references, localized by owner pass before release).
- Deciding post-MVP quota pricing when "free for now" sunsets.

## 10. Measurement plan (deferred, not built by the MVP plan)

Opportunistic ground-truth: users/owners deep-scan fruit they already have; when an outcome is verifiable by cutting/tasting, it gets labeled retroactively (dataset entries with `groundTruth` fields); the offline A/B arm (single photo vs 6-view composite, same model) reuses the packages/evals live runner. Decision gate: multi-view must beat single-photo on fruits that were *uncertain* from one frame; report intervals, not point estimates.
