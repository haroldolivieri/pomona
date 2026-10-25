import { describe, expect, it } from "vitest";
import {
  SEASONALITY_SLUGS,
  lookupProduceSeasonality,
  normalizeProduceSlug,
  resolveShopperRegion,
} from "../src/index";

describe("normalizeProduceSlug", () => {
  it("maps varieties, plurals, accents and spacing to canonical slugs", () => {
    expect(normalizeProduceSlug("Hass Avocado")).toBe("avocado");
    expect(normalizeProduceSlug("strawberries")).toBe("strawberry");
    expect(normalizeProduceSlug("galia_melon")).toBe("melon");
    expect(normalizeProduceSlug("pink lady apple")).toBe("apple");
    expect(normalizeProduceSlug("Maçã Gala")).toBe("apple");
  });

  it("maps mandarin varieties and international names accurately", () => {
    for (const v of [
      "Mandarin",
      "clementine",
      "Satsuma",
      "tangerine",
      "Ponkan",
      "Mexerica Rio",
      "Bergamota",
      "Tangor Murcott",
      "citrus",
    ]) {
      expect(normalizeProduceSlug(v)).toBe("mandarin");
    }
  });

  it("distinguishes potato vs sweet_potato and onion vs spring_onion", () => {
    expect(normalizeProduceSlug("Russet Potato")).toBe("potato");
    expect(normalizeProduceSlug("Maris Piper potatoes")).toBe("potato");
    expect(normalizeProduceSlug("batata inglesa")).toBe("potato");
    expect(normalizeProduceSlug("Sweet Potato")).toBe("sweet_potato");
    expect(normalizeProduceSlug("Batata-doce")).toBe("sweet_potato");
    expect(normalizeProduceSlug("Garnet Yam")).toBe("sweet_potato");

    expect(normalizeProduceSlug("Red Onion")).toBe("onion");
    expect(normalizeProduceSlug("shallots")).toBe("onion");
    expect(normalizeProduceSlug("Spring Onion")).toBe("spring_onion");
    expect(normalizeProduceSlug("Green Onions")).toBe("spring_onion");
    expect(normalizeProduceSlug("Scallions")).toBe("spring_onion");
  });

  it("prevents substring collisions across compound produce names", () => {
    expect(normalizeProduceSlug("Romaine Lettuce")).toBe("lettuce");
    expect(normalizeProduceSlug("Romã")).toBe("pomegranate");
    expect(normalizeProduceSlug("Macaxeira")).toBe("cassava");
    expect(normalizeProduceSlug("Jalapeño Chili")).toBe("chili_pepper");
    expect(normalizeProduceSlug("Red Bell Pepper")).toBe("bell_pepper");
    expect(normalizeProduceSlug("Butternut Squash")).toBe("butternut_squash");
    expect(normalizeProduceSlug("Kabocha Pumpkin")).toBe("pumpkin");
    expect(normalizeProduceSlug("Sugar Snap Peas")).toBe("pea");
    expect(normalizeProduceSlug("Green Beans")).toBe("green_bean");
    expect(normalizeProduceSlug("Black Mission Figs")).toBe("fig");
    expect(normalizeProduceSlug("Custard Apple")).not.toBe("apple");
    expect(normalizeProduceSlug("Prickly Pear")).not.toBe("pear");
    expect(normalizeProduceSlug("Bitter Melon")).not.toBe("melon");
  });
});

describe("resolveShopperRegion", () => {
  it("uses the Cloudflare country when valid", () => {
    expect(resolveShopperRegion({ cfCountry: "BR" })).toEqual({ countryCode: "BR", zone: "BR" });
  });
  it("falls back to locale (case-insensitively) for XX/T1 or missing country", () => {
    expect(resolveShopperRegion({ cfCountry: "XX", locale: "en-GB" })).toEqual({
      countryCode: "GB",
      zone: "EU_NORTH_WEST",
    });
    expect(resolveShopperRegion({ cfCountry: "T1", locale: "pt-BR" }).countryCode).toBe("BR");
    expect(resolveShopperRegion({ locale: "pt-br" }).countryCode).toBe("BR");
    expect(resolveShopperRegion({ locale: "en-us" }).zone).toBe("NA_TEMPERATE");
  });
  it("defaults to GB when locale has no region and nothing else is known", () => {
    expect(resolveShopperRegion({ locale: "en" })).toEqual({ countryCode: "GB", zone: "EU_NORTH_WEST" });
    expect(resolveShopperRegion({ locale: "" }).zone).toBe("EU_NORTH_WEST");
    expect(resolveShopperRegion({})).toEqual({ countryCode: "GB", zone: "EU_NORTH_WEST" });
  });
  it("uses latitude (string or number) for unknown countries", () => {
    expect(resolveShopperRegion({ cfCountry: "ZZ", cfLatitude: "-23.5" }).zone).toBe("TROPICAL_EQUATORIAL");
    expect(resolveShopperRegion({ cfCountry: "ZZ", cfLatitude: -40 }).zone).toBe("SOUTH_TEMPERATE");
  });
});

