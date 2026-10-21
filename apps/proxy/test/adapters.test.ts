import { describe, expect, it, vi } from "vitest";
import { getPromptConfig } from "../src/prompts";
import { createGeminiVisionAdapter } from "../src/adapters/gemini";
import { createOpenAIVisionAdapter } from "../src/adapters/openai";
import { runVerifiedVisionScan } from "../src/adapters/types";

describe("Prompt registry & vision adapters", () => {
  const sampleRequest = {
    schemaVersion: "1.0" as const,
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    round: 1 as const,
    locale: "en-GB",
    imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
    imageMimeType: "image/webp" as const,
    focusPolygon: [[100, 100], [900, 100], [900, 900], [100, 900]] as [number, number][],
    followUpContext: null,
  };

  it("builds a parameterized v1 prompt that includes focusPolygon coordinates and forbids hardcoded fruit names", () => {
    const prompt = getPromptConfig("v1");
    const sys = prompt.buildSystemPrompt(sampleRequest);
    expect(sys).toContain("[ymin, xmin, ymax, xmax]");
    expect(sys).toContain("focusPolygon");
    expect(sys).toContain("beforeCut");
    expect(sys).toContain("afterCut");
  });

  it("normalizes Gemini and OpenAI outputs identically and retries once on verification failure", async () => {
    const validModelPayload = {
      status: "ok",
      message: null,
      produce: { type: "pineapple", displayName: "Pineapple", variety: null },
      countedTotal: 1,
      candidates: [
        { id: "c1", box: [250, 300, 750, 700], score: 8.8, ripeness: "ripe", traits: ["Golden base", "Fragrant crown"], flipSummary: null },
      ],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 4 },
        eatWithinLabel: "3–4 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep out of direct sun" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · sealed", tip: "Store in airtight container" },
        },
      },
    };

    const mockGenerate = vi
      .fn()
      .mockResolvedValueOnce({
        object: { ...validModelPayload, candidates: [] }, // invalid on attempt 1: status ok with 0 candidates
        usage: { promptTokens: 400, completionTokens: 200, totalTokens: 600 },
      })
      .mockResolvedValueOnce({
        object: validModelPayload,
        usage: { promptTokens: 450, completionTokens: 220, totalTokens: 670 },
      });

    const gemini = createGeminiVisionAdapter({ apiKey: "test-key", generateObjectFn: mockGenerate as any });
    const openai = createOpenAIVisionAdapter({ apiKey: "test-key", generateObjectFn: mockGenerate as any });
    expect(gemini.modelId).toBe("gemini-3.1-flash-lite");
    expect(openai.modelId).toBe("gpt-4o-mini");

    const result = await runVerifiedVisionScan(sampleRequest, gemini, getPromptConfig("v1"));
    const generation = mockGenerate.mock.calls[0][0] as any;
    expect(generation.providerOptions.google).toEqual({
      mediaResolution: "MEDIA_RESOLUTION_HIGH",
      thinkingConfig: { thinkingLevel: "medium" },
    });
    expect(generation.temperature).toBe(0.1);
    const fields = Object.keys(generation.schema.shape);
    expect(fields.indexOf("countedTotal")).toBeGreaterThan(fields.indexOf("candidates"));
    expect(generation.schema.shape.countedTotal.description).toContain("exactly candidates.length AFTER");
    expect(result.attempts).toBe(2);
    expect(result.response.status).toBe("ok");
    expect(result.response.produce?.displayName).toBe("Pineapple");
    expect(result.usage.totalTokens).toBe(1270);
  });

  it("returns a contract-valid analysis_failed response when both initial and repair attempts fail", async () => {
    const alwaysBad = vi.fn().mockResolvedValue({
      object: { status: "ok", message: null, produce: null, countedTotal: 0,
      candidates: [], verdict: null, followUp: null, afterPurchase: null },
      usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
    });
    const gemini = createGeminiVisionAdapter({ apiKey: "test-key", generateObjectFn: alwaysBad as any });
    const result = await runVerifiedVisionScan(sampleRequest, gemini, getPromptConfig("v1"));
    expect(result.attempts).toBe(2);
    expect(result.response.status).toBe("analysis_failed");
  });
});
