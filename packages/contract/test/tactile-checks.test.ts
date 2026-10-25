import { describe, it, expect } from "vitest";
import { resolveTactileChecks, TACTILE_CHECKS_CATALOG, ManualCheckSchema } from "../src";

describe("tactile checks resolution", () => {
  it("validates all catalog items against ManualCheckSchema and has no em/en dashes", () => {
    for (const [locale, catalog] of Object.entries(TACTILE_CHECKS_CATALOG)) {
      for (const [slug, checks] of Object.entries(catalog)) {
        expect(checks.length).toBeGreaterThan(0);
        for (const check of checks) {
          const parsed = ManualCheckSchema.safeParse(check);
          expect(parsed.success, `Invalid check in ${locale}:${slug}: ${JSON.stringify(check)}`).toBe(true);
          expect(check.trait).not.toMatch(/[\u2013\u2014]/);
          expect(check.how).not.toMatch(/[\u2013\u2014]/);
          expect(check.whatItMeans).not.toMatch(/[\u2013\u2014]/);
        }
      }
    }
  });

  it("resolves checks for known produce types in en-GB and pt-BR", () => {
    const wmEn = resolveTactileChecks("watermelon", "en-GB");
    expect(wmEn.length).toBe(2);
    expect(wmEn[0].trait).toBe("Field spot");

    const wmPt = resolveTactileChecks("melancia", "pt-BR");
    expect(wmPt.length).toBe(2);
    expect(wmPt[0].trait).toBe("Mancha de solo");

    const avo = resolveTactileChecks("Hass Avocado", "en-GB");
    expect(avo[0].trait).toBe("Gentle thumb press");
  });

  it("resolves melon variants and citrus aliases", () => {
    const cantaloupe = resolveTactileChecks("cantaloupe", "en-GB");
    expect(cantaloupe[0].trait).toBe("Blossom end give");

    const lemon = resolveTactileChecks("lemon", "en-GB");
    expect(lemon[0].trait).toBe("Density in hand");
  });

  it("falls back to generic catalog when produce is unknown or null", () => {
    const fallbackEn = resolveTactileChecks("alien_fruit_xyz", "en-GB");
    expect(fallbackEn.length).toBe(2);
    expect(fallbackEn[0].trait).toBe("Gentle yield");

    const fallbackNull = resolveTactileChecks(null, "pt-BR");
    expect(fallbackNull.length).toBe(2);
    expect(fallbackNull[0].trait).toBe("Firmeza ao toque");
  });

  it("prioritizes model-provided manual checks when present", () => {
    const custom = [{ trait: "Rattle seeds", how: "Shake it gently", whatItMeans: "Loose seeds indicate ripeness" }];
    const resolved = resolveTactileChecks("watermelon", "en-GB", custom);
    expect(resolved).toEqual(custom);
  });
});