describe("lookupProduceSeasonality", () => {
  it("treats year-wrapping windows as peak in both December and January (mango in BR)", () => {
    const dec = lookupProduceSeasonality("mango", { cfCountry: "BR" }, 12)!;
    expect(dec.status).toBe("peak");
    expect(dec.peakWindowLabel).toBe("Oct–Jan");
    expect(lookupProduceSeasonality("mango", { cfCountry: "BR" }, 1)!.status).toBe("peak");
    expect(lookupProduceSeasonality("mango", { cfCountry: "BR" }, 6)!.status).not.toBe("peak");
  });

  it("marks mango as imported year-round in the UK and offers Brazil as a peak origin in November", () => {
    const info = lookupProduceSeasonality("mango", { cfCountry: "GB" }, 11)!;
    expect(info.status).toBe("imported_year_round");
    expect(info.origins.find((o) => o.code === "BR")?.status).toBe("peak");
    expect(info.origins.some((o) => o.code === "GB")).toBe(false);
  });

  it("marks UK strawberries off-season in November and peak in June", () => {
    const nov = lookupProduceSeasonality("strawberry", { cfCountry: "GB" }, 11)!;
    expect(nov.status).toBe("off_season");
    expect(nov.peakWindowLabel).toBe("May–Aug");
    expect(lookupProduceSeasonality("strawberry", { cfCountry: "GB" }, 6)!.status).toBe("peak");
  });

  it("evaluates mandarin seasonality accurately across BR, ES and GB", () => {
    const brJuly = lookupProduceSeasonality("Ponkan Mandarin", { cfCountry: "BR" }, 7)!;
    expect(brJuly.produceSlug).toBe("mandarin");
    expect(brJuly.status).toBe("peak");
    expect(brJuly.peakWindowLabel).toBe("May–Sep");

    const esJan = lookupProduceSeasonality("Clementine", { cfCountry: "ES" }, 1)!;
    expect(esJan.status).toBe("peak");
    expect(esJan.peakWindowLabel).toBe("Nov–Feb");

    const gbDec = lookupProduceSeasonality("Satsuma", { cfCountry: "GB" }, 12)!;
    expect(gbDec.status).toBe("imported_year_round");
    expect(gbDec.origins.find((o) => o.code === "ES")?.status).toBe("peak");
  });

  it("evaluates potato and sweet_potato with distinct regional calendars", () => {
    const ukPotatoAug = lookupProduceSeasonality("potato", { cfCountry: "GB" }, 8)!;
    expect(ukPotatoAug.status).toBe("peak");
    expect(ukPotatoAug.peakWindowLabel).toBe("Jul–Oct");

    const ukPotatoFeb = lookupProduceSeasonality("potato", { cfCountry: "GB" }, 2)!;
    expect(ukPotatoFeb.status).toBe("in_season");

    const ukSweetPotatoOct = lookupProduceSeasonality("sweet potato", { cfCountry: "GB" }, 10)!;
    expect(ukSweetPotatoOct.produceSlug).toBe("sweet_potato");
    expect(ukSweetPotatoOct.status).toBe("imported_year_round");
    expect(ukSweetPotatoOct.origins.find((o) => o.code === "US")?.status).toBe("peak");
  });

  it("reflects real CEAGESP seasonal peaks for Brazilian vegetables instead of flat year-round", () => {
    expect(lookupProduceSeasonality("tomato", { cfCountry: "BR" }, 7)!.status).toBe("peak");
    expect(lookupProduceSeasonality("zucchini", { cfCountry: "BR" }, 12)!.status).toBe("peak");
    expect(lookupProduceSeasonality("eggplant", { cfCountry: "BR" }, 1)!.status).toBe("peak");
    expect(lookupProduceSeasonality("bell_pepper", { cfCountry: "BR" }, 12)!.status).toBe("peak");
    expect(lookupProduceSeasonality("blackberry", { cfCountry: "BR" }, 10)!.status).toBe("peak");
    expect(lookupProduceSeasonality("raspberry", { cfCountry: "BR" }, 11)!.status).toBe("peak");
  });

  it("never lists the shopper's own country as an origin", () => {
    const info = lookupProduceSeasonality("mango", { cfCountry: "BR" }, 11)!;
    expect(info.origins.some((o) => o.code === "BR")).toBe(false);
  });

  it("returns null for unknown produce", () => {
    expect(lookupProduceSeasonality("unknown_alien_fruit", { cfCountry: "GB" }, 5)).toBeNull();
  });

  it("respects copy limits for every slug, month and zone", () => {
    expect(SEASONALITY_SLUGS.length).toBeGreaterThanOrEqual(70);
    for (const slug of SEASONALITY_SLUGS) {
      for (const country of ["BR", "GB", "ES", "US", "CL", "IN"]) {
        for (let m = 1; m <= 12; m++) {
          const info = lookupProduceSeasonality(slug, { cfCountry: country }, m)!;
          expect(info).not.toBeNull();
          expect(info.badgeText.length).toBeLessThanOrEqual(48);
          expect(info.noteText.length).toBeLessThanOrEqual(90);
          expect(info.origins.length).toBeLessThanOrEqual(8);
          for (const o of info.origins) {
            expect(o.badgeText.length).toBeLessThanOrEqual(48);
            expect(o.noteText.length).toBeLessThanOrEqual(90);
          }
        }
      }
    }
  }, 30000);
});

