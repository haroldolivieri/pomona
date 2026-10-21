import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { v1PromptConfig } from "@pomona/proxy";
import type { ScanRequest } from "@pomona/contract";
import manifest from "../dataset/ground-truth.json";

/**
 * Keeps docs/prompts/ (rendered production prompts) in sync with the prompt
 * builders in apps/proxy/src/prompts. Regenerate after prompt changes with:
 *   pnpm --filter @pomona/evals prompts:export
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_PROMPTS_DIR = path.resolve(__dirname, "../../../docs/prompts");

interface GroundTruthEntry {
  id: string;
  groundTruth: Record<string, any>;
}

const entries = manifest as GroundTruthEntry[];

function entry(id: string): GroundTruthEntry {
  const found = entries.find((item) => item.id === id);
  if (!found) throw new Error(`Missing ground-truth entry ${id}`);
  return found;
}

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
  "round1-user-no-polygon.txt": v1PromptConfig.buildUserPrompt(makeRequest({})),
  "round1-user-with-polygon.txt": v1PromptConfig.buildUserPrompt(
    makeRequest({ focusPolygon: entry("17-roma-bulk-pile-focus-polygon").groundTruth.focusPolygon })
  ),
  "round1-user-repair.txt": v1PromptConfig.buildRepairPrompt!(makeRequest({}), [
    "Count mismatch: countedTotal=15 requires exactly 15 valid candidates, but 14 remain after validation",
  ]),
  "round2-system.txt": v1PromptConfig.buildSystemPrompt(
    makeRequest({ round: 2, followUpContext: entry("06-round2-runner-up-flip-overtakes").groundTruth.followUpContext })
  ),
  "round2-user.txt": v1PromptConfig.buildUserPrompt(
    makeRequest({ round: 2, followUpContext: entry("06-round2-runner-up-flip-overtakes").groundTruth.followUpContext })
  ),
  "round3-system.txt": v1PromptConfig.buildSystemPrompt(
    makeRequest({ round: 3, followUpContext: entry("08-round3-first-pick-reclaims").groundTruth.followUpContext })
  ),
  "round3-user.txt": v1PromptConfig.buildUserPrompt(
    makeRequest({ round: 3, followUpContext: entry("08-round3-first-pick-reclaims").groundTruth.followUpContext })
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
      expect(content.endsWith(`${body}\n`), `${file} is stale; run pnpm --filter @pomona/evals prompts:export`).toBe(true);
    }
  });
});
