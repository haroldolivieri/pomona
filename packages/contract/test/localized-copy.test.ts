import { expect, it } from "vitest";
import { lookupProduceSeasonality, resolveCandidatesForTarget, SeasonalityInfoSchema, SEASONALITY_SLUGS } from "../src";
it("keeps Brazil calendars with English copy and UK calendars with Portuguese copy", () => {
  const br = lookupProduceSeasonality("mango", { cfCountry: "BR", locale: "en-GB" }, 11, "en-GB")!;
  const gb = lookupProduceSeasonality("mango", { cfCountry: "GB", locale: "pt-BR" }, 11, "pt-BR")!;
  expect(br.status).toBe("peak"); expect(gb.status).toBe("imported_year_round");
  expect(gb.badgeText).toBe("Importado o ano todo");
});
it("preserves every seasonal calculation and validates Portuguese formatting", () => {
  for (const slug of SEASONALITY_SLUGS) for (const country of ["BR", "GB", "ES", "US", "CL", "IN"]) for (let month = 1; month <= 12; month++) {
    const en = lookupProduceSeasonality(slug, { cfCountry: country }, month, "en-GB")!;
    const pt = lookupProduceSeasonality(slug, { cfCountry: country }, month, "pt-BR")!;
    expect(pt.status).toBe(en.status);
    expect(pt.shopperCountry).toBe(country);
    expect(pt.produceSlug).toBe(en.produceSlug);
    expect(pt.origins.map((origin) => [origin.code, origin.status])).toEqual(en.origins.map((origin) => [origin.code, origin.status]));
    expect(SeasonalityInfoSchema.safeParse(pt).success).toBe(true);
  }
});
it("does not let translated target headlines change ranking", () => {
  const candidates = [{id:"c1",box:[0,0,100,100] as [number,number,number,number],score:8.6,ripeness:"ripe" as const,traits:[],flipSummary:null}];
  for (const window of ["ready_now", "in_2_3_days", "later_this_week"] as const) {
    const en = resolveCandidatesForTarget(candidates, window, "en-GB");
    const pt = resolveCandidatesForTarget(candidates, window, "pt-BR");
    expect(pt.winner).toEqual(en.winner); expect(pt.headline).not.toBe(en.headline); expect(pt.headlineKind).toBe(en.headlineKind);
  }
  expect(resolveCandidatesForTarget([], "ready_now", "pt-BR").headlineKind).toBe("other");
});
