# Produce Seasonality & Optional Origin Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach a deterministic, static seasonality object (plus tappable origin options) to every successful scan response and show it under the result subtitle, with zero change to the AI prompt or model schema.

**Architecture:** A pure `lookupProduceSeasonality` engine and static dataset live in `@pomona/contract`. The proxy calls it after verification (Cloudflare `cf.country`/`cf.latitude`, falling back to `locale`) and attaches `seasonality` to `ScanResponse`. The mock client calls the same function. `ResultStage` renders a new `SeasonalityStrip` component with a horizontally scrollable origin pill row.

**Tech Stack:** TypeScript, zod, Vitest, Hono (Cloudflare Workers), React + react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-17-produce-seasonality-design.md`

## Global Constraints

- `ScanResponseModelSchema` and `apps/proxy/src/prompts/v1.ts` MUST NOT change.
- `seasonality` on `ScanResponseSchema` is `SeasonalityInfoSchema.nullable().optional()`; existing fixtures must still validate.
- Zones: `BR`, `EU_NORTH_WEST`, `MEDITERRANEAN`, `NA_TEMPERATE`, `SOUTH_TEMPERATE`, `TROPICAL_EQUATORIAL`.
- Origin codes: `BR ES PE CL MX ZA MA CR IT US NZ IN EG CO`.
- Statuses: `peak | in_season | off_season | imported_year_round`.
- Copy limits: `badgeText` ≤ 48 chars, `noteText` ≤ 90 chars, `origins` ≤ 8.
- Unknown produce slug → `seasonality: null`; UI renders nothing.
- A shopper in country X never sees X in their own origin pills.
- Origin pill strip: `overflowX: auto`, `touchAction: "pan-x"`, stops touch/pointer propagation so the bottom sheet does not drag.
- Months are 1..12; server month is `new Date().getUTCMonth() + 1`.

## Review Focus

- Locale without region (`"en"`, `""`) and no `cf` data: falls back to `GB` / `EU_NORTH_WEST`, never throws.
- Cloudflare `country` of `"XX"`/`"T1"` or latitude as a string (`"-23.5"`): handled like missing/numeric.
- Slug variants (`"Hass Avocado"`, `"strawberries"`, `"galia_melon"`): normalise to the canonical key.
- Year-wrapping windows (mango BR Oct–Jan): December and January both count as peak.
- Shopper in a producer country scanning a locally-grown crop out of season: `off_season`, not `imported_year_round`.
- Switching to a different produce type or `RESET` clears the selected origin pill.

---

## File Structure

- Create `packages/contract/src/seasonality.ts` — zones, origin metadata, dataset, `normalizeProduceSlug`, `resolveShopperRegion`, `lookupProduceSeasonality`.
- Modify `packages/contract/src/schemas.ts` — `SeasonalityStatusSchema`, `OriginSeasonOptionSchema`, `SeasonalityInfoSchema`, `ScanResponseSchema.seasonality`, types.
- Modify `packages/contract/src/index.ts` — export `./seasonality`.
- Modify `apps/proxy/src/index.ts` — attach seasonality after a successful scan.
- Modify `apps/web/src/lib/mock-api-client.ts` — attach seasonality to mock responses.
- Create `apps/web/src/components/SeasonalityStrip.tsx` — badge, note, scrollable origin pills.
- Modify `apps/web/src/components/ResultStage.tsx` — render strip below `subtitle`, own selected-origin state.
- Modify `apps/web/src/i18n/locales/en.json` — `result.originLabel`, `result.importedFrom`.
- Tests: `packages/contract/test/seasonality.test.ts`, `packages/contract/test/schemas.test.ts`, `apps/proxy/test/routes.integration.test.ts`, `apps/web/test/components/SeasonalityStrip.test.tsx`, `apps/web/test/app-states.integration.test.tsx`.

---

### Task 1: Seasonality engine and dataset

**Files:**
- Create: `packages/contract/src/seasonality.ts`
- Modify: `packages/contract/src/index.ts`
- Test: `packages/contract/test/seasonality.test.ts`

**Interfaces:**
- Produces:
  - `type SeasonalityZone`, `type OriginCode`, `type SeasonalityStatus = "peak" | "in_season" | "off_season" | "imported_year_round"`
  - `normalizeProduceSlug(raw: string): string`
  - `resolveShopperRegion(input: { cfCountry?: string | null; cfLatitude?: string | number | null; locale?: string | null }): { countryCode: string; zone: SeasonalityZone }`
  - `interface OriginSeasonOption { code: string; name: string; flag: string; status: SeasonalityStatus; peakWindowLabel: string; badgeText: string; noteText: string }`
  - `interface SeasonalityInfo { produceSlug: string; month: number; shopperCountry: string; shopperZone: string; status: SeasonalityStatus; peakWindowLabel: string; badgeText: string; noteText: string; origins: OriginSeasonOption[] }`
  - `lookupProduceSeasonality(produceType: string, region: Parameters<typeof resolveShopperRegion>[0], month: number): SeasonalityInfo | null`

- [ ] **Step 1: Write the failing tests** in `seasonality.test.ts`:
  - `normalizeProduceSlug("Hass Avocado") === "avocado"`, `("strawberries") === "strawberry"`, `("galia_melon") === "melon"`, `("pink lady apple") === "apple"`.
  - `resolveShopperRegion({ cfCountry: "BR" })` → `{ countryCode: "BR", zone: "BR" }`; `({ cfCountry: "XX", locale: "en-GB" })` → `GB`/`EU_NORTH_WEST`; `({ locale: "en" })` → `GB`/`EU_NORTH_WEST`; `({ cfCountry: "ZZ", cfLatitude: "-23.5" })` → zone `TROPICAL_EQUATORIAL`; `({ cfCountry: "ZZ", cfLatitude: -40 })` → `SOUTH_TEMPERATE`.
  - `lookupProduceSeasonality("mango", { cfCountry: "BR" }, 12)`: status `peak`, `peakWindowLabel === "Oct–Jan"`; same with month `1` is `peak`; month `6` is not `peak`.
  - `lookupProduceSeasonality("mango", { cfCountry: "GB" }, 11)`: status `imported_year_round`; `origins` contains `BR` with status `peak`; no origin has code `GB`.
  - `lookupProduceSeasonality("strawberry", { cfCountry: "GB" }, 11)`: status `off_season`, `peakWindowLabel === "May–Aug"`; month `6` → `peak`.
  - `lookupProduceSeasonality("mango", { cfCountry: "BR" }, 11).origins` has no `BR` entry.
  - `lookupProduceSeasonality("dragonfruit_xyz", { cfCountry: "GB" }, 5) === null`.
  - Every returned `badgeText.length <= 48`, `noteText.length <= 90`, `origins.length <= 8` across all dataset slugs × all 12 months × the six zone representatives (`BR`, `GB`, `ES`, `US`, `CL`, `IN`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pomona/contract test -- seasonality`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `seasonality.ts` and export it from `index.ts`.**
  - Dataset record shape per spec §3.2 (`ZoneCalendar { localCrop, peakMonths, inSeasonMonths }` per zone, optional `originOverrides`, `commonOrigins`). Cover these 42 slugs: watermelon, melon, cantaloupe, honeydew, mango, papaya, pineapple, banana, avocado, passion_fruit, guava, strawberry, blueberry, raspberry, blackberry, cherry, peach, nectarine, plum, apricot, apple, pear, grape, kiwi, fig, pomegranate, persimmon, orange, lemon, lime, grapefruit, mandarin, tomato, bell_pepper, cucumber, zucchini, eggplant, broccoli, cauliflower, asparagus, corn, lettuce. Source months from CEAGESP (BR), EUFIC/DEFRA (EU/MED), USDA SNAP-Ed (NA), and Southern Hemisphere/FAO export calendars; set `localCrop: false` where the zone has no commercial production.
  - Status rule: `localCrop && peakMonths.includes(m)` → `peak`; `localCrop && inSeasonMonths.includes(m)` → `in_season`; `localCrop` otherwise → `off_season`; `!localCrop` → `imported_year_round`.
  - Origin options: `commonOrigins` minus the shopper's own country; an origin with an `originOverrides` entry uses it, otherwise its zone's calendar. Labels via a shared month-window formatter that handles year wrap (`Oct–Jan`) and 12 months (`Year-round`).
  - `badgeText`/`noteText` copy, e.g. `"Peak season (Oct–Jan)"`, `"Off-season locally (Peak: May–Aug)"`, `"Imported year-round"`, `"Peak in Brazil (Oct–Jan)"`; off-season note `"Even the top pick may be less sweet."`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pomona/contract test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contract/src/seasonality.ts packages/contract/src/index.ts packages/contract/test/seasonality.test.ts
