import type { DeepScanRequest } from "@pomona/contract";
import {
  DeepScanResponseModelSchema,
  DeepScanAbstentionReasonSchema,
  ModelStatusSchema,
} from "@pomona/contract";
import type { PromptConfig } from "./v1";
import deepScanTemplates from "./templates/deep-scan.json";

const lines = (name: keyof typeof deepScanTemplates) =>
  (deepScanTemplates[name] as readonly string[]).join("\n");

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Missing prompt value: ${key}`);
    return values[key];
  });
}

export const deepScanPromptConfig: PromptConfig = {
  version: "deep_scan_v1",
  buildSystemPrompt: (): string => lines("deepScanSystem"),
  buildUserPrompt: (request, repairErrors) => {
    let prompt = lines("deepScanUser").replace("{{locale}}", request.locale);
    if (repairErrors?.length) {
      prompt += interpolate(lines("deepScanRepair"), {
        locale: request.locale,
        errors: repairErrors.map((error) => `- ${error}`).join("\n"),
      });
    }
    return prompt;
  },
  buildRepairPrompt: (request, repairErrors) =>
    deepScanPromptConfig.buildUserPrompt(request, repairErrors),
};

/**
 * Gemini's OpenAPI responseSchema requires array items; every array here is homogeneous,
 * so the contract model schema flattens without special-casing. .describe() carries the
 * behavioral rules the prompt states, so generation sees them at the schema layer too.
 */
export const deepScanProviderSchema = DeepScanResponseModelSchema.extend({
  status: ModelStatusSchema.describe(
    "no_produce: the composite does not show one fresh fruit. unclear_photo: blur or sealed packaging blocks every readable grading surface. insufficient_evidence: the readable tiles are not enough (see abstentionReason). ok: the tiles support a maturity verdict."
  ),
  abstentionReason: DeepScanAbstentionReasonSchema.nullable().describe(
    "Only for insufficient_evidence: insufficient_view_coverage when too little of the fruit is readable across tiles; same_side_only when only one side is visible and the hidden side would decide. Never infer the hidden side. Null for every other status."
  ),
});
