/**
 * Deterministic produce seasonality engine.
 *
 * Static calendars compiled from public institutional sources (CEAGESP/Embrapa for Brazil,
 * EUFIC/DEFRA for Europe & UK, USDA SNAP-Ed for North America, Southern Hemisphere/FAO export
 * calendars). Month windows are approximate market-availability windows, not agronomic truth.
 * Never consumed by the LLM: it is attached server-side after a scan.
 */

import type { OriginSeasonOption, SeasonalityInfo, SeasonalityStatus } from "./schemas";

export type SeasonalityZone =
  | "BR"
  | "EU_NORTH_WEST"
  | "MEDITERRANEAN"
  | "NA_TEMPERATE"
  | "SOUTH_TEMPERATE"
  | "TROPICAL_EQUATORIAL";

export type OriginCode =
  | "BR"
  | "ES"
  | "PE"
  | "CL"
  | "MX"
  | "ZA"
  | "MA"
  | "CR"
  | "IT"
  | "US"
  | "NZ"
  | "IN"
  | "EG"
  | "CO";

export interface ShopperRegionInput {
  cfCountry?: string | null;
  cfLatitude?: string | number | null;
  locale?: string | null;
}

export interface ResolvedShopperRegion {
  countryCode: string;
  zone: SeasonalityZone;
}

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

const ORIGINS: Record<OriginCode, { name: string; flag: string; zone: SeasonalityZone }> = {
  BR: { name: "Brazil", flag: "🇧🇷", zone: "BR" },
  ES: { name: "Spain", flag: "🇪🇸", zone: "MEDITERRANEAN" },
  PE: { name: "Peru", flag: "🇵🇪", zone: "TROPICAL_EQUATORIAL" },
  CL: { name: "Chile", flag: "🇨🇱", zone: "SOUTH_TEMPERATE" },
  MX: { name: "Mexico", flag: "🇲🇽", zone: "TROPICAL_EQUATORIAL" },
  ZA: { name: "South Africa", flag: "🇿🇦", zone: "SOUTH_TEMPERATE" },
  MA: { name: "Morocco", flag: "🇲🇦", zone: "MEDITERRANEAN" },
  CR: { name: "Costa Rica", flag: "🇨🇷", zone: "TROPICAL_EQUATORIAL" },
  IT: { name: "Italy", flag: "🇮🇹", zone: "MEDITERRANEAN" },
  US: { name: "USA", flag: "🇺🇸", zone: "NA_TEMPERATE" },
  NZ: { name: "New Zealand", flag: "🇳🇿", zone: "SOUTH_TEMPERATE" },
  IN: { name: "India", flag: "🇮🇳", zone: "TROPICAL_EQUATORIAL" },
  EG: { name: "Egypt", flag: "🇪🇬", zone: "MEDITERRANEAN" },
  CO: { name: "Colombia", flag: "🇨🇴", zone: "TROPICAL_EQUATORIAL" },
};

// ---------------------------------------------------------------------------
// Calendar dataset. A calendar is `null` (not commercially grown in the zone) or
// `[peak, shoulder?]` where each value is a comma list of month ranges "a-b" (wraps past 12).
// An empty peak with shoulder "1-12" means "in season year-round".
// ---------------------------------------------------------------------------

type Cal = null | [peak: string, shoulder?: string];

interface DatasetEntry {
  BR: Cal;
  EU: Cal; // EU_NORTH_WEST
  MED: Cal; // MEDITERRANEAN
  NA: Cal; // NA_TEMPERATE
  SOUTH: Cal; // SOUTH_TEMPERATE
  TROP: Cal; // TROPICAL_EQUATORIAL
  origins: OriginCode[];
  over?: Partial<Record<OriginCode, Cal>>;
}

const YR: Cal = ["", "1-12"];