git commit -m "feat(contract): add static produce seasonality engine"
```

---

### Task 2: Contract schema field

**Files:**
- Modify: `packages/contract/src/schemas.ts`
- Test: `packages/contract/test/schemas.test.ts`

**Interfaces:**
- Consumes: `SeasonalityInfo` shape from Task 1.
- Produces: `SeasonalityStatusSchema`, `OriginSeasonOptionSchema`, `SeasonalityInfoSchema` (zod, matching spec §3.3), types `SeasonalityInfoSchemaType` is NOT needed; `ScanResponse["seasonality"]` is `SeasonalityInfo | null | undefined`.

- [ ] **Step 1: Write failing tests** in `schemas.test.ts`: an existing valid `ScanResponse` without `seasonality` still parses; one with `seasonality: null` parses; one with `lookupProduceSeasonality("mango", { cfCountry: "GB" }, 11)` output parses; one with `badgeText` of 49 chars fails; `ScanResponseModelSchema` still rejects/ignores `seasonality` (the key is absent from its shape: `"seasonality" in ScanResponseModelSchema.shape === false`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pomona/contract test -- schemas`
Expected: FAIL on the new field cases.

- [ ] **Step 3: Add the three schemas and `seasonality: SeasonalityInfoSchema.nullable().optional()` to `ScanResponseSchema` only.** Remove the duplicate interface in `seasonality.ts` by deriving `SeasonalityInfo`/`OriginSeasonOption` types from the schemas (`z.infer`) if that avoids a circular import; otherwise keep interfaces identical.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pomona/contract test && pnpm --filter @pomona/contract typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contract
git commit -m "feat(contract): add optional seasonality to ScanResponse"
```

---

### Task 3: Proxy attaches seasonality

**Files:**
- Modify: `apps/proxy/src/index.ts` (around the `runVerifiedVisionScan` success path, lines ~273-294)
- Test: `apps/proxy/test/routes.integration.test.ts`

**Interfaces:**
- Consumes: `lookupProduceSeasonality`, `ScanResponse.seasonality`.

- [ ] **Step 1: Write failing tests** in `routes.integration.test.ts` using the existing mock adapter pattern for a watermelon `ok` response:
  - Request with `locale: "pt-BR"` and no `cf` → `response.seasonality.shopperCountry === "BR"`.
  - Request with `locale: "en-GB"` → `shopperCountry === "GB"`.
  - A non-`ok` scan (`no_produce`) → `seasonality` is `null` or absent.
  - Unknown produce type → `seasonality` is `null`.
  - Adapter prompt input is unchanged: assert the system prompt passed to the adapter contains no `"seasonality"` substring.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pomona/proxy test -- routes`
