import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ScanResponseModelSchema, resolveAbstentionReason, type ScanRequest, lookupProduceSeasonality } from "@pomona/contract";
import { verifyAndResolveScanResponse, v1PromptConfig } from "@pomona/proxy";

const request = (round: 1 | 2 | 3, locale = "pt-BR"): ScanRequest => ({
  schemaVersion: "1.0",
  sessionId: "12345678-1234-4234-8234-123456789abc",
  round,
  locale,
  imageBase64: "YWJj",
  imageMimeType: "image/jpeg",
  focusPolygon: null,
  followUpContext: null,
});

const abstention = {
  status: "insufficient_evidence",
  abstentionReason: "missing_evidence",
  countedTotal: null,
  message: "Não consigo avaliar a maturação. Mostre a parte de baixo.",
  produce: null,
  candidates: [],
  verdict: null,
  followUp: null,
  afterPurchase: null,
};

describe("Portuguese model and prompt evaluations", () => {
  it.each([1, 2, 3] as const)("round %s preserves Portuguese abstention and schema", (round) => {
    expect(ScanResponseModelSchema.safeParse(abstention).success).toBe(true);
    const result = verifyAndResolveScanResponse(abstention, { request: request(round), promptVersion: "v1", modelId: "test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.message).toBe(abstention.message);
      expect(result.response.verdict).toBeNull();
    }
  });

  it("preserves positive Portuguese tie evidence but rejects hidden evidence", () => {
    expect(resolveAbstentionReason("assessed_tie", "Todos estão maduros. Escolha outro grupo com estágios diferentes.")).toBe("assessed_tie");
    expect(resolveAbstentionReason("assessed_tie", "Todos parecem maduros, mas a base está oculta. Vire os frutos.")).toBe("missing_evidence");
  });

  it.each([1, 2, 3] as const)("round %s localizes deterministic verifier fallback", (round) => {
    const result = verifyAndResolveScanResponse({ ...abstention, message: "long ".repeat(100) }, { request: request(round), promptVersion: "v1", modelId: "test" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.message).toBe("Não consigo escolher por este ângulo. Mostre a base ou o talo.");
  });

  it.each([1, 2, 3] as const)("round %s changes rendered prompts only at existing locale input", (round) => {
    const en = request(round, "en-GB");
    const pt = request(round);
    expect(v1PromptConfig.buildSystemPrompt(pt).replaceAll("pt-BR", "en-GB")).toBe(v1PromptConfig.buildSystemPrompt(en));
    expect(v1PromptConfig.buildUserPrompt(pt).replaceAll("pt-BR", "en-GB")).toBe(v1PromptConfig.buildUserPrompt(en));
  });

  it("keeps actual country independent from language", () => {
    expect(lookupProduceSeasonality("mango", { cfCountry: "BR", locale: "en-GB" }, 11, "en-GB")?.status).toBe("peak");
    expect(lookupProduceSeasonality("mango", { cfCountry: "GB", locale: "pt-BR" }, 11, "pt-BR")?.status).toBe("imported_year_round");
  });

  it.each([
    "Não consigo ver se todos estão maduros. Mostre a base.",
    "Todos têm a base obstruída; não sei se estão maduros.",
    "Não é visível a base. Todos parecem maduros.",
    "Não dá para saber se todos estão maduros. Mostre outro ângulo.",
  ])("does not infer a tie from Portuguese uncertainty: %s", (message) => {
    expect(resolveAbstentionReason("assessed_tie", message)).toBe("missing_evidence");
  });

  it("Portuguese success values retain canonical model identifiers and schema", () => {
    const success = {
      status: "ok",
      abstentionReason: null,
      countedTotal: 1,
      message: null,
      produce: { type: "watermelon", displayName: "Melancia", variety: null },
      candidates: [{ id: "c1", box: [100, 100, 600, 600], score: 8.6, ripeness: "ripe", traits: ["Casca fosca"], flipSummary: null }],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Leve este." },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3-5 dias",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Bancada", summary: "Inteira", tip: "Evite luz direta" },
          afterCut: { where: "fridge", whereLabel: "Geladeira", summary: "Em pote fechado", tip: "Mantenha refrigerado" },
        },
      },
    };
    expect(ScanResponseModelSchema.safeParse(success).success).toBe(true);
    const result = verifyAndResolveScanResponse(success, { request: request(1), promptVersion: "v1", modelId: "test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.produce).toEqual({ type: "watermelon", displayName: "Melancia", variety: null });
      expect(result.response.candidates[0].ripeness).toBe("ripe");
      expect(result.response.afterPurchase?.storage.afterCut.where).toBe("fridge");
      expect(result.response.verdict?.headline).toBe("Leve este.");
    }
  });

  it("evaluates single produce compare abstention to guide toward inspection", () => {
    const singleViewAbstention = {
      status: "insufficient_evidence",
      abstentionReason: "missing_evidence",
      countedTotal: null,
      message: "Cannot assess ripeness from this single view. Please provide a clear, well-lit image.",
      produce: null,
      candidates: [],
      verdict: null,
      followUp: null,
      afterPurchase: null,
    };
    const result = verifyAndResolveScanResponse(singleViewAbstention, {
      request: request(1, "pt-BR"),
      promptVersion: "v1",
      modelId: "test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.status).toBe("insufficient_evidence");
      expect(result.response.abstentionReason).toBe("missing_evidence");
      expect(result.response.candidates.length).toBeLessThanOrEqual(1);
      // In the UI, this flags isSingleProduce = true and displays the dedicated inspect guidance
      const isSingleProduce = result.response.candidates.length <= 1 || /single/i.test(result.response.message ?? "");
      expect(isSingleProduce).toBe(true);
    }
  });
});

describe("scan label asks the shopper to gently press while rotating", () => {
  const read = (locale: string) =>
    JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../apps/web/src/i18n/locales/${locale}.json`), "utf8")).deepScan;

  it("en and pt-BR capture labels both carry the gentle press cue and never ask for hard squeezing", () => {
    const en = read("en");
    const pt = read("pt-BR");
    for (const text of [en.captureInstruction, en.captureScanningSubtitle]) {
      expect(text.toLowerCase()).toContain("gently press");
      expect(text.toLowerCase()).not.toMatch(/squeeze|hard|firmly/);
    }
    for (const text of [pt.captureInstruction, pt.captureScanningSubtitle]) {
      expect(text.toLowerCase()).toContain("pression");
      expect(text.toLowerCase()).toContain("de leve");
    }
  });
});
