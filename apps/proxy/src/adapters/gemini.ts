import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import {
  ScanResponseModelSchema,
  ModelStatusSchema,
  ProduceInfoSchema,
  VerdictSchema,
  FollowUpSchema,
  AfterPurchaseSchema,
} from "@pomona/contract";
import type { VisionProviderAdapter, AdapterInput, AdapterRawResult } from "./types";
import { normalizeTokenUsage } from "./types";

/**
 * Gemini's OpenAPI responseSchema requires `items` on arrays to be a single schema object
 * rather than a JSON Schema Draft-07 tuple array (`z.tuple`).
 * `verifyAndResolveScanResponse` subsequently validates the exact 4-tuple via `ScanResponseModelSchema`.
 */
const GeminiStorageStageSchema = z.object({
  where: z.enum(["counter", "fridge", "pantry", "cool_dark"]),
  whereLabel: z.string().describe("Max 24 chars, e.g. 'Counter' or 'Fridge'"),
  summary: z.string().describe("Max 32 chars, e.g. 'Counter · whole'"),
  tip: z.string().describe("Max 90 chars"),
});

const GeminiProviderSchema = z.object({
  status: ModelStatusSchema,
  message: z.string().nullable().describe("Null when status is ok; descriptive error message otherwise (max 160 chars)"),
  produce: ProduceInfoSchema.nullable(),
  candidates: z.array(
    z.object({
      id: z.string().describe("Candidate ID, e.g. 'c1', 'c2'"),
      box: z
        .array(z.number().int())
        .min(4)
        .max(4)
        .describe("Exactly 4 integers: [ymin, xmin, ymax, xmax] normalized 0-1000"),
      score: z.number().describe("Ripeness score on 0.0 to 10.0 scale (never 0-100)"),
      ripeness: z.enum(["underripe", "almost_ripe", "ripe", "overripe"]),
      traits: z.array(z.string()).describe("1 to 4 short trait tags, each max 28 chars"),
      flipSummary: z.string().nullable().describe("Null on Round 1; concise summary (max 80 chars) on Round 2/3"),
    })
  ),
  verdict: z
    .object({
      winnerId: z.string().nullable(),
      runnerUpId: z.string().nullable(),
      confidence: z.enum(["low", "medium", "high"]),
      headline: z.string().describe("Short headline, max 32 chars, e.g. 'Buy it.'"),
    })
    .nullable(),
  followUp: z
    .object({
      targetCandidateId: z.string(),
      targetRole: z.enum(["runner_up", "first_pick"]),
      bannerText: z.string().describe("Max 110 chars, must include produce displayName"),
      flipHeadline: z.string().describe("Max 48 chars, must include produce displayName"),
      instruction: z.string().describe("Max 120 chars, must include produce displayName"),
    })
    .nullable(),
  afterPurchase: z
    .object({
      readyInDays: z.object({ min: z.number().int(), max: z.number().int() }),
      eatWithinDays: z.object({ min: z.number().int(), max: z.number().int() }),
      eatWithinLabel: z.string().describe("Max 28 chars, e.g. '4–6 days'"),
      storage: z.object({
        beforeCut: GeminiStorageStageSchema,
        afterCut: GeminiStorageStageSchema,
      }),
    })
    .nullable(),
});

export interface GeminiVisionAdapterOptions {
  apiKey: string;
  modelId?: string;
  baseURL?: string;
  generateObjectFn?: typeof generateObject;
}

export function createGeminiVisionAdapter(options: GeminiVisionAdapterOptions): VisionProviderAdapter {
  const modelId = options.modelId ?? "gemini-3.1-flash-lite";
  const generateFn = options.generateObjectFn ?? generateObject;

  const google = createGoogleGenerativeAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });

  return {
    providerId: "google",
    modelId,
    async analyzeProduce(input: AdapterInput, signal?: AbortSignal): Promise<AdapterRawResult> {
      const model = google(modelId);

      const result = await generateFn({
        model: model as any,
        schema: GeminiProviderSchema as any,
        system: input.systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: input.userPrompt,
              },
              {
                type: "image",
                image: `data:${input.imageMimeType};base64,${input.imageBase64}`,
              },
            ],
          },
        ],
        ...(modelId.includes("lite")
          ? {}
          : {
              providerOptions: {
                google: {
                  thinkingConfig: {
                    thinkingBudget: 0,
                  },
                },
              },
            }),
        abortSignal: signal,
      });

      return {
        object: result.object,
        usage: normalizeTokenUsage(result.usage),
      };
    },
  };
}
