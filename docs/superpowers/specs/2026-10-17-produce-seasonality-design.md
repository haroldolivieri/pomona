# Produce Seasonality & Optional Origin Lookup — Design Spec

**Date:** 2026-10-17  
**Status:** Ready for User Approval (Builder Check Passed)

---

## 1. Intent & Why

When shopping for produce, even the highest-scoring item on the shelf (e.g. a 6.8/10 watermelon or peach in November) might be mealy or lack sweetness simply because it is out of harvest season. Conversely, imported produce in a northern supermarket (such as a Brazilian mango in London in November) may actually be in peak harvest at its origin.

At the same time, asking the vision LLM to reason about regional harvest calendars or origin countries bloats the prompt and increases hallucination risk.

This design adds a **100% deterministic, static Produce Seasonality & Origin Lookup** (`@pomona/contract`) that enriches scan results without adding a single token or field to the AI model prompt (`v1.ts`) or `ScanResponseModelSchema`.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. **Zero AI Prompt / Model Schema Impact:** `ScanResponseModelSchema` and `apps/proxy/src/prompts/v1.ts` remain 100% untouched. The LLM only outputs `produce.type`, `produce.displayName`, and visual ripeness grading as it does today.
2. **Worldwide Coverage via Climate/Market Zones + Country Overrides:**
   - Automatic detection of the shopper's location via Cloudflare edge metadata (`req.cf.country` and `req.cf.latitude`) in `apps/proxy`, with fallback to `ScanRequest.locale` (e.g. `"en-GB"` -> `"GB"`, `"pt-BR"` -> `"BR"`) when `req.cf` is absent (such as local dev).
   - Maps any country or latitude worldwide into one of 6 agricultural zones (`BR`, `EU_NORTH_WEST`, `MEDITERRANEAN`, `NA_TEMPERATE`, `SOUTH_TEMPERATE`, `TROPICAL_EQUATORIAL`) while supporting explicit exporter country calendars (`BR`, `PE`, `ES`, `CL`, `MX`, `ZA`, `MA`, `CR`, `NZ`, `US`, `IT`, `IN`, `CO`, `EC`, `EG`).
3. **Curated Static Dataset (`@pomona/contract`):**
   - Covers ~45 common supermarket fruits and vegetables compiled from public institutional sources: **CEAGESP / Embrapa** (Brazil), **EUFIC / DEFRA** (Europe & UK), **USDA SNAP-Ed** (North America), and **Southern Hemisphere / FAO export calendars**.
   - Includes a deterministic slug normalizer (`normalizeProduceSlug`) that maps common AI variations/plurals/varieties (e.g., `"hass_avocado"` -> `"avocado"`, `"strawberries"` -> `"strawberry"`, `"galia_melon"` -> `"melon"`, `"pink_lady_apple"` -> `"apple"`) to canonical keys.
   - If an exotic/unknown produce slug is not in the table, `seasonality` resolves to `null` and the UI gracefully omits the seasonality row.
