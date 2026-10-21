import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { v1PromptConfig } from "@pomona/proxy";
import type { ScanRequest } from "@pomona/contract";
import promptTemplate from "../prompts/system-and-user.json";
import { templateFocusPolygon, templateRoundTwoContext, templateRoundThreeContext, renderDocumentationTemplate } from "../scripts/prompt-examples";

/**
 * Keeps docs/prompts/ (rendered production prompts) in sync with the prompt
 * builders in apps/proxy/src/prompts. Regenerate after prompt changes with:
 *   pnpm --filter @pomona/evals prompts:export
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_PROMPTS_DIR = path.resolve(__dirname, "../../../docs/prompts");

function makeRequest(overrides: Partial<ScanRequest> = {}): ScanRequest {
  return {
    schemaVersion: "1.0",
    sessionId: "00000000-0000-0000-0000-000000000000",
    round: 1,
    locale: "en-GB",
    imageBase64: "<image-base64>",
    imageMimeType: "image/jpeg",
    focusPolygon: null,
    followUpContext: null,
    ...overrides,
  };
}

const expectedFiles: Record<string, string> = {
  "round1-system.txt": v1PromptConfig.buildSystemPrompt(makeRequest({})),
  "round1-system-with-polygon.txt": v1PromptConfig.buildSystemPrompt(makeRequest({ focusPolygon: templateFocusPolygon })),
  "round1-user-no-polygon.txt": v1PromptConfig.buildUserPrompt(makeRequest({})),
  "round1-user-with-polygon.txt": v1PromptConfig.buildUserPrompt(
    makeRequest({ focusPolygon: templateFocusPolygon })
  ),
  "round1-user-repair.txt": v1PromptConfig.buildRepairPrompt!(makeRequest({}), [
    "{{validationErrors}}",
  ]),
  "round2-system.txt": v1PromptConfig.buildSystemPrompt(
    makeRequest({ round: 2, followUpContext: templateRoundTwoContext })
  ),
  "round2-user.txt": v1PromptConfig.buildUserPrompt(
    makeRequest({ round: 2, followUpContext: templateRoundTwoContext })
  ),
  "round3-system.txt": v1PromptConfig.buildSystemPrompt(
    makeRequest({ round: 3, followUpContext: templateRoundThreeContext })
  ),
  "round3-user.txt": v1PromptConfig.buildUserPrompt(
    makeRequest({ round: 3, followUpContext: templateRoundThreeContext })
  ),
};

describe("docs/prompts export stays in sync with production prompt builders", () => {
  it("exports every expected prompt file", () => {
    for (const file of Object.keys(expectedFiles)) {
      expect(fs.existsSync(path.join(DOCS_PROMPTS_DIR, file)), `${file} is missing; run pnpm --filter @pomona/evals prompts:export`).toBe(true);
    }
  });

  it("file bodies match the rendered production prompts exactly", () => {
    for (const [file, body] of Object.entries(expectedFiles)) {
      const content = fs.readFileSync(path.join(DOCS_PROMPTS_DIR, file), "utf-8");
      const builder = file.includes("system")
        ? "v1PromptConfig.buildSystemPrompt(request)"
        : file.includes("repair")
          ? "v1PromptConfig.buildRepairPrompt(request, repairErrors)"
          : "v1PromptConfig.buildUserPrompt(request)";
      expect(content.split("\n")[1]).toBe(`# Builder: ${builder}`);
      expect(content).not.toMatch(/\b(?:evals?|promptfoo|benchmark|ground[- ]truth)\b|scenario\s+\d|dataset\//i);
      expect(content).not.toMatch(/\b(?:watermelons?|avocados?|tomato(?:es)?|potato(?:es)?|grapes?|carrots?|bananas?|pineapples?|apples?|oranges?|citrus|onions?|lemons?|berries|roma)\b|field spot|webbing|chalky|8\.8[–-]9\.5|6\.0[–-]8\.0/i);
      expect(content.endsWith(`${renderDocumentationTemplate(body)}\n`), `${file} is stale; run pnpm --filter @pomona/evals prompts:export`).toBe(true);
    }
    for (const { content } of promptTemplate) {
      expect(content).not.toMatch(/\b(?:evals?|promptfoo|benchmark|ground[- ]truth)\b|scenario\s+\d|dataset\//i);
      expect(content).not.toMatch(/\b(?:watermelons?|avocados?|tomato(?:es)?|potato(?:es)?|grapes?|carrots?|bananas?|pineapples?|apples?|oranges?|citrus|onions?|lemons?|berries|roma)\b|field spot|webbing|chalky|8\.8[–-]9\.5|6\.0[–-]8\.0/i);
      expect(content).not.toMatch(/expected\w*|imageDescription|groundTruth/i);
    }
    const allowedVariables = new Set(["round", "focusPolygon", "followUpContext"]);
    for (const { content } of promptTemplate) {
      for (const match of content.matchAll(/\{[{%]\s*(?:if\s+)?([A-Za-z_]\w*)/g)) {
        if (match[1] !== "endif") expect(allowedVariables.has(match[1]), match[1]).toBe(true);
      }
    }
  });
});
