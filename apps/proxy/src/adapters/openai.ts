import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { ScanResponseModelSchema } from "@pomona/contract";
import type { VisionProviderAdapter, AdapterInput, AdapterRawResult } from "./types";
import { normalizeTokenUsage } from "./types";
import { getGatewayTraceHeaders, type GatewayRouting } from "./gateway";

export interface OpenAIVisionAdapterOptions {
  apiKey: string;
  modelId?: string;
  baseURL?: string;
  gateway?: GatewayRouting;
  generateObjectFn?: typeof generateObject;
}

export function createOpenAIVisionAdapter(options: OpenAIVisionAdapterOptions): VisionProviderAdapter {
  const modelId = options.modelId ?? "gpt-4o-mini";
  const generateFn = options.generateObjectFn ?? generateObject;

  const openai = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.gateway?.baseURL ?? options.baseURL,
    headers: options.gateway?.headers,
  });

  return {
    providerId: "openai",
    modelId,
    async analyzeProduce(input: AdapterInput, signal?: AbortSignal): Promise<AdapterRawResult> {
      const model = openai(modelId);

      const result = await generateFn({
        model: model as any,
        schema: ScanResponseModelSchema,
        system: input.systemPrompt,
        headers: getGatewayTraceHeaders(options.gateway, input.trace),
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
        abortSignal: signal,
      });

      return {
        object: result.object,
        usage: normalizeTokenUsage(result.usage),
      };
    },
  };
}
