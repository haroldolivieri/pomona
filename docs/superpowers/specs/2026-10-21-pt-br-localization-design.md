# Preference-based Brazilian Portuguese

## Intent and agreed scope

Give users the existing Pomona experience in their preferred supported language: Brazilian Portuguese or British English. The user approved replacing the initial region-based language proposal with saved user choice, then browser language, then English. Geographic country independently controls seasonality. Keep grading behavior, model prompts, and the model output schema unchanged; add only a language selector to the existing camera screen.

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

Resolve display language in this order: a valid saved explicit choice, supported browser preferences from `Accept-Language`, then `en-GB`. Support `pt-BR` and `en-GB`; map Portuguese variants including `pt` and `pt-PT` to `pt-BR`, and English variants to `en-GB`. Respect quality weights, ignore entries with `q=0`, skip unsupported languages, and use English for a wildcard-only or malformed header. Country is never a language fallback.

Save explicit choice in a first-party `pomona_locale` cookie (one year, Path=/, SameSite=Lax, Secure in HTTPS), readable by both Worker and app. Allow only supported locale values; invalid cookies fall back to browser negotiation. Storage failure must not prevent changing language for the current page. No account/profile integration is required.

Run the existing Worker before serving HTML navigation responses, fetch the static shell through an assets binding, and inject allowlisted locale into HTML using `HTMLRewriter`. Set the HTML language and localized document metadata consistently. Initialize i18next synchronously from the embedded value before React mounts. Bundle both language catalogs so selection requires no additional network request. Do not introduce a context endpoint or blocking bootstrap fetch. This eliminates an extra network round trip; it does not promise zero processing overhead.

Keep JavaScript, CSS, images, and other immutable assets on the direct static-asset path. Configure routing for every supported HTML entry path, including `/` and direct index navigation. Do not accidentally intercept API calls or return the app shell for missing asset files. Local Vite startup uses a valid saved cookie, then `navigator.languages`, then English when edge data is absent.

Do not globally cache transformed preference-specific HTML under a shared key: use `Cache-Control: private, no-store` while retaining static-source and immutable-asset caching. Update the service worker to avoid storing or precaching personalized documents. For offline startup, use a separately cached neutral shell and a valid explicit cookie, then browser preferences, then English. Fresh online bootstrap data takes precedence over browser fallback. Do not cache country metadata, images, or scan results for this feature.

Add a compact accessible language select to the idle camera screen, labeled through the copy catalog. Choices use the self-names English and Português (Brasil), also stored in catalogs. Changing language updates i18next, the document language/metadata, and saved preference without a reload. Do not offer the selector during active scans or results; this prevents mixed-language model results mid-session. The next scan uses the selected locale on every round.

Keep shopper country separate. Cloudflare country remains authoritative for seasonality, with the existing locale fallback and GB default only when geographic data is unavailable. For example, an English-speaking user in Brazil gets Brazilian seasonal calculations and English labels; a Portuguese-speaking user in Britain gets British calculations and Portuguese labels. Do not add manual country overrides or infer current country from a language cookie.

## Copy extraction and translation

Reuse existing `i18next` and `react-i18next`; add no localization framework. Complete the English catalog and add a matching Brazilian Portuguese catalog. Extract all shipped user-facing literals, including results, flip instructions, ripeness targets, quota notices, crash recovery, loading text, camera errors, accessibility descriptions, image descriptions, and exposed tester controls.

Keep identifiers, logs, API enums, property names, and internal errors separate from translated text. Map client-visible transport and quota errors to translation keys; avoid rendering raw English exceptions as product copy. Preserve useful model-authored messages in the requested language.

Helpers and state transitions should use stable semantic values and presentation translations. Audit existing comparisons against English phrases such as `Buy it.` so translating a headline cannot change winner resolution or follow-up behavior. Preserve behavior with deterministic regression cases.

Use interpolation and locale-aware pluralization for counts, scores, and durations. Keep the Pomona name unchanged. English remains the runtime fallback for genuinely missing keys, but release gates must reject incomplete catalogs.

