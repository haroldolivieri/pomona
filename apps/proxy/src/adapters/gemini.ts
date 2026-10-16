import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { ScanResponseModelSchema } from "@pomona/contract";
import type { VisionProviderAdapter, AdapterInput, AdapterRawResult } from "./types";
import { normalizeTokenUsage } from "./types";

export interface GeminiVisionAdapterOptions {
  apiKey: string;
  modelId?: string;
  baseURL?: string;
  generateObjectFn?: typeof generateObject;
}

export function createGeminiVisionAdapter(options: GeminiVisionAdapterOptions): VisionProviderAdapter {
  const modelId = options.modelId ?? "gemini-2.5-flash";
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
        schema: ScanResponseModelSchema,
        messages: [
          {
            role: "system",
            content: input.systemPrompt,
          },
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
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        },
        abortSignal: signal,
      });

      return {
        object: result.object,
        usage: normalizeTokenUsage(result.usage),
      };
    },
  };
}