const MELON: DatasetEntry = {
  BR: ["10-2", "9-9,3-4"],
  EU: null,
  MED: ["7-9", "6-6,10-10"],
  NA: ["7-9", "6-6,10-10"],
  SOUTH: ["12-3", "11-11,4-4"],
  TROP: YR,
  origins: ["ES", "BR", "MA"],
};

const PEACH: DatasetEntry = {
  BR: ["10-12", "9-9,1-2"],
  EU: null,
  MED: ["6-8", "5-5,9-9"],
  NA: ["6-8", "5-5,9-9"],
  SOUTH: ["12-3", "11-11,4-4"],
  TROP: null,
  origins: ["ES", "IT", "CL", "ZA"],
};

const DATASET: Record<string, DatasetEntry> = {
  watermelon: {
    BR: ["11-3", "10-10,4-4"],
    EU: null,
    MED: ["6-8", "5-5,9-9"],
    NA: ["6-8", "5-5,9-9"],
    SOUTH: ["12-3", "11-11,4-4"],
    TROP: YR,
    origins: ["ES", "BR", "MA"],
  },
  melon: MELON,
  cantaloupe: MELON,
  honeydew: MELON,
  mango: {
    BR: ["10-1", "9-9,2-2"],
    EU: null,
    MED: ["9-11", "8-8,12-12"],
    NA: null,
    SOUTH: ["11-3", "10-10,4-4"],
    TROP: ["3-6", "2-2,7-8"],
    origins: ["BR", "PE", "ES", "IN", "MX"],
    over: { PE: ["12-3", "11-11,4-4"], MX: ["3-7", "2-2,8-8"] },
  },
  papaya: {
    BR: YR,
    EU: null,
    MED: null,
    NA: null,
    SOUTH: null,
    TROP: YR,
    origins: ["BR", "CR", "MX"],
  },
  pineapple: {
    BR: ["10-3", "4-9"],
    EU: null,
    MED: null,
    NA: null,
    SOUTH: null,
    TROP: YR,
    origins: ["CR", "BR", "MX"],
  },
  banana: {
    BR: YR,
    EU: null,
    MED: null,
    NA: null,
    SOUTH: null,
    TROP: YR,
    origins: ["CO", "CR", "BR"],
  },
  avocado: {
    BR: ["3-8", "2-2,9-9"],
    EU: null,
    MED: ["12-4", "10-11,5-5"],
    NA: ["4-9", "3-3,10-10"],
    SOUTH: ["8-1", "6-7,2-2"],
    TROP: YR,
    origins: ["PE", "ES", "MX", "CL", "ZA"],
    over: { PE: ["4-9", "3-3,10-10"], ZA: ["4-8", "3-3,9-9"], NZ: ["10-3", "9-9,4-4"] },
  },
  passion_fruit: {
    BR: ["1-6", "12-12,7-7"],
    EU: null,
    MED: null,
    NA: null,
    SOUTH: null,
    TROP: YR,
    origins: ["CO", "BR", "PE"],
  },
  guava: {
    BR: ["12-4", "11-11,5-5"],
    EU: null,
    MED: null,
    NA: null,
    SOUTH: null,
    TROP: YR,
    origins: ["BR", "IN", "MX"],
  },
  strawberry: {
    BR: ["6-10", "5-5,11-11"],
    EU: ["5-8", "4-4,9-9"],
    MED: ["3-5", "2-2,6-6"],
    NA: ["5-7", "4-4,8-9"],
    SOUTH: ["10-1", "9-9,2-3"],
    TROP: ["12-5", "11-11,6-6"],
    origins: ["ES", "MA", "MX", "EG"],
  },
  blueberry: {
    BR: ["10-12", "9-9,1-1"],
    EU: ["7-8", "6-6,9-9"],
    MED: ["4-6", "3-3,7-7"],
    NA: ["6-8", "5-5,9-9"],
    SOUTH: ["11-2", "10-10,3-3"],
    TROP: null,
    origins: ["PE", "CL", "ES", "MA", "ZA"],
    over: { PE: ["8-12", "6-7,1-1"] },
  },
  raspberry: {
    BR: null,
    EU: ["6-9", "5-5,10-10"],
    MED: ["5-6", "4-4,7-7"],
    NA: ["6-9", "5-5,10-10"],
    SOUTH: ["11-2", "10-10,3-3"],
    TROP: null,
    origins: ["ES", "MA", "CL"],
  },
  blackberry: {
    BR: null,
    EU: ["7-9", "6-6,10-10"],
    MED: ["5-7", "4-4,8-8"],
    NA: ["6-8", "5-5,9-9"],
    SOUTH: ["12-2", "11-11,3-3"],
    TROP: ["10-5", "9-9,6-6"],
    origins: ["MX", "ES", "CL"],
  },
  cherry: {
    BR: null,
    EU: ["6-8", "9-9"],
    MED: ["5-7", "4-4,8-8"],
    NA: ["5-7", "4-4,8-8"],
    SOUTH: ["11-1", "10-10,2-2"],
    TROP: null,
    origins: ["ES", "CL", "US", "IT"],
  },
  peach: PEACH,
  nectarine: PEACH,
  plum: {
    BR: ["11-2", "10-10,3-3"],
    EU: ["8-9", "7-7,10-10"],
    MED: ["6-8", "5-5,9-9"],
    NA: ["6-9", "5-5,10-10"],
    SOUTH: ["1-3", "12-12,4-4"],
    TROP: null,
    origins: ["ES", "CL", "ZA", "IT"],
  },
  apricot: {
    BR: null,
    EU: ["7-8", "6-6,9-9"],
    MED: ["5-7", "4-4,8-8"],
    NA: ["6-7", "5-5,8-8"],
    SOUTH: ["12-2", "11-11,3-3"],
    TROP: null,
    origins: ["ES", "IT", "CL", "ZA"],
  },
  apple: {
    BR: ["2-5", "1-1,6-8"],
    EU: ["9-11", "8-8,12-2"],
    MED: ["9-11", "8-8,12-2"],
    NA: ["9-11", "8-8,12-2"],
    SOUTH: ["3-5", "2-2,6-8"],
    TROP: null,
    origins: ["ZA", "NZ", "CL", "IT", "US", "BR"],
  },
  pear: {
    BR: null,
    EU: ["9-11", "8-8,12-1"],
    MED: ["8-10", "7-7,11-12"],
    NA: ["8-10", "7-7,11-12"],
    SOUTH: ["2-4", "1-1,5-6"],
    TROP: null,
    origins: ["ZA", "IT", "ES", "CL", "US"],
  },
  grape: {
    BR: ["12-3", "11-11,4-4"],
    EU: null,
    MED: ["8-10", "7-7,11-11"],
    NA: ["8-10", "7-7,11-11"],
    SOUTH: ["1-4", "12-12,5-5"],
    TROP: ["2-4", "1-1,5-5"],
    origins: ["PE", "CL", "ZA", "ES", "IN", "BR", "US"],
    over: { PE: ["11-3", "10-10,4-4"] },
  },
  kiwi: {
    BR: null,
    EU: null,
    MED: ["10-12", "9-9,1-3"],
    NA: ["10-12", "9-9,1-2"],
    SOUTH: ["3-6", "2-2,7-9"],
    TROP: null,
    origins: ["NZ", "IT", "CL", "US"],
  },
  fig: {
    BR: ["1-3", "12-12,4-4"],
    EU: ["8-9", "7-7,10-10"],
    MED: ["8-10", "6-7,11-11"],
    NA: ["6-9", "5-5,10-10"],
    SOUTH: ["2-4", "1-1,5-5"],
    TROP: null,
    origins: ["ES", "IT", "BR", "MA"],
  },
  pomegranate: {
    BR: null,
    EU: null,
    MED: ["9-12", "8-8,1-1"],
    NA: ["9-12", "8-8,1-1"],
    SOUTH: ["3-5", "2-2,6-6"],
    TROP: ["8-1", "7-7,2-2"],
    origins: ["ES", "IN", "PE"],
  },
  persimmon: {
    BR: ["3-6", "2-2,7-7"],
    EU: null,
    MED: ["10-12", "9-9,1-1"],
    NA: ["10-12", "9-9,1-1"],
    SOUTH: ["3-6", "2-2,7-7"],
    TROP: null,
    origins: ["ES", "IT", "BR"],
  },
  orange: {
    BR: ["5-9", "4-4,10-11"],
    EU: null,
    MED: ["11-3", "10-10,4-4"],
    NA: ["11-4", "10-10,5-5"],
    SOUTH: ["6-10", "5-5,11-11"],
    TROP: ["11-3", "10-10,4-4"],
    origins: ["ES", "ZA", "EG", "BR", "US", "MA"],
  },
  lemon: {
    BR: ["3-7", "2-2,8-8"],
    EU: null,
    MED: ["10-3", "9-9,4-6"],
    NA: YR,
    SOUTH: ["4-9", "3-3,10-10"],
    TROP: YR,
    origins: ["ES", "ZA", "CL", "MX", "BR"],
  },
  lime: {
    BR: YR,
    EU: null,
    MED: null,
    NA: null,
    SOUTH: null,
    TROP: YR,
    origins: ["BR", "MX", "CO"],
  },
  grapefruit: {
    BR: ["5-9", "4-4,10-10"],
    EU: null,
    MED: ["11-4", "10-10,5-5"],
    NA: ["11-4", "10-10,5-5"],
    SOUTH: ["5-9", "4-4,10-10"],
    TROP: null,
    origins: ["ZA", "ES", "US", "EG"],
  },
  mandarin: {
    BR: ["4-8", "3-3,9-9"],
    EU: null,
    MED: ["11-1", "10-10,2-2"],
    NA: ["11-3", "10-10,4-4"],
    SOUTH: ["4-8", "3-3,9-9"],
    TROP: ["5-9", "4-4,10-10"],
    origins: ["ES", "ZA", "PE", "MA"],
  },
  tomato: {
    BR: YR,
    EU: ["7-9", "6-6,10-10"],
    MED: ["6-9", "4-5,10-11"],
    NA: ["7-9", "6-6,10-10"],
    SOUTH: ["12-3", "11-11,4-4"],
    TROP: YR,
    origins: ["ES", "MA", "IT", "MX"],
  },
  bell_pepper: {
    BR: YR,
    EU: ["7-9", "6-6,10-10"],
    MED: ["6-10", "5-5,11-11"],
    NA: ["7-10", "6-6,11-11"],
    SOUTH: ["12-3", "11-11,4-4"],
    TROP: YR,
    origins: ["ES", "MA", "MX", "IT"],
  },
  cucumber: {
    BR: YR,
    EU: ["6-9", "5-5,10-10"],
    MED: ["4-10", "3-3,11-2"],
    NA: ["6-9", "5-5,10-10"],
    SOUTH: ["11-3", "10-10,4-4"],
    TROP: YR,
    origins: ["ES", "MA", "MX"],
  },
  zucchini: {
    BR: YR,
    EU: ["6-9", "5-5,10-10"],
    MED: ["4-10", "3-3,11-2"],
    NA: ["6-9", "5-5,10-10"],
    SOUTH: ["11-3", "10-10,4-4"],
    TROP: YR,
    origins: ["ES", "MA", "IT", "MX"],
  },
  eggplant: {
    BR: YR,
    EU: ["7-9", "6-6,10-10"],
    MED: ["6-10", "5-5,11-11"],
    NA: ["7-9", "6-6,10-10"],
    SOUTH: ["12-3", "11-11,4-4"],
    TROP: YR,
    origins: ["ES", "IT", "MA", "IN"],
  },
  broccoli: {
    BR: ["5-9", "4-4,10-10"],
    EU: ["6-10", "5-5,11-11"],
    MED: ["10-4", "9-9,5-5"],
    NA: ["9-11", "8-8,12-5"],
    SOUTH: ["5-10", "4-4,11-11"],
    TROP: YR,
    origins: ["ES", "MX", "IT"],
  },
  cauliflower: {
    BR: ["5-9", "4-4,10-10"],
    EU: ["10-3", "8-9,4-4"],
    MED: ["11-3", "10-10,4-4"],
    NA: ["9-11", "8-8,12-4"],
    SOUTH: ["5-10", "4-4,11-11"],
    TROP: null,
    origins: ["ES", "IT"],
  },
  asparagus: {
    BR: null,
    EU: ["5-6", "4-4"],
    MED: ["3-5", "2-2,6-6"],
    NA: ["4-6", "3-3,7-7"],
    SOUTH: ["9-11", "8-8,12-12"],
    TROP: null,
    origins: ["PE", "ES", "MX"],
    over: { PE: YR, MX: ["1-4", "12-12,5-5"] },
  },
  corn: {
    BR: ["11-3", "10-10,4-4"],
    EU: ["8-9", "7-7,10-10"],
    MED: ["6-9", "5-5,10-10"],
    NA: ["6-9", "5-5,10-10"],
    SOUTH: ["12-3", "11-11,4-4"],
    TROP: YR,
    origins: ["ES", "MX"],
  },
  lettuce: {
    BR: YR,
    EU: ["5-10", "4-4,11-11"],
    MED: ["10-4", "9-9,5-5"],
    NA: YR,
    SOUTH: YR,
    TROP: YR,
    origins: ["ES", "US", "IT"],
  },
  potato: {
    BR: ["5-9", "4-4,10-11"],
    EU: ["8-10", "1-12"], // Harvest Aug-Oct in NW Europe; stored and available year-round
    MED: ["5-7", "4-4,8-10"],
    NA: ["8-10", "1-12"],
    SOUTH: ["1-4", "12-12,5-6"],
    TROP: YR,
    origins: ["ES", "EG", "US", "ZA"],
  },
  onion: {
    BR: ["9-1", "8-8,2-3"],
    EU: ["8-10", "1-12"], // Maincrop Aug-Oct; stored year-round
    MED: ["6-9", "5-5,10-10"],
    NA: ["8-10", "1-12"],
    SOUTH: ["1-4", "12-12,5-6"],
    TROP: YR,
    origins: ["ES", "EG", "NZ", "US"],
  },
};

