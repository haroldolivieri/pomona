# Brazilian Portuguese Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support Portuguese and English using saved choice, browser preferences, and an English fallback, with mandatory copy checks.

**Architecture:** Negotiate locale on the initial HTML request and embed it before React starts. Keep geographic seasonality independent, reuse i18next for catalogs, and enforce extraction and catalog completeness in CI.

**Tech Stack:** TypeScript, React, i18next, Hono, Cloudflare Workers Static Assets/HTMLRewriter, ESLint, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-pt-br-localization-design.md` (updated to preference-based language selection).

## Global Constraints

- Support `pt-BR` and `en-GB`; saved explicit choice wins over browser preferences, then English.
- Country independently selects seasonality. Preserve geographic resolution and calendar data.
- No extra startup HTTP request. Bundle both catalogs.
- Model prompts, model schema, enums, text limits, and grading rules remain unchanged.
- `insufficient_evidence` remains valid on every round; never force a winner or invent hidden traits.
- Every behavior change includes runnable deterministic scenarios and assertions in `packages/evals`.
- No live evals, new model calls, deployment, language URL routes, or country domains.
- Product copy lives in catalogs. Preserve existing code comments.
- Keep seasonality badge and note limits at 48 and 90 characters.

## Review Focus

- Conflicting country and language must affect seasonality and copy independently: Tasks 1, 4, 6.
- Invalid cookies, weighted headers, and `q=0` must not choose an excluded language: Task 1.
- Cached HTML and offline fallback must not replay another user's preferences: Tasks 2, 3.
- Localized headlines must not change ranking or follow-up resolution: Tasks 4, 5.
- JSX-only lint misses helper strings, HTML metadata, and missing plural keys: Task 6.

## File Responsibilities

- `packages/contract/src/locale.ts`: pure negotiation shared by Worker and browser.
- `packages/contract/src/copy.ts`, `locales/en-GB.json`, `locales/pt-BR.json`: shared deterministic text and metadata, rendered through request-scoped locale arguments.
- `apps/proxy/src/document.ts`: asset response transformation; API handlers retain responsibility for scans.
- `apps/web/src/i18n/bootstrap.ts`: synchronous startup locale and preference persistence.
- Existing web catalogs/components: UI copy, including a new `LanguageSelector.tsx`.
- `scripts/check-copy.mjs`, `eslint.config.mjs`: referenced-key/catalog validation and source literal policy.
- New focused tests under existing workspace test directories; `packages/evals/test/localization.test.ts` owns cross-boundary acceptance scenarios.

## Task 1: Pure Language Negotiation

**Files:** Create `packages/contract/src/locale.ts`, `packages/contract/test/locale.test.ts`; modify `packages/contract/src/index.ts`; create `packages/evals/test/localization.test.ts`.

**Interfaces:** Export `SupportedLocale = "en-GB" | "pt-BR"`, `resolveDisplayLocale(saved: string | null | undefined, acceptLanguage: string | null | undefined): SupportedLocale`, and `LOCALE_COOKIE = "pomona_locale"`.

- [ ] Write failing table-driven tests. Assert saved `en-GB` wins over `pt-BR`; invalid saved values fall through; `pt`, `pt-PT`, and case variants select Portuguese; `en-US` selects English; `es,pt;q=0.8,en;q=0.5` selects Portuguese; `pt;q=0,en;q=1` selects English; wildcard-only, empty, and malformed input fall back to English. Ties preserve header order; invalid quality entries are ignored. Include strict saved-value allowlisting and header input bounds.
- [ ] Add the same decision table as runnable acceptance scenarios in `packages/evals/test/localization.test.ts`. Country is absent from the negotiation interface, proving it cannot override language.
- [ ] Run `pnpm --filter @pomona/contract test -- test/locale.test.ts` and `pnpm --filter @pomona/evals test -- test/localization.test.ts`; expect failure before implementation.
- [ ] Implement pure resolution, export it, and rerun both commands; expect all cases to pass.
- [ ] Commit only this task's files with `feat: resolve supported display language from preferences`.

## Task 2: Initial HTML Locale Without a Bootstrap Request

**Files:** Create `apps/proxy/src/document.ts`, `apps/proxy/test/document.test.ts`; modify `apps/proxy/src/index.ts`, `apps/proxy/src/types.ts`, `apps/proxy/wrangler.jsonc`, `apps/web/index.html`; extend `packages/evals/test/localization.test.ts`.

**Interfaces:** Add `Env.ASSETS?: { fetch(request: Request): Promise<Response> }`. Export `serveLocalizedDocument(request: Request, assets: NonNullable<Env["ASSETS"]>): Promise<Response>` from `document.ts`. Embed the allowlisted locale as `html[data-pomona-locale]` and set `html[lang]`; never embed raw headers or cookies.

- [ ] Write tests asserting `/` and index navigation receive the negotiated locale and `Cache-Control: private, no-store`; invalid cookies cannot inject markup. API requests still reach API handlers, and missing image/script assets remain errors rather than HTML.
- [ ] Run `pnpm --filter @pomona/proxy test -- test/document.test.ts`; expect failure before implementation.
- [ ] Configure an assets binding and selective Worker-first routing for existing document entry paths. Fetch static source via the binding, rewrite HTML only, and preserve direct immutable-asset delivery. Add Hono document routes after API routes. Leave requests without a configured binding on existing API behavior. Use the shared resolver; no context endpoint.
- [ ] Test HTMLRewriter with a Worker-compatible runtime using the project's pinned Wrangler runtime, not only a mocked transformation. Add deterministic eval assertions for negotiation-to-HTML behavior. Test sequential English and Portuguese requests cannot reuse personalized output.
- [ ] Rerun focused tests and evals; expect pass. Commit as `feat: embed negotiated locale in initial app document`.

## Task 3: Synchronous Startup, Saved Choice, and Offline Shell

**Files:** Create `apps/web/src/i18n/bootstrap.ts`, `apps/web/src/components/LanguageSelector.tsx`, `apps/web/test/i18n-bootstrap.test.ts`, `apps/web/test/components/LanguageSelector.test.tsx`; modify `apps/web/src/i18n/index.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/components/CameraViewfinder.tsx`, `apps/web/public/sw.js`; create `apps/web/public/offline.html`, `apps/web/test/service-worker.test.ts`.

**Interfaces:** Export `readInitialLocale(): SupportedLocale` and `saveLocalePreference(locale: SupportedLocale): void`. Initial embedded locale wins; without it use saved cookie then browser preferences via Task 1. `LanguageSelector` accepts `{ locale: SupportedLocale; onChange(locale: SupportedLocale): void }`.

- [ ] Write tests proving startup needs no fetch, embedded locale beats stale browser settings, and invalid DOM data uses local fallback. Assert saving writes a one-year first-party cookie and blocked storage does not throw.
- [ ] Write selector tests: localized label and native language names, keyboard selection, i18next/document update, persistence across a reload, and no selector during analysis/results. Existing model results must never be translated by changing global locale mid-round.
- [ ] Write service-worker tests asserting personalized navigations are never cached or precached; network failure uses a neutral offline shell. The shell references current build outputs using a Vite build step, carries no detected locale, and initializes through the same cookie/browser fallback. Upgrade the cache version and remove legacy cached personalized documents during activation.
- [ ] Run `pnpm --filter @pomona/web test -- test/i18n-bootstrap.test.ts test/components/LanguageSelector.test.tsx test/service-worker.test.ts`; expect failure.
- [ ] Implement synchronous initialization and selector on the idle camera screen. Keep current-page selection even when cookie writes fail. Bundle catalogs. Update startup document metadata through catalog values, including after selection. Add neutral offline shell generation to the existing Vite build rather than hardcoding hashed asset names.
- [ ] Rerun the focused commands and existing camera tests; expect pass. Commit as `feat: add saved language selection and synchronous locale startup`.

## Task 4: Shared Copy and Regional Seasonality

**Files:** Create `packages/contract/src/copy.ts`, `packages/contract/src/locales/en-GB.json`, `packages/contract/src/locales/pt-BR.json`, `packages/contract/test/localized-copy.test.ts`; modify `packages/contract/package.json`, `packages/contract/tsconfig.json`, `packages/contract/src/index.ts`, `packages/contract/src/seasonality.ts`, `packages/contract/src/ripeness-target.ts`, `apps/proxy/src/document.ts`, `apps/proxy/src/index.ts`; extend `packages/contract/test/seasonality.test.ts` and localization evals.

**Interfaces:** Reuse i18next as a contract dependency, with isolated catalog resources and explicit `lng` on every shared lookup. Export `translateShared(locale: SupportedLocale, key: string, values?: Record<string, string | number>): string`. Extend `lookupProduceSeasonality(produceType, region, month, displayLocale?: SupportedLocale)` and `resolveCandidatesForTarget(candidates, targetWindow, displayLocale?: SupportedLocale)` with an English default. Add internal helper result property `headlineKind: "buy" | "other"` to remove comparisons against translated `Buy it.`; this helper is not a model response schema.

- [ ] Write tests comparing all country/month/produce calculations across both locales: statuses, canonical slug, selected country, origin codes/order, and month boundaries stay equal; display text changes. Test all formatted combinations against unchanged seasonality schemas and 48/90 limits.
- [ ] Test English copy in Brazil and Portuguese copy in GB. Test unknown country preserves the existing region fallback. Compare target ranking and follow-up decisions across languages, including empty candidate lists and all target windows.
- [ ] Run `pnpm --filter @pomona/contract test`; expect localized cases to fail before implementation.
- [ ] Extract deterministic ripeness/seasonality text and document metadata into shared catalogs. Localize country names and month labels without translating preformatted English. Enable JSON modules where required. Pass display locale separately in proxy enrichment and preserve canonical produce lookup first. Use explicit per-request locale to prevent cross-request shared-language mutation.
- [ ] Use shared metadata translations in Task 2 HTML formatting. Rerun contract tests, document tests, and evals; expect pass. Commit as `feat: localize deterministic copy without changing seasonal calculations`.

## Task 5: Complete UI Copy and Scan Locale Propagation

**Files:** Add `apps/web/src/i18n/locales/pt-BR.json`; modify `apps/web/src/i18n/locales/en.json`, `apps/web/src/App.tsx`, `apps/web/src/components/{AnalysingStage,CameraViewfinder,ErrorBoundary,FlipCameraStage,FreehandDrawStage,ResultStage,ScanErrorStage,SeasonalityStrip}.tsx`, `apps/web/src/state/scan-state-machine.ts`, `apps/web/src/lib/{api-client,spatial-a11y,mock-api-client}.ts`; extend related web tests and `packages/evals/test/localization.test.ts`.

**Interfaces:** Preserve `ScanRequest` and `ScanResponse`. Populate existing `ScanRequest.locale` from the active supported locale. Pass locale to shared display helpers. Use `headlineKind` from Task 4 for behavior branches. For user-visible request failures use a typed error carrying a stable translation key and interpolation values; preserve diagnostic detail in logs.

- [ ] Write failing component tests for both languages covering all existing stages, selector, quota, crash recovery, aria labels, generated spatial descriptions, plural counts, and fallbacks. Add integration tests capturing requests for rounds 1–3/retry and asserting selected locale remains unchanged.
- [ ] Add Portuguese success/abstention fixtures to deterministic evals. Validate unchanged fields/enums/slugs and `insufficient_evidence` with no winner on every round. Compare English/Portuguese rendered prompts with otherwise identical inputs: only existing locale substitutions differ. Do not edit prompt templates or snapshots to hide prompt changes.
- [ ] Run `pnpm --filter @pomona/web test` and focused localization evals; expect the new cases to fail.
- [ ] Extract remaining UI literals, inline English defaults, helper/state fallbacks, tester labels, and error-boundary copy. Add natural Brazilian Portuguese translations with matching interpolation. Use existing metadata/seasonality catalogs where applicable; localize mock-mode visible fixtures without adding model calls. Do not render raw transport/provider exception text in the UI.
- [ ] Replace English text comparisons with semantic values. Preserve existing state-machine event shapes unless a typed display-key payload is necessary; update every event producer/consumer together.
- [ ] Rerun web tests, contract tests, and localization/prompt-regression evals; expect pass. Commit as `feat: translate app copy and propagate selected scan locale`.

## Task 6: Required Copy Gate

**Files:** Create `eslint.config.mjs`, `scripts/check-copy.mjs`, `scripts/check-copy.test.mjs`, `packages/evals/test/copy-gate.test.ts`; modify root `package.json`, `pnpm-lock.yaml`, `.github/workflows/deploy.yml`; extend localization evals.

**Interfaces:** `pnpm lint:copy` runs ESLint with zero warnings and the catalog checker. Export `validateCatalogs(catalogs)` and `validateCopyReferences(files, catalogs)` from the checker for fixture-based tests; importing the module must not execute its CLI. Catalog inputs include every registered web/shared language.

- [ ] Add failing gate fixtures for plain JSX, wrapped text, aria labels, label objects, helper fallbacks, templates, inline `defaultValue`, uncatalogued translation-component children, missing/unknown keys, placeholder mismatch, wrong value shape, and missing Portuguese plural forms. Approved enums, translation keys, URLs, CSS, diagnostic logs, and generated locale-aware names must pass.
- [ ] Run `node --test scripts/check-copy.test.mjs` and `pnpm --filter @pomona/evals test -- test/copy-gate.test.ts`; expect failure.
- [ ] Install compatible ESLint, TypeScript parser, and `eslint-plugin-i18next` versions. Use broad literal checking over shipped copy-producing modules, with narrow documented machine-value exceptions. Reject unused disable directives and avoid a baseline exemption for old hardcoded copy. Validate referenced keys using TypeScript AST traversal rather than regex; dynamic references must resolve to finite declared key sets. Check plural categories using each locale's plural rules rather than identical flattened suffix sets.
- [ ] Audit catalog-backed HTML metadata, manifest descriptive text, and generated offline HTML. Extend the checker to reject hand-authored text in those shipped surfaces; build-generated metadata is validated against catalogs.
- [ ] Add a CI copy step to the existing required unit-tests job. Keep the existing deploy dependency chain intact; configure branch protection externally if this job is not already required. Do not modify unrelated live-eval CI policy or run live evals locally.
- [ ] Run `pnpm lint:copy`, gate fixtures, and deterministic copy/localization evals; expect pass. Commit as `chore: gate hardcoded copy and incomplete translations`.

## Task 7: Browser Verification and Completion Evidence

**Files:** Create `apps/web/e2e/localization.spec.ts`; update the spec only for verified implementation decisions or limitations. Apply the repository's required web version bump before integration.

**Interfaces:** Reuse existing mocked scan fixtures and Playwright configuration. No live model calls.

- [ ] Add browser journeys for English/Portuguese, saved-choice reload, switching with browser/country disagreement, all rounds, errors, offline restart, and blocked cookie storage. Capture screenshots at 393×852 and a narrower mobile viewport for long Portuguese labels; assert controls remain visible and keyboard-accessible.
- [ ] Run `pnpm --filter @pomona/web test:e2e -- e2e/localization.spec.ts`; expect pass after implementation. Validate Worker HTML routing in Task 2's runtime tests because Vite journeys do not exercise production asset handling.
- [ ] Run `pnpm lint:copy`, `pnpm typecheck`, `pnpm -r test`, `pnpm build`, and `git diff --check`; every command must pass. Run the existing browser journey suite if locale integration changes shared journey setup.
- [ ] Confirm prompt files and model schema have no changes. Inspect the final diff for calendar changes and language-dependent winner decisions. Report deterministic counts, browser evidence, and any unresolved copy limitations. State explicitly that live model translation quality was not tested.
- [ ] Commit browser evidence tests and required version change as `test: verify localized app journeys and copy gates`. Do not deploy or invoke live benchmarks.

## Self-Review

All design sections map to tasks above. Country/language separation, cookie failure, service-worker migration, hardcoded helper copy, plural coverage, schema invariance, and unchanged prompts have explicit verification. Task interfaces share one `SupportedLocale` type and preserve model request/response schemas. Exact visual placement and narrow machine-string exceptions remain builder decisions. Implementation has not started.
