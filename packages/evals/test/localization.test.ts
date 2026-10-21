import { describe, expect, it } from "vitest";
import { resolveDisplayLocale } from "@pomona/contract";

describe("display language acceptance", () => {
  it.each([
    ["en-GB", "pt-BR", "en-GB"], ["pt-BR", "en", "pt-BR"],
    ["invalid", "pt", "pt-BR"], [null, "pt-PT", "pt-BR"],
    [null, "PT-br", "pt-BR"], [null, "en-US", "en-GB"],
    [null, "es,pt;q=0.8,en;q=0.5", "pt-BR"],
    [null, "pt;q=0,en;q=1", "en-GB"], [null, "en;q=0,pt;q=0.4", "pt-BR"],
    [null, "pt;q=no,en", "en-GB"], [null, "pt;q=2,en", "en-GB"],
    [null, "pt;q=0.8,en;q=0.8", "pt-BR"],
    [null, "pt-BR;q=0,pt;q=0.8,en;q=0.5", "en-GB"],
    [null, "en-GB;q=0,en;q=1,pt;q=0.5", "pt-BR"],
    [null, "pt;q=0,pt-BR;q=1,en;q=0.5", "pt-BR"],
    [null, "*", "en-GB"], [null, "", "en-GB"], [null, null, "en-GB"],
    ["<script>", "pt", "pt-BR"], ["pt-PT", "en", "en-GB"],
  ])("saved=%s browser=%s resolves %s", (saved, browser, expected) => {
    expect(resolveDisplayLocale(saved, browser)).toBe(expected);
  });
});

import { ScanResponseModelSchema, resolveAbstentionReason, type ScanRequest, lookupProduceSeasonality } from "@pomona/contract";
import { verifyAndResolveScanResponse, v1PromptConfig } from "@pomona/proxy";
const request = (round: 1 | 2 | 3, locale = "pt-BR"): ScanRequest => ({ schemaVersion: "1.0", sessionId: "12345678-1234-4234-8234-123456789abc", round, locale, imageBase64: "YWJj", imageMimeType: "image/jpeg", focusPolygon: null, followUpContext: null });
const abstention = { status: "insufficient_evidence", abstentionReason: "missing_evidence", countedTotal: null, message: "Não consigo avaliar a maturação. Mostre a parte de baixo.", produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null };
it.each([1, 2, 3] as const)("round %s preserves Portuguese abstention and schema", (round) => {
  expect(ScanResponseModelSchema.safeParse(abstention).success).toBe(true);
  const result = verifyAndResolveScanResponse(abstention, {request: request(round), promptVersion:"v1",modelId:"test"});
  expect(result.ok).toBe(true);
  if (result.ok) { expect(result.response.message).toBe(abstention.message); expect(result.response.verdict).toBeNull(); }
});
it("preserves positive Portuguese tie evidence but rejects hidden evidence", () => {
  expect(resolveAbstentionReason("assessed_tie", "Todos estão maduros. Escolha outro grupo com estágios diferentes.")).toBe("assessed_tie");
  expect(resolveAbstentionReason("assessed_tie", "Todos parecem maduros, mas a base está oculta. Vire os frutos.")).toBe("missing_evidence");
});
it.each([1,2,3] as const)("round %s localizes deterministic verifier fallback", (round) => {
  const result = verifyAndResolveScanResponse({...abstention,message:"long ".repeat(100)}, {request:request(round),promptVersion:"v1",modelId:"test"});
  expect(result.ok).toBe(true);
  if(result.ok) expect(result.response.message).toBe("Não consigo escolher por este ângulo. Mostre a base ou o talo.");
});
it.each([1,2,3] as const)("round %s changes rendered prompts only at existing locale input", (round) => {
 const en=request(round,"en-GB"), pt=request(round);
 expect(v1PromptConfig.buildSystemPrompt(pt).replaceAll("pt-BR","en-GB")).toBe(v1PromptConfig.buildSystemPrompt(en));
 expect(v1PromptConfig.buildUserPrompt(pt).replaceAll("pt-BR","en-GB")).toBe(v1PromptConfig.buildUserPrompt(en));
});
it("keeps actual country independent from language", () => {
 expect(lookupProduceSeasonality("mango",{cfCountry:"BR",locale:"en-GB"},11,"en-GB")?.status).toBe("peak");
 expect(lookupProduceSeasonality("mango",{cfCountry:"GB",locale:"pt-BR"},11,"pt-BR")?.status).toBe("imported_year_round");
});

it.each([
 "Não consigo ver se todos estão maduros. Mostre a base.",
 "Todos têm a base obstruída; não sei se estão maduros.",
 "Não é visível a base. Todos parecem maduros.",
 "Não dá para saber se todos estão maduros. Mostre outro ângulo.",
])("does not infer a tie from Portuguese uncertainty: %s", message => {
 expect(resolveAbstentionReason("assessed_tie",message)).toBe("missing_evidence");
});

it("Portuguese success values retain canonical model identifiers and schema", () => {
  const success = {
    status:"ok",abstentionReason:null,countedTotal:1,message:null,
    produce:{type:"watermelon",displayName:"Melancia",variety:null},
    candidates:[{id:"c1",box:[100,100,600,600],score:8.6,ripeness:"ripe",traits:["Casca fosca"],flipSummary:null}],
    verdict:{winnerId:"c1",runnerUpId:null,confidence:"high",headline:"Leve este."},followUp:null,
    afterPurchase:{readyInDays:{min:0,max:0},eatWithinDays:{min:3,max:5},eatWithinLabel:"3–5 dias",storage:{beforeCut:{where:"counter",whereLabel:"Bancada",summary:"Inteira",tip:"Evite luz direta"},afterCut:{where:"fridge",whereLabel:"Geladeira",summary:"Em pote fechado",tip:"Mantenha refrigerado"}}},
  };
  expect(ScanResponseModelSchema.safeParse(success).success).toBe(true);
  const result=verifyAndResolveScanResponse(success,{request:request(1),promptVersion:"v1",modelId:"test"});
  expect(result.ok).toBe(true);
  if(result.ok){
    expect(result.response.produce).toEqual({type:"watermelon",displayName:"Melancia",variety:null});
    expect(result.response.candidates[0].ripeness).toBe("ripe");
    expect(result.response.afterPurchase?.storage.afterCut.where).toBe("fridge");
    expect(result.response.verdict?.headline).toBe("Leve este.");
  }
});

// Catalog acceptance: category wording stays natural and excludes literal product translations.
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
  const shared = JSON.parse(readFileSync(new URL("../../contract/src/locales/pt-BR.json", import.meta.url), "utf8"));
  expect(web.copy["1stWinner2"]).toBe("Primeiro lugar");
  expect(web.copy.runnerUp).toBe("Segundo lugar");
  expect(web.result.compareWithRunnerUp).toBe("Comparar com o segundo lugar");
  expect(shared.verifier.finalHeadline).toContain("primeiro lugar");
  expect(JSON.stringify([web, shared])).not.toMatch(/primeira opção|segunda opção/i);
});
