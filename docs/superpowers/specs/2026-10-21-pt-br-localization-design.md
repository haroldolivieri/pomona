# Region-based Brazilian Portuguese

## Intent and agreed scope

Give users connecting from Brazil the existing Pomona experience in Brazilian Portuguese. Keep flows, grading behavior, model prompts, and the model output schema unchanged. Other regions retain English. Region, rather than browser language, selects language for this release.

The user explicitly excluded live evals. Deterministic acceptance scenarios and assertions in `packages/evals` remain required by repository instructions. Model language quality will remain unverified by live calls.

## Current implementation

- `apps/web/src/i18n/index.ts` registers only English and forces `en`.
- `apps/web/src/i18n/locales/en.json` contains some copy. Components, state helpers, accessibility descriptions, and fallback/error paths still contain English literals.
- `apps/web/src/App.tsx` sends `locale: "en-GB"` for every scan.
- Both first-round and follow-up prompt templates already interpolate request locale.
- `apps/proxy/src/index.ts` enriches successful model responses with deterministic seasonality. Country comes from Cloudflare request metadata, then request locale, then GB.
- `packages/contract/src/seasonality.ts` includes Brazil-specific calendars, but produces English month labels, country names, badges, and notes.

## Language and region

Recommended implementation choices below are the author's calls, pending design approval.

Add a small same-origin bootstrap endpoint, proposed as `GET /api/v1/context`, returning the detected country when available and resolved locale. Use trusted Cloudflare country metadata; do not trust a country supplied in a browser query or body. `BR` resolves to `pt-BR`; all other countries and missing/invalid metadata resolve to `en-GB`. Browser language does not participate.

Fetch context before mounting translated app screens. Show a neutral loading surface without English copy while waiting. A bounded request timeout or failure selects English and allows the app to open. Set the document language consistently. Resolve once per page load; do not persist locale across visits or change language midway through a scan. Manual language selection is outside scope.

Do not globally cache the context response: use `Cache-Control: private, no-store`. Ensure service-worker handling cannot cache a regional result for another visit. Development and tests inject region metadata or mock context; do not ship a public region override.

Maintain country and display locale as separate concepts. For example, France still uses English copy but must retain French seasonality. English fallback must not overwrite a known country.

## Copy extraction and translation

Reuse existing `i18next` and `react-i18next`; add no localization framework. Complete the English catalog and add a matching Brazilian Portuguese catalog. Extract all shipped user-facing literals, including results, flip instructions, ripeness targets, quota notices, crash recovery, loading text, camera errors, accessibility descriptions, image descriptions, and exposed tester controls.

Keep identifiers, logs, API enums, property names, and internal errors separate from translated text. Map client-visible transport and quota errors to translation keys; avoid rendering raw English exceptions as product copy. Preserve useful model-authored messages in the requested language.

Helpers and state transitions should use stable semantic values and presentation translations. Audit existing comparisons against English phrases such as `Buy it.` so translating a headline cannot change winner resolution or follow-up behavior. Preserve behavior with deterministic regression cases.

Use interpolation and locale-aware pluralization for counts, scores, and durations. Keep the Pomona name unchanged. English remains the fallback for genuinely missing keys, with deterministic parity checks preventing catalog gaps at release.

## Model boundary

Pass the resolved locale in the existing scan request field for rounds 1, 2, and 3, including retries and follow-ups. Do not add fields or change defaults/enums in the model schema. Do not edit prompt templates, system instructions, repair instructions, grading rules, or text limits. Rendered prompts may differ only where the existing locale parameter is substituted.

Human-readable response values are expected to follow the requested locale. Machine identifiers, including produce slugs, status values, candidate identifiers, roles, and abstention reasons, remain unchanged. Seasonality must prefer canonical produce slugs, rather than depending on translated display names.

No post-processing translation call or additional model call is included. If the existing locale parameter proves insufficient, report that limitation; changing prompts requires a separate decision. Deterministic tests cannot establish actual model translation quality.

Insufficient visual evidence must still permit `insufficient_evidence` on every round. Localization must never force a winner or invent hidden traits.

## Seasonality

Preserve existing country resolution priority, country-specific calendars, current-month calculation, origin choices, and local status decisions. Do not derive shopper country from the two supported display locales when valid geographic country is available.

Recommended implementation: extend deterministic seasonality formatting to accept a separate optional display locale, defaulting to existing English behavior. Keep all returned object fields and enum values unchanged. Translate only text values: country names, month windows, year-round labels, badges, and notes. Store formatting messages in dedicated catalogs alongside the formatter; do not parse or translate preformatted English strings in the UI. The web copy catalog remains responsible for surrounding UI labels.

For a given country, month, and produce slug, changing display language must preserve seasonal status, country, origin codes, origin order, and calendar boundaries. Brazil already has national calendars; state-level seasonality or calendar corrections are outside scope.

Keep existing text limits, including 48 characters for seasonality badges and 90 for notes. Write concise translations and validate actual formatted combinations against the existing schema.

## Acceptance and verification

Add or extend runnable deterministic scenarios and assertions in `packages/evals` covering:

1. Brazil with an English browser resolves to Portuguese; non-Brazil with a Portuguese browser resolves to English.
2. Missing/invalid country and context timeout/failure use English without blocking startup. Context responses are not cached.
3. Catalog keys match; required user-facing paths use translated copy and interpolation works for Portuguese counts.
4. All scan rounds carry the resolved locale. Prompt templates are unchanged; prompt rendering changes only existing locale substitutions.
5. Representative Portuguese fixtures validate against the unchanged response schema, retaining canonical enums and produce slugs.
6. Every round accepts valid `insufficient_evidence` fixtures without a winner or fabricated traits. These cases exercise contracts and integration, not live model compliance.
7. Brazil-specific seasonality remains intact; changing display language preserves calculations. A non-Brazil country using English is not replaced with GB.
8. Winner/follow-up resolution remains stable when human-readable headlines change language.

Run focused existing contract/proxy/web tests, relevant deterministic evals, type checks, and the web build. Use browser journey checks with mocked context for both languages to inspect camera, draw, loading, result, flip, error, quota, and seasonality states. Verify Portuguese text wraps without obscuring controls and accessibility names use the selected language.

Do not run live evals. Explicitly report that model translation quality was not live-tested.

## Non-goals

No new flows, manual language picker, browser-language negotiation, persisted language preference, additional languages, regional pricing, schema revisions, prompt edits, calendar revisions, or deployment.

## Builder discretion

The builder may choose exact endpoint/module names, startup timeout, translation key organization, and focused test placement. Keep the changes within the architecture and acceptance criteria above. An implementation plan follows approval of this design.
