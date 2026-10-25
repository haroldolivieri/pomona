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
}, 30000);
it("does not let translated target headlines change ranking", () => {
  const candidates = [{id:"c1",box:[0,0,100,100] as [number,number,number,number],score:8.6,ripeness:"ripe" as const,traits:[],flipSummary:null}];
  for (const window of ["ready_now", "in_2_3_days", "later_this_week"] as const) {
    const en = resolveCandidatesForTarget(candidates, window, "en-GB");
    const pt = resolveCandidatesForTarget(candidates, window, "pt-BR");
    expect(pt.winner).toEqual(en.winner); expect(pt.headline).not.toBe(en.headline); expect(pt.headlineKind).toBe(en.headlineKind);
  }
  expect(resolveCandidatesForTarget([], "ready_now", "pt-BR").headlineKind).toBe("other");
});

it("Portuguese produce copy includes vegetables and avoids ambiguous camera instructions", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(readFileSync(new URL("../../../apps/web/src/i18n/locales/pt-BR.json", import.meta.url), "utf8"));
  expect(catalog.camera.promptTitle).toBe("Fotografe o hortifruti que quer comparar");
  expect(catalog.camera.promptSubtitle).toContain("frutas, verduras e legumes");
  expect(JSON.stringify(catalog)).not.toMatch(/produtos frescos|fruta ou um grupo/i);
});

it("Portuguese ranking labels consistently use primeiro and segundo lugar", async () => {
  const { readFileSync } = await import("node:fs");
  const web = JSON.parse(readFileSync(new URL("../../../apps/web/src/i18n/locales/pt-BR.json", import.meta.url), "utf8"));
  const shared = JSON.parse(readFileSync(new URL("../src/locales/pt-BR.json", import.meta.url), "utf8"));
  expect(web.copy["1stWinner2"]).toBe("Primeiro lugar");
  expect(web.copy.runnerUp).toBe("Segundo lugar");
  expect(web.result.compareWithRunnerUp).toBe("Comparar com o segundo lugar");
  expect(shared.verifier.finalHeadline).toContain("primeiro lugar");
  expect(JSON.stringify([web, shared])).not.toMatch(/primeira opção|segunda opção/i);
});

it("storage instructions avoid joining tab labels into prose and winner headings avoid repetition", async () => {
  const { readFileSync } = await import("node:fs");
  for (const locale of ["en", "pt-BR"]) {
    const catalog = JSON.parse(readFileSync(new URL(`../../../apps/web/src/i18n/locales/${locale}.json`, import.meta.url), "utf8"));
    expect(catalog.copy.showTheHiddenUndersideSoPomonaCan).not.toContain("{{value1}}");
    expect(catalog.copy["1stWinnerWinsBeatsRunnerUpVs"]).not.toMatch(/VENCE · SUPERA|WINS · BEATS/);
    if (locale === "pt-BR") expect(catalog.copy.showTheHiddenUndersideSoPomonaCan).toContain("antes de guardar por vários dias");
  }
});