### Mandatory copy gate

Introduce a root `lint:copy` command and run it as a required CI/pre-merge check. Use ESLint with `eslint-plugin-i18next` in broad literal-checking mode rather than JSX-text-only mode. Cover JSX text, accessibility and presentation attributes, template strings, label objects, fallback messages, and user-facing helper/state code. Allow explicit machine values such as schema enums, identifiers, routes, CSS values, logs, and translation keys. Keep exceptions narrow and documented; do not exempt whole product directories or all constructor/error calls.

Add a deterministic catalog validator to the same gate. It must verify matching semantic keys and value shapes across every registered language, matching interpolation placeholders, valid plural variants for each locale, and that referenced translation keys exist. Validate the dedicated seasonality catalogs as well as the web catalogs. Generated country/month display names may use locale-aware platform APIs; handwritten product messages must come from copy files. Disallow inline English `defaultValue` fallbacks and translation components containing uncatalogued copy.

JSX lint alone does not catch every string that reaches a user. Include HTML title/description and manifest copy in the extraction audit and require those sources to use catalog-backed generation or edge formatting. Test the gate against deliberately invalid snippets and catalogs: JSX text, `aria-label`, helper fallback, missing Portuguese key, unknown key, mismatched placeholder, and missing locale-required plural form must fail. Approved machine literals must pass. Static checks cannot prove a translation is linguistically correct.

## Model boundary

Pass the resolved display locale in the existing scan request field for rounds 1, 2, and 3, including retries and follow-ups. Do not add fields or change defaults/enums in the model schema. Do not edit prompt templates, system instructions, repair instructions, grading rules, or text limits. Rendered prompts may differ only where the existing locale parameter is substituted.

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

1. A saved choice overrides browser preferences; otherwise supported browser preferences determine language regardless of country. Test weighted preferences, Portuguese/English variants, unsupported languages, wildcards, `q=0`, invalid cookies, and malformed input.
2. Initial HTML supplies locale without a bootstrap request; personalized HTML is not shared or stored by the service worker. Offline/local startup uses saved choice and browser preferences. The selector persists language across reloads, updates document metadata, and remains usable when storage is unavailable.
3. The required copy gate rejects hardcoded user-facing literals, missing/unknown translation keys, placeholder mismatches, and invalid plural coverage. Required user-facing paths use translated copy and Portuguese counts interpolate correctly.
4. All scan rounds carry the resolved locale. Prompt templates are unchanged; prompt rendering changes only existing locale substitutions.
5. Representative Portuguese fixtures validate against the unchanged response schema, retaining canonical enums and produce slugs.
6. Every round accepts valid `insufficient_evidence` fixtures without a winner or fabricated traits. These cases exercise contracts and integration, not live model compliance.
7. Brazil-specific seasonality remains intact; changing display language preserves calculations. A non-Brazil country using English is not replaced with GB.
8. Winner/follow-up resolution remains stable when human-readable headlines change language.

Run focused existing contract/proxy/web tests, relevant deterministic evals, type checks, and the web build. Use browser journey checks with mocked HTML locale data for both languages to inspect camera, draw, loading, result, flip, error, quota, and seasonality states. Verify Portuguese text wraps without obscuring controls and accessibility names use the selected language.

Do not run live evals. Explicitly report that model translation quality was not live-tested.

## Non-goals

No new scan flows, additional languages, country domains, language-specific URL routes, account preference synchronization, manual country picker, regional pricing, schema revisions, prompt edits, calendar revisions, or deployment.

## Builder discretion

The builder may choose exact module names, embedded-data representation, narrow lint exceptions, translation key organization, and focused test placement. Keep the changes within the architecture and acceptance criteria above. An implementation plan follows approval of this design.

## Architecture references

- [Cloudflare SPA shell with bootstrap data](https://developers.cloudflare.com/workers/examples/spa-shell/)
- [Cloudflare static assets Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [i18next ESLint literal rule](https://github.com/edvardchen/eslint-plugin-i18next/blob/main/docs/rules/no-literal-string.md)