Expected: FAIL on seasonality assertions.

- [ ] **Step 3: In `index.ts`, after `scanOutcome`, when `status === "ok"` and `produce` exists, read `(c.req.raw as { cf?: { country?: string; latitude?: string } }).cf`, call `lookupProduceSeasonality(produce.type, { cfCountry, cfLatitude, locale: scanRequest.locale }, new Date().getUTCMonth() + 1)`, and return `{ ...scanOutcome.response, seasonality }`.** Do not touch `verify-response.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pomona/proxy test && pnpm --filter @pomona/proxy typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/proxy
git commit -m "feat(proxy): attach deterministic seasonality to scan responses"
```

---

### Task 4: Mock client

**Files:**
- Modify: `apps/web/src/lib/mock-api-client.ts`
- Test: `apps/web/test/debug-mock-mode.test.tsx` (existing "contract-valid multi-round responses" test)

**Interfaces:**
- Consumes: `lookupProduceSeasonality`.

- [ ] **Step 1: Extend the existing mock test** so each of the rounds 1–3 responses has `seasonality?.produceSlug === "watermelon"` and still passes `ScanResponseSchema.parse`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pomona/web test -- debug-mock-mode`
Expected: FAIL.

- [ ] **Step 3: In each `status: "ok"` mock response add `seasonality: lookupProduceSeasonality("watermelon", { locale: request.locale }, new Date().getMonth() + 1)`.**

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pomona/web test -- debug-mock-mode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/mock-api-client.ts apps/web/test/debug-mock-mode.test.tsx
git commit -m "feat(web): include seasonality in mock scan responses"
```