export const SEASONALITY_SLUGS: readonly string[] = Object.keys(DATASET);

const ZONE_KEY: Record<SeasonalityZone, keyof Omit<DatasetEntry, "origins" | "over">> = {
  BR: "BR",
  EU_NORTH_WEST: "EU",
  MEDITERRANEAN: "MED",
  NA_TEMPERATE: "NA",
  SOUTH_TEMPERATE: "SOUTH",
  TROPICAL_EQUATORIAL: "TROP",
};

// ---------------------------------------------------------------------------
// Slug normalisation
// ---------------------------------------------------------------------------

const ALIAS_RULES: Array<[RegExp, string]> = [
  [/tomato/, "tomato"],
  [/water_?melon/, "watermelon"],
  [/cantaloup/, "cantaloupe"],
  [/honey_?dew/, "honeydew"],
  [/melon/, "melon"],
  [/pineapple/, "pineapple"],
  [/grapefruit|pomelo/, "grapefruit"],
  [/passion/, "passion_fruit"],
  [/apple/, "apple"],
  [/avocado/, "avocado"],
  [/strawberr/, "strawberry"],
  [/blueberr/, "blueberry"],
  [/raspberr/, "raspberry"],
  [/blackberr/, "blackberry"],
  [/cherr/, "cherry"],
  [/nectarine/, "nectarine"],
  [/peach/, "peach"],
  [/plum/, "plum"],
  [/apricot/, "apricot"],
  [/pear/, "pear"],
  [/grape/, "grape"],
  [/kiwi/, "kiwi"],
  [/fig|^fig/, "fig"],
  [/pomegranate/, "pomegranate"],
  [/persimmon|sharon/, "persimmon"],
  [/mandarin|clementine|satsuma|tangerine|easy_peel|citrus/, "mandarin"],
  [/orange/, "orange"],
  [/lemon/, "lemon"],
  [/lime/, "lime"],
  [/mango/, "mango"],
  [/papaya|pawpaw/, "papaya"],
  [/guava/, "guava"],
  [/banana|plantain/, "banana"],
  [/bell_?pepper|capsicum|^pepper/, "bell_pepper"],
  [/cucumber/, "cucumber"],
  [/courgette|zucchini/, "zucchini"],
  [/aubergine|eggplant/, "eggplant"],
  [/broccoli/, "broccoli"],
  [/cauliflower/, "cauliflower"],
  [/asparagus/, "asparagus"],
  [/sweet_?corn|maize|^corn/, "corn"],
  [/lettuce|romaine|iceberg/, "lettuce"],
  [/potato|spud|tuber/, "potato"],
  [/onion|shallot/, "onion"],
];

