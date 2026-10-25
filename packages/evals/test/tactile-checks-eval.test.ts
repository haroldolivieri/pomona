import { describe, it, expect } from "vitest";
import {
  resolveTactileChecks,
  TACTILE_CHECKS_CATALOG,
  ManualCheckSchema,
  type ManualCheck,
} from "@pomona/contract";

describe("eval: produce tactile checks coverage and localization", () => {
  const REQUIRED_SLUGS = [
    "watermelon",
    "avocado",
    "melon",
    "cantaloupe",
    "honeydew",
    "mango",
    "pineapple",
    "papaya",
    "banana",
    "tomato",
    "peach",
    "strawberry",
    "apple",
    "orange",
    "generic",
  ] as const;

  it("evaluates that all required produce categories exist in both en-GB and pt-BR", () => {
    for (const locale of ["en-GB", "pt-BR"] as const) {
      const catalog = TACTILE_CHECKS_CATALOG[locale];
      expect(catalog, `Missing catalog for ${locale}`).toBeDefined();
      for (const slug of REQUIRED_SLUGS) {
        const checks = catalog[slug];
        expect(checks, `Missing slug ${slug} in ${locale}`).toBeDefined();
        expect(checks.length, `Empty checks for ${slug} in ${locale}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("evaluates that every check satisfies ManualCheckSchema and has no em/en dashes", () => {
    for (const [locale, catalog] of Object.entries(TACTILE_CHECKS_CATALOG)) {
      for (const [slug, checks] of Object.entries(catalog)) {
        for (const check of checks) {
          const parsed = ManualCheckSchema.safeParse(check);
          expect(parsed.success, `Invalid check in ${locale}:${slug}`).toBe(true);
          expect(check.trait).not.toMatch(/[\u2013\u2014]/);
          expect(check.how).not.toMatch(/[\u2013\u2014]/);
          expect(check.whatItMeans).not.toMatch(/[\u2013\u2014]/);
          expect(check.trait.length).toBeLessThanOrEqual(40);
          expect(check.how.length).toBeLessThanOrEqual(240);
          expect(check.whatItMeans.length).toBeLessThanOrEqual(240);
        }
      }
    }
  });

  it("evaluates resolution on comparison produces across Portuguese and English inputs", () => {
    const ptWatermelon = resolveTactileChecks("Melancia", "pt-BR");
    expect(ptWatermelon.length).toBeGreaterThan(0);
    expect(ptWatermelon[0].trait).toBe("Mancha de solo");

    const enWatermelon = resolveTactileChecks("Watermelon", "en-GB");
    expect(enWatermelon.length).toBeGreaterThan(0);
    expect(enWatermelon[0].trait).toBe("Field spot");

    const ptAvocado = resolveTactileChecks("abacate", "pt-BR");
    expect(ptAvocado.length).toBeGreaterThan(0);
    expect(ptAvocado[0].trait).toBe("Toque suave no topo");

    const enAvocado = resolveTactileChecks("Hass Avocado", "en-GB");
    expect(enAvocado.length).toBeGreaterThan(0);
    expect(enAvocado[0].trait).toBe("Gentle thumb press");
  });

  it("evaluates fallback for unseen exotic produce without crashing", () => {
    const unknown = resolveTactileChecks("Dragonfruit Pitaya 123", "en-GB");
    expect(unknown.length).toBe(2);
    expect(unknown[0].trait).toBe("Gentle yield");

    const empty = resolveTactileChecks(null, "pt-BR");
    expect(empty.length).toBe(2);
    expect(empty[0].trait).toBe("Firmeza ao toque");
  });

  it("evaluates priority of dynamic model manual checks over static catalog", () => {
    const modelChecks: ManualCheck[] = [
      {
        trait: "Dynamic Knock",
        how: "Custom tapping instruction from model",
        whatItMeans: "Model confidence indicator",
      },
    ];
    const resolved = resolveTactileChecks("watermelon", "en-GB", modelChecks);
    expect(resolved).toEqual(modelChecks);
  });
});
