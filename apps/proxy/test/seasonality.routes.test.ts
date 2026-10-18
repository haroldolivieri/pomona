import { describe, expect, it } from "vitest";
import { createProxyApp } from "../src/index";
import { createInMemoryQuotaStore } from "../src/quota/budget";

const env = {
  GEMINI_API_KEY: "test-gemini-key",
  COOKIE_SIGNING_SECRET: "test-signing-secret-32-bytes-long",
  ACTIVE_PROMPT_VERSION: "v1",
  ACTIVE_PROVIDER: "gemini",
};

function okOutput(type: string, displayName: string) {
  return {
    status: "ok",
    message: null,
    produce: { type, displayName, variety: null },
    candidates: [
      { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], flipSummary: null },
    ],
    verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
    followUp: null,
    afterPurchase: {
      readyInDays: { min: 0, max: 0 },
      eatWithinDays: { min: 3, max: 5 },
      eatWithinLabel: "3–5 days",
      storage: {
        beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep whole" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
      },
    },
  };
}

async function scan(rawOutput: unknown, locale: string, prompts: string[] = []) {
  const app = createProxyApp({
    quotaStore: createInMemoryQuotaStore(),
    adapterFactory: (modelId) => ({
      providerId: "gemini",
      modelId,
      analyzeProduce: async (input: any) => {
        prompts.push(`${input.systemPrompt}\n${input.userPrompt}`);
        return { rawOutput, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
      },
    }),
  });
  const res = await app.request(
    "/api/v1/scan",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "1.0",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        round: 1,
        locale,
        imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
        imageMimeType: "image/webp",
        focusPolygon: null,
        followUpContext: null,
      }),
    },
    env
  );
  return res.json();
}

describe("POST /api/v1/scan seasonality enrichment", () => {
  it("derives the shopper country from a pt-BR locale when Cloudflare data is absent", async () => {
    const json = await scan(okOutput("mango", "Mango"), "pt-BR");
    expect(json.seasonality.shopperCountry).toBe("BR");
    expect(json.seasonality.produceSlug).toBe("mango");
  });

  it("derives GB from an en-GB locale", async () => {
    const json = await scan(okOutput("mango", "Mango"), "en-GB");
    expect(json.seasonality.shopperCountry).toBe("GB");
    expect(json.seasonality.status).toBe("imported_year_round");
  });

  it("sets seasonality to null for unknown produce", async () => {
    const json = await scan(okOutput("mystery_pod_xyz", "Mystery Pod"), "en-GB");
    expect(json.status).toBe("ok");
    expect(json.seasonality ?? null).toBeNull();
  });

  it("falls back to produce.displayName when produce.type is generic", async () => {
    const json = await scan(okOutput("fruit", "Ponkan Mandarin"), "pt-BR");
    expect(json.status).toBe("ok");
    expect(json.seasonality.produceSlug).toBe("mandarin");
  });

  it("omits seasonality for non-ok scans", async () => {
    const json = await scan(
      { status: "no_produce", message: "No produce", produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null },
      "en-GB"
    );
    expect(json.status).toBe("no_produce");
    expect(json.seasonality ?? null).toBeNull();
  });

  it("never mentions seasonality in the prompts sent to the model", async () => {
    const prompts: string[] = [];
    await scan(okOutput("mango", "Mango"), "en-GB", prompts);
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) expect(p.toLowerCase()).not.toContain("seasonality");
  });
});