export function normalizeProduceSlug(raw: string): string {
  const cleaned = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z_]/g, "");
  for (const [pattern, slug] of ALIAS_RULES) {
    if (pattern.test(cleaned)) return slug;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Shopper region
// ---------------------------------------------------------------------------

const COUNTRY_ZONE: Record<string, SeasonalityZone> = {
  BR: "BR",
  // Northern & central Europe
  GB: "EU_NORTH_WEST", IE: "EU_NORTH_WEST", FR: "EU_NORTH_WEST", DE: "EU_NORTH_WEST",
  NL: "EU_NORTH_WEST", BE: "EU_NORTH_WEST", LU: "EU_NORTH_WEST", DK: "EU_NORTH_WEST",
  SE: "EU_NORTH_WEST", NO: "EU_NORTH_WEST", FI: "EU_NORTH_WEST", IS: "EU_NORTH_WEST",
  AT: "EU_NORTH_WEST", CH: "EU_NORTH_WEST", PL: "EU_NORTH_WEST", CZ: "EU_NORTH_WEST",
  SK: "EU_NORTH_WEST", HU: "EU_NORTH_WEST", EE: "EU_NORTH_WEST", LV: "EU_NORTH_WEST",
  LT: "EU_NORTH_WEST", RO: "EU_NORTH_WEST", BG: "EU_NORTH_WEST", UA: "EU_NORTH_WEST",
  JP: "EU_NORTH_WEST", KR: "EU_NORTH_WEST", CN: "EU_NORTH_WEST", RU: "EU_NORTH_WEST",
  // Mediterranean
  ES: "MEDITERRANEAN", IT: "MEDITERRANEAN", PT: "MEDITERRANEAN", GR: "MEDITERRANEAN",
  MT: "MEDITERRANEAN", CY: "MEDITERRANEAN", TR: "MEDITERRANEAN", MA: "MEDITERRANEAN",
  DZ: "MEDITERRANEAN", TN: "MEDITERRANEAN", EG: "MEDITERRANEAN", IL: "MEDITERRANEAN",
  HR: "MEDITERRANEAN", SI: "MEDITERRANEAN", LB: "MEDITERRANEAN",
  // North America
  US: "NA_TEMPERATE", CA: "NA_TEMPERATE",
  // Southern temperate
  CL: "SOUTH_TEMPERATE", AR: "SOUTH_TEMPERATE", UY: "SOUTH_TEMPERATE", ZA: "SOUTH_TEMPERATE",
  AU: "SOUTH_TEMPERATE", NZ: "SOUTH_TEMPERATE",
  // Tropics
  MX: "TROPICAL_EQUATORIAL", CO: "TROPICAL_EQUATORIAL", PE: "TROPICAL_EQUATORIAL",
  EC: "TROPICAL_EQUATORIAL", CR: "TROPICAL_EQUATORIAL", PA: "TROPICAL_EQUATORIAL",
  GT: "TROPICAL_EQUATORIAL", HN: "TROPICAL_EQUATORIAL", NI: "TROPICAL_EQUATORIAL",
  SV: "TROPICAL_EQUATORIAL", CU: "TROPICAL_EQUATORIAL", DO: "TROPICAL_EQUATORIAL",
  JM: "TROPICAL_EQUATORIAL", VE: "TROPICAL_EQUATORIAL", BO: "TROPICAL_EQUATORIAL",
  PY: "TROPICAL_EQUATORIAL", IN: "TROPICAL_EQUATORIAL", TH: "TROPICAL_EQUATORIAL",
  VN: "TROPICAL_EQUATORIAL", PH: "TROPICAL_EQUATORIAL", ID: "TROPICAL_EQUATORIAL",
  MY: "TROPICAL_EQUATORIAL", SG: "TROPICAL_EQUATORIAL", LK: "TROPICAL_EQUATORIAL",
  NG: "TROPICAL_EQUATORIAL", GH: "TROPICAL_EQUATORIAL", KE: "TROPICAL_EQUATORIAL",
  TZ: "TROPICAL_EQUATORIAL", UG: "TROPICAL_EQUATORIAL", ET: "TROPICAL_EQUATORIAL",
};

const DEFAULT_REGION: ResolvedShopperRegion = { countryCode: "GB", zone: "EU_NORTH_WEST" };

function parseCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper) || upper === "XX") return null;
  return upper;
}

function countryFromLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const parts = locale.split(/[-_]/).slice(1);
  for (const part of parts) {
    const c = parseCountry(part);
    if (c && part === part.toUpperCase()) return c;
  }
  return null;
}

export function resolveShopperRegion(input: ShopperRegionInput): ResolvedShopperRegion {
  const countryCode = parseCountry(input.cfCountry) ?? countryFromLocale(input.locale);
  if (!countryCode) return { ...DEFAULT_REGION };

  const known = COUNTRY_ZONE[countryCode];
  if (known) return { countryCode, zone: known };

  const lat = input.cfLatitude === null || input.cfLatitude === undefined ? NaN : Number(input.cfLatitude);
  if (Number.isFinite(lat)) {
    if (Math.abs(lat) <= 23.5) return { countryCode, zone: "TROPICAL_EQUATORIAL" };
    if (lat < -23.5) return { countryCode, zone: "SOUTH_TEMPERATE" };
  }
  return { countryCode, zone: "EU_NORTH_WEST" };
}

// ---------------------------------------------------------------------------
// Month helpers & copy
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseMonths(spec: string | undefined): number[] {
  if (!spec) return [];
  const out = new Set<number>();
  for (const chunk of spec.split(",")) {
    const [aRaw, bRaw] = chunk.split("-");
    const a = Number(aRaw);
    const b = Number(bRaw ?? aRaw);
    if (a <= b) for (let m = a; m <= b; m++) out.add(m);
    else {
      for (let m = a; m <= 12; m++) out.add(m);
      for (let m = 1; m <= b; m++) out.add(m);
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** Contiguous circular windows, e.g. [10,11,12,1] -> "Oct–Jan"; 12 months -> "Year-round". */
function formatWindows(months: number[]): string {
  if (months.length === 0) return "";
  if (months.length >= 12) return "Year-round";
  const set = new Set(months);
  const starts = months.filter((m) => !set.has(m === 1 ? 12 : m - 1));
  const windows = starts.map((start) => {
    let end = start;
    while (set.has(end === 12 ? 1 : end + 1)) end = end === 12 ? 1 : end + 1;
    return start === end ? MONTH_NAMES[start - 1] : `${MONTH_NAMES[start - 1]}–${MONTH_NAMES[end - 1]}`;
  });
  return windows.slice(0, 2).join(", ");
}

function trimMax(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

interface ResolvedCal {
  peak: number[];
  shoulder: number[];
  label: string;
}

function resolveCal(cal: Cal): ResolvedCal | null {
  if (!cal) return null;
  const peak = parseMonths(cal[0]);
  const shoulder = parseMonths(cal[1]);
  const label = formatWindows(peak.length > 0 ? peak : shoulder);
  return { peak, shoulder, label };
}

function localStatus(cal: ResolvedCal | null, month: number): SeasonalityStatus {
  if (!cal) return "imported_year_round";
  if (cal.peak.includes(month)) return "peak";
  if (cal.shoulder.includes(month)) return "in_season";
  return "off_season";
}

function localCopy(status: SeasonalityStatus, label: string): { badgeText: string; noteText: string } {
  switch (status) {
    case "peak":
      return {
        badgeText: trimMax(`Peak season (${label})`, 48),
        noteText: "In peak harvest locally, expect the best flavour.",
      };
    case "in_season":
      return {
        badgeText: trimMax(label === "Year-round" ? "In season year-round" : `In season (Peak: ${label})`, 48),
        noteText: "Locally in season right now.",
      };
    case "off_season":
      return {
        badgeText: trimMax(`Off-season locally (Peak: ${label})`, 48),
        noteText: "Even the top pick may be less sweet.",
      };
    default:
      return {
        badgeText: "Imported year-round",
        noteText: "Not grown locally. Quality depends on the shipment.",
      };
  }
}

function originCopy(
  status: SeasonalityStatus,
  name: string,
  label: string
): { badgeText: string; noteText: string } {
  if (status === "peak") {
    return {
      badgeText: trimMax(`Peak in ${name} (${label})`, 48),
      noteText: trimMax(`In peak harvest in ${name} right now, expect the best flavour.`, 90),
    };
  }
  if (status === "in_season") {
    return {
      badgeText: trimMax(label === "Year-round" ? `In season in ${name} year-round` : `In season in ${name}`, 48),
      noteText: trimMax(`Currently in season in ${name}.`, 90),
    };
  }
  return {
    badgeText: trimMax(`Off-season in ${name} (Peak: ${label})`, 48),
    noteText: trimMax(`Out of season in ${name}, may be stored or flown in.`, 90),
  };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function lookupProduceSeasonality(
  produceType: string,
  region: ShopperRegionInput,
  month: number
): SeasonalityInfo | null {
  const slug = normalizeProduceSlug(produceType);
  const entry = DATASET[slug];
  if (!entry) return null;

  const { countryCode, zone } = resolveShopperRegion(region);

  const shopperOverride = entry.over?.[countryCode as OriginCode];
  const shopperCal = resolveCal(shopperOverride !== undefined ? shopperOverride : entry[ZONE_KEY[zone]]);
  const status = localStatus(shopperCal, month);
  const label = shopperCal?.label ?? "";
  const { badgeText, noteText } = localCopy(status, label);

  const origins: OriginSeasonOption[] = [];
  for (const code of entry.origins) {
    if (code === countryCode) continue;
    const meta = ORIGINS[code];
    const override = entry.over?.[code];
    const cal = resolveCal(override !== undefined ? override : entry[ZONE_KEY[meta.zone]]);
    if (!cal) continue;
    const originStatus = localStatus(cal, month);
    const copy = originCopy(originStatus, meta.name, cal.label);
    origins.push({
      code,
      name: meta.name,
      flag: meta.flag,
      status: originStatus,
      peakWindowLabel: cal.label,
      ...copy,
    });
    if (origins.length >= 8) break;
  }

  return {
    produceSlug: slug,
    month,
    shopperCountry: countryCode,
    shopperZone: zone,
    status,
    peakWindowLabel: label,
    badgeText,
    noteText,
    origins,
  };
}
