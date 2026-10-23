import type { DeepScanRequest } from "@pomona/contract";
import {
  DeepScanResponseModelSchema,
  DeepScanAbstentionReasonSchema,
  ModelStatusSchema,
} from "@pomona/contract";
import type { PromptConfig } from "./v1";
import deepScanTemplates from "./templates/deep-scan.json";
import v1Templates from "./templates/v1.json";

const v1Lines = v1Templates as unknown as Record<string, readonly string[]>;

// Reuse the EXACT after-purchase storage rules the normal scan uses — same wording, bounds and
// storage locations, so deep scan never runs a second storage dataset or prompt logic.
const afterPurchaseRuleLine = (() => {
  const rule = v1Lines.roundOneSystem.find((line) => line.includes("Provide readyInDays"));
  if (!rule || !rule.includes("cool_dark")) throw new Error("v1 template storage rule moved; update deep-scan prompt reuse");
  return rule;
})();

const storageLabelBounds = (() => {
  const line = v1Lines.roundOneSystem.find((l) => l.includes("eatWithinLabel<="));
  const match = line?.match(/eatWithinLabel<=\d+; storage whereLabel<=\d+, summary<=\d+, tip<=\d+\./);
  if (!match) throw new Error("v1 template storage bounds fragment moved; update deep-scan prompt reuse");
  return match[0];
})();

const storageReuseValues: Record<string, string> = {
  afterPurchaseRules: afterPurchaseRuleLine,
  storageLabelBounds,
};

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
  buildSystemPrompt: (): string => interpolate(lines("deepScanSystem"), storageReuseValues),
  buildUserPrompt: (request, repairErrors) => {
    let prompt = interpolate(lines("deepScanUser"), { ...storageReuseValues, locale: request.locale });
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
  afterPurchase: DeepScanResponseModelSchema.shape.afterPurchase.describe(
    "Reuse the same storage guidance rules as the normal scan: readyInDays (0 <= min <= max), eatWithinDays (1 <= min <= max <= 60), eatWithinLabel, and beforeCut/afterCut storage. Storage where is counter, fridge, pantry or cool_dark. afterPurchase is null for every non-ok status."
  ),
});