4. **Option B Inline UI + Horizontally Scrollable Origin Pills (`ResultStage.tsx`):**
   - Renders directly beneath the confidence `subtitle` on the result bottom sheet across all result phases (`S4_InitialResult`, `S5B1_RunnerUpBeaten`, `S5B2_RunnerUpTookLead`, `S7A_FirstPickWonFinal`, `S7B_FirstPickLostFinal`).
   - Shows a compact status badge (`Peak season`, `In season`, `Off-season locally`, or `Imported year-round`) + a short 1-line expectation note (e.g., *"Even the top pick may be less sweet"* when off-season, or *"In peak harvest in Brazil (Oct–Jan)"* when an origin is selected).
   - When the produce has known export origins and is either not grown locally (`Imported year-round`) or currently `off_season` locally (or whenever exporter origins differ from the shopper's country), renders a single-line horizontally scrollable row of origin pills (`overflow-x: auto`, `white-space: nowrap`, hidden scrollbar) so the shopper can tap the origin country printed on the supermarket tag (e.g. `🇧🇷 Brazil`, `🇵🇪 Peru`, `🇪🇸 Spain`) and immediately see that origin's harvest status for the current month with zero network calls.

### Non-Goals
- External database infrastructure (no SQL/KV tables or third-party runtime API calls).
- Asking the AI vision model to read tiny country-of-origin text on supermarket stickers.
- Changing candidate ripeness scores based on seasonality (visual grading remains purely based on the photo; seasonality sets expectations alongside the score).

### Anti-Goals
- **No AI prompt changes:** Never inject calendar or region rules into the LLM system/user prompt.
- **No accidental bottom-sheet drag when scrolling origin pills:** Touch/pointer events on the horizontal origin pill strip must stop propagation or isolate horizontal scrolling (`touchAction: "pan-x"`, `onTouchStart={(e) => e.stopPropagation()}`) so swiping the pills horizontally never drags the bottom sheet vertically.
- **No breaking changes to existing contract consumers:** The `seasonality` field on `ScanResponseSchema` is optional/nullable (`SeasonalityInfoSchema.nullable().optional()`) so existing test fixtures and evals remain 100% valid.

---

## 3. Data Model & Shared Seasonality Engine (`@pomona/contract`)

### 3.1 Zones & Exporter Regions (`packages/contract/src/seasonality.ts`)

1. **Agricultural Zones (`SeasonalityZone`):**
   - `"BR"` — Brazil & Tropical South America (CEAGESP baseline)
   - `"EU_NORTH_WEST"` — UK, Ireland, Northern/Western/Central Europe (DEFRA / EUFIC Temperate)
   - `"MEDITERRANEAN"` — Spain, Italy, Portugal, Greece, Morocco, Turkey (EUFIC Mediterranean)
   - `"NA_TEMPERATE"` — USA, Canada (USDA SNAP-Ed baseline)
   - `"SOUTH_TEMPERATE"` — Chile, Argentina, Uruguay, South Africa, Australia, New Zealand (Southern Hemisphere Temperate)
   - `"TROPICAL_EQUATORIAL"` — Central America, Caribbean, Andean/Equatorial Tropics (`PE`, `EC`, `CO`, `CR`), Sub-Saharan Africa, South & Southeast Asia (`IN`, `TH`, `PH`, `VN`), and fallback for `|latitude| <= 23.5°`

2. **Exporter Country Calendars (`OriginCode`):**
   - Supported selectable origin codes with flag, display name, and country-specific or zone-mapped harvest months:
     - `"BR"` (`🇧🇷 Brazil`)
     - `"ES"` (`🇪🇸 Spain`)
     - `"PE"` (`🇵🇪 Peru`)
     - `"CL"` (`🇨🇱 Chile`)
     - `"MX"` (`🇲🇽 Mexico`)
     - `"ZA"` (`🇿🇦 South Africa`)
     - `"MA"` (`🇲🇦 Morocco`)
     - `"CR"` (`🇨🇷 Costa Rica`)
     - `"IT"` (`🇮🇹 Italy`)
     - `"US"` (`🇺🇸 USA`)
     - `"NZ"` (`🇳🇿 New Zealand`)
     - `"IN"` (`🇮🇳 India`)
     - `"EG"` (`🇪🇬 Egypt`)
     - `"CO"` (`🇨🇴 Colombia`)

3. **Region Resolution (`resolveShopperRegion`):**
   ```ts
   export interface ShopperRegionInput {
     cfCountry?: string | null;   // e.g. "GB", "BR", "US" from Cloudflare req.cf.country
     cfLatitude?: string | number | null; // e.g. "51.5" or -23.5 from req.cf.latitude
     locale?: string | null;      // e.g. "en-GB", "pt-BR", "en-US" from ScanRequest.locale
   }

   export interface ResolvedShopperRegion {
     countryCode: string;         // ISO-2 uppercase e.g. "GB", "BR", "US" (defaults to "GB" if unknown)
     zone: SeasonalityZone;
   }
   ```
   - **Resolution priority:**
     1. If `cfCountry` is a valid 2-letter ISO code (excluding `"XX"` / `"T1"`), use `cfCountry.toUpperCase()`.
     2. Otherwise, parse region subtag from `locale` (e.g., `"pt-BR"` -> `"BR"`, `"en-US"` -> `"US"`, `"en-GB"` -> `"GB"`).
     3. Map `countryCode` to its `SeasonalityZone` via an explicit ISO-2 country lookup table covering Europe, Americas, Oceania, Asia, and Africa; if a country code is not in the explicit lookup table, use `cfLatitude`:
        - `|lat| <= 23.5` -> `"TROPICAL_EQUATORIAL"`
        - `lat < -23.5` -> `"SOUTH_TEMPERATE"`
        - `lat > 23.5` -> `"EU_NORTH_WEST"` (or `"NA_TEMPERATE"`).

### 3.2 Seasonality Entry Structure

For each canonical produce type (e.g., `"watermelon"`, `"mango"`, `"avocado"`, `"strawberry"`, `"peach"`, `"pineapple"`, `"banana"`, `"apple"`, `"grape"`, `"orange"`, `"lemon"`, `"lime"`, `"blueberry"`, `"raspberry"`, `"blackberry"`, `"cherry"`, `"plum"`, `"nectarine"`, `"apricot"`, `"pear"`, `"kiwi"`, `"papaya"`, `"passion_fruit"`, `"guava"`, `"pomegranate"`, `"fig"`, `"persimmon"`, `"grapefruit"`, `"mandarin"`, `"cantaloupe"`, `"honeydew"`, `"melon"`, `"tomato"`, `"bell_pepper"`, `"cucumber"`, `"zucchini"`, `"eggplant"`, `"broccoli"`, `"cauliflower"`, `"asparagus"`, `"Savoie/avocado/etc."` — 42+ core items):

```ts
export interface ZoneCalendar {
  /** Whether this produce is commercially grown as a local seasonal crop in this zone */
  localCrop: boolean;
  /** Months (1..12) when local or regional harvest is at peak quality/volume */
  peakMonths: number[];
  /** Additional months (1..12) when local harvest is available (shoulder season) */
  inSeasonMonths: number[];
}

export interface ProduceSeasonalityRecord {
  slug: string;
  /** Calendar per global zone */
  zones: Record<SeasonalityZone, ZoneCalendar>;
  /** Country-specific harvest calendar overrides for major exporter countries (e.g. PE, CL, MX, ZA, MA, ES, BR) */
  originOverrides?: Partial<Record<OriginCode, { peakMonths: number[]; inSeasonMonths: number[] }>>;
  /** Top exporter countries commonly seen on supermarket labels for this produce */
  commonOrigins: OriginCode[];
}
```

### 3.3 Contract Schema (`packages/contract/src/schemas.ts`)

Add `SeasonalityInfoSchema` (injected by the server on `ScanResponse`, never in `ScanResponseModelSchema`):

```ts
export const SeasonalityStatusSchema = z.enum([
  "peak",
  "in_season",
  "off_season",
  "imported_year_round",
]);

export const OriginSeasonOptionSchema = z.object({
  code: z.string(), // e.g. "BR", "PE", "ES"
  name: z.string(), // e.g. "Brazil", "Peru", "Spain"
  flag: z.string(), // e.g. "🇧🇷"
  status: SeasonalityStatusSchema, // status in `month` for this origin
  peakWindowLabel: z.string(), // e.g. "Oct–Jan", "Year-round"
  badgeText: z.string().max(48), // e.g. "Peak in Brazil (Oct–Jan)"
  noteText: z.string().max(90), // e.g. "In peak harvest in Brazil right now — expect sweet fruit."
});

export const SeasonalityInfoSchema = z.object({
  produceSlug: z.string(), // canonical slug e.g. "mango", "watermelon"
  month: z.number().int().min(1).max(12),
  shopperCountry: z.string(), // e.g. "GB", "BR", "US"
  shopperZone: z.string(), // e.g. "EU_NORTH_WEST", "BR"
  status: SeasonalityStatusSchema,
  peakWindowLabel: z.string(), // e.g. "Jun–Aug" or "Year-round"
  badgeText: z.string().max(48), // e.g. "Off-season locally (Peak: Jun–Aug)"
  noteText: z.string().max(90), // e.g. "Even the top pick may be less sweet."
  origins: z.array(OriginSeasonOptionSchema).max(8), // pre-evaluated origin options for instant 1-tap switching
});
```

And on `ScanResponseSchema`:
```ts
seasonality: SeasonalityInfoSchema.nullable().optional(),
```

> **Why pre-evaluate `origins` inside `SeasonalityInfo` (and also export `lookupProduceSeasonality` from `@pomona/contract`)?**
> Pre-computing the `origins` array for the current month means the UI (`ResultStage.tsx`) has every origin pill's `flag`, `name`, `status`, `badgeText`, and `noteText` ready to render and toggle with a single `useState<string | null>(null)`—and exporting `lookupProduceSeasonality(produceType, regionInput, month)` from `@pomona/contract` allows both the proxy (`verifyAndResolveScanResponse` / `index.ts`) and the mock client (`mock-api-client.ts`) to share the exact same deterministic function.

---

## 4. Server & Mock Client Integration

### 4.1 Proxy (`apps/proxy/src/index.ts` & `verify-response.ts`)
- In `verifyAndResolveScanResponse` (or right after it in `apps/proxy/src/index.ts`), when `status === "ok"` and `produce?.type` is present:
  - Extract `cfCountry = (c.req.raw as any)?.cf?.country` and `cfLatitude = (c.req.raw as any)?.cf?.latitude`.
  - Pass `regionInput: { cfCountry, cfLatitude, locale: scanRequest.locale }` and `month: new Date().getUTCMonth() + 1` into `lookupProduceSeasonality(produce.type, regionInput, month)`.
  - Attach the resulting `SeasonalityInfo | null` to `scanResponse.seasonality`.
- For non-`"ok"` responses (`no_produce`, `unclear_photo`, `multiple_types`, `analysis_failed`, `rate_limited`), `seasonality` is `null`.

### 4.2 Mock Client (`apps/web/src/lib/mock-api-client.ts`)
- Calls `lookupProduceSeasonality("watermelon", { locale: request.locale }, new Date().getMonth() + 1)` so local development and Playwright E2E tests receive realistic seasonality data out of the box.

---

## 5. UI Design in `ResultStage.tsx` (Option B + Scrollable Origin Pills)

### 5.1 Placement & Visual Hierarchy
Inside `ResultStage.tsx`, directly inside the Eyebrow / Headline / Subtitle block (right below `<p>{subtitle}</p>` and above the Score Progress Bar):

1. **When `seasonality` is present:**
   - Maintain local state `const [selectedOriginCode, setSelectedOriginCode] = useState<string | null>(null);` (resetting whenever `lastResponse?.produce?.type` changes).
   - Determine the active display data:
     - If `selectedOriginCode` matches an item in `seasonality.origins`, display that origin's `status`, `badgeText`, and `noteText`.
     - Otherwise, display the default local `seasonality.status`, `seasonality.badgeText`, and `seasonality.noteText`.
2. **Status Badge Styling:**
   - `"peak"` / `"in_season"`: Soft green pill (`backgroundColor: "#DDF3E4"`, `color: "#166534"`) with `🌿` icon.
   - `"off_season"`: Warm amber pill (`backgroundColor: "#FEF3C7"`, `color: "#92400E"`) with `🍂` icon.
   - `"imported_year_round"`: Neutral warm stone pill (`backgroundColor: "#E8E5DC"`, `color: "#494843"`) with `🌍` icon.
   - Rendered inline with `noteText` (`fontSize: "11.5px"`, `color: "var(--text-muted)"`).
3. **Horizontally Scrollable Origin Pill Strip:**
   - Shown when `seasonality.origins.length > 0` and (`seasonality.status === "off_season"` or `seasonality.status === "imported_year_round"` or `selectedOriginCode !== null`).
   - Layout:
     - Outer row with a compact label (`"Origin:"` / `"Imported from?"`) + a horizontally scrollable flex container (`display: "flex"`, `gap: "6px"`, `overflowX: "auto"`, `whiteSpace: "nowrap"`, `scrollbarWidth: "none"`, `WebkitOverflowScrolling: "touch"`, `touchAction: "pan-x"`).
     - `onTouchStart`, `onTouchMove`, and `onPointerDown` call `e.stopPropagation()` so horizontal swipes or taps on origin pills never trigger the bottom sheet vertical drag handler.
   - Tapping an active origin pill toggles it back to `null` (returning to the shopper's local view); tapping another origin pill selects it immediately.

---

## 6. Decisions Made by Builder (Defaults to Note)
- **Month Determination:** Uses current UTC month (`new Date().getUTCMonth() + 1`) on the server (with an optional override parameter in `lookupProduceSeasonality` for deterministic unit tests).
- **Origin List Filtering:** If the shopper is already in `"BR"` (Brazil), `"BR"` is automatically excluded from the `origins` pill list so a shopper in Brazil isn't asked if their local fruit is imported from Brazil.
- **Persistence Across Rounds 1 -> 2 -> 3:** If the user selects an origin pill in Round 1 (e.g. `🇧🇷 Brazil`) and then flips the fruit for Round 2/3, `ResultStage` keeps `selectedOriginCode` unless the session resets (`RESET`), so their selected origin context isn't lost mid-comparison.
