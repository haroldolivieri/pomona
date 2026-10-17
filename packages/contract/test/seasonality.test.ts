import { describe, expect, it } from "vitest";
import {
  SEASONALITY_SLUGS,
  lookupProduceSeasonality,
  normalizeProduceSlug,
  resolveShopperRegion,
} from "../src/index";

describe("normalizeProduceSlug", () => {
  it("maps varieties, plurals and spacing to canonical slugs", () => {
    expect(normalizeProduceSlug("Hass Avocado")).toBe("avocado");
    expect(normalizeProduceSlug("strawberries")).toBe("strawberry");
    expect(normalizeProduceSlug("galia_melon")).toBe("melon");
    expect(normalizeProduceSlug("pink lady apple")).toBe("apple");
  });
});

describe("resolveShopperRegion", () => {
  it("uses the Cloudflare country when valid", () => {
    expect(resolveShopperRegion({ cfCountry: "BR" })).toEqual({ countryCode: "BR", zone: "BR" });
  });
  it("falls back to locale for XX/T1 or missing country", () => {
    expect(resolveShopperRegion({ cfCountry: "XX", locale: "en-GB" })).toEqual({
      countryCode: "GB",
      zone: "EU_NORTH_WEST",
    });
    expect(resolveShopperRegion({ cfCountry: "T1", locale: "pt-BR" }).countryCode).toBe("BR");
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

  it("never lists the shopper's own country as an origin", () => {
    const info = lookupProduceSeasonality("mango", { cfCountry: "BR" }, 11)!;
    expect(info.origins.some((o) => o.code === "BR")).toBe(false);
  });

  it("returns null for unknown produce", () => {
    expect(lookupProduceSeasonality("dragonfruit_xyz", { cfCountry: "GB" }, 5)).toBeNull();
  });

  it("respects copy limits for every slug, month and zone", () => {
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
  });
});