---

### Task 5: SeasonalityStrip UI in ResultStage

**Files:**
- Create: `apps/web/src/components/SeasonalityStrip.tsx`
- Modify: `apps/web/src/components/ResultStage.tsx` (insert after the `<p>{subtitle}</p>` block, ~line 564)
- Modify: `apps/web/src/i18n/locales/en.json` (`result.originLabel: "Origin:"`, `result.importedFrom: "Imported from?"`)
- Test: `apps/web/test/components/SeasonalityStrip.test.tsx`, `apps/web/test/app-states.integration.test.tsx`

**Interfaces:**
- Produces: `SeasonalityStrip: React.FC<{ seasonality: SeasonalityInfo; selectedOriginCode: string | null; onSelectOrigin: (code: string | null) => void }>`
- Consumes: `SeasonalityInfo` from `@pomona/contract`.

- [ ] **Step 1: Write failing tests** in `SeasonalityStrip.test.tsx` (use `data-testid` values `seasonality-badge`, `seasonality-note`, `origin-pills`, `origin-pill-<CODE>`):
  - `peak` status renders badge text from `seasonality.badgeText`.
  - `off_season` and `imported_year_round` render the origin pill row; `peak` with no selected origin does not render it.
  - Clicking `origin-pill-BR` calls `onSelectOrigin("BR")`; clicking the active pill calls `onSelectOrigin(null)`.
  - With `selectedOriginCode="BR"` the badge/note show the BR option's `badgeText`/`noteText`.
  - `origin-pills` has style `overflow-x: auto` and `touch-action: pan-x`; a `touchstart` on it does not bubble to a parent handler (assert with a parent `onTouchStart` spy).
  
  In `app-states.integration.test.tsx` add: after the S4 result renders with mock data, `seasonality-badge` exists; after clicking RESET (`close-button`) and re-scanning, no pill is pre-selected.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pomona/web test -- SeasonalityStrip app-states`
Expected: FAIL (component missing).

- [ ] **Step 3: Implement `SeasonalityStrip`** with badge colours from spec §5.1 (peak/in_season `#DDF3E4`/`#166534` 🌿; off_season `#FEF3C7`/`#92400E` 🍂; imported `#E8E5DC`/`#494843` 🌍). In `ResultStage`, add `const [selectedOriginCode, setSelectedOriginCode] = useState<string | null>(null)` and a `useEffect` resetting it to `null` when `lastResponse?.produce?.type` changes; render `<SeasonalityStrip>` only when `lastResponse.seasonality` is truthy. Hooks must stay above the early `return` at line 53.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pomona/web test && pnpm --filter @pomona/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): show seasonality badge and scrollable origin pills on result sheet"
```

---

### Task 6: Whole-repo verification

- [ ] **Step 1:** Run `pnpm -r typecheck && pnpm -r test` from the worktree root. Expected: all PASS (baseline was web 42, evals 14).
- [ ] **Step 2:** Confirm the prompt is untouched: `git diff main -- apps/proxy/src/prompts packages/contract/src/schemas.ts | grep -n "ScanResponseModelSchema"` shows no changes to that schema.
- [ ] **Step 3:** Commit any fixes; no other commit needed.
