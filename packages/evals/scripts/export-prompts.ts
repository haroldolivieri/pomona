import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v1PromptConfig } from "@pomona/proxy";
import type { ScanRequest } from "@pomona/contract";
import { templateFocusPolygon, templateRoundTwoContext, templateRoundThreeContext, renderDocumentationTemplate } from "./prompt-examples";

/**
 * Renders every production prompt variant (v1 prompt registry) to docs/prompts/
 * so they can be reviewed as plain text. Re-run after prompt changes:
 *   pnpm --filter @pomona/evals prompts:export
 * A drift test (test/prompt-export.test.ts) fails when docs fall behind.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../docs/prompts");

function makeRequest(overrides: Partial<ScanRequest>): ScanRequest {
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

interface ExportedPrompt {
  file: string;
  title: string;
  source: string;
  request: ScanRequest;
  body: string;
}

const exports: ExportedPrompt[] = [
  {
    file: "round1-system.txt",
    title: "Round 1 — System prompt (shared by all Round 1 scans)",
    source: "v1PromptConfig.buildSystemPrompt(request)",
    request: makeRequest({}),
    body: v1PromptConfig.buildSystemPrompt(makeRequest({})),
  },
  {
    file: "round1-user-no-polygon.txt",
    title: "Round 1 — User prompt (no focus polygon)",
    source: "v1PromptConfig.buildUserPrompt(request)",
    request: makeRequest({}),
    body: v1PromptConfig.buildUserPrompt(makeRequest({})),
  },
  {
    file: "round1-user-with-polygon.txt",
    title: "Round 1 — User prompt (user-drawn focus polygon)",
    source: "v1PromptConfig.buildUserPrompt(request)",
    request: makeRequest({ focusPolygon: templateFocusPolygon }),
    body: v1PromptConfig.buildUserPrompt(
      makeRequest({ focusPolygon: templateFocusPolygon })
    ),
  },
  {
    file: "round1-user-repair.txt",
    title: "Round 1 — User prompt (validation-repair attempt)",
    source: "v1PromptConfig.buildRepairPrompt(request, repairErrors)",
    request: makeRequest({}),
    body: v1PromptConfig.buildRepairPrompt!(
      makeRequest({}),
      [
        "{{validationErrors}}",
      ]
    ),
  },
  {
    file: "round2-system.txt",
    title: "Round 2 — System prompt (close-up flip of the runner-up)",
    source: "v1PromptConfig.buildSystemPrompt(request)",
    request: makeRequest({ round: 2, followUpContext: templateRoundTwoContext }),
    body: v1PromptConfig.buildSystemPrompt(
      makeRequest({ round: 2, followUpContext: templateRoundTwoContext })
    ),
  },
  {
    file: "round2-user.txt",
    title: "Round 2 — User prompt (close-up flip of the runner-up)",
    source: "v1PromptConfig.buildUserPrompt(request)",
    request: makeRequest({ round: 2, followUpContext: templateRoundTwoContext }),
    body: v1PromptConfig.buildUserPrompt(
      makeRequest({ round: 2, followUpContext: templateRoundTwoContext })
    ),
  },
  {
    file: "round3-system.txt",
    title: "Round 3 — System prompt (final check of the 1st pick)",
    source: "v1PromptConfig.buildSystemPrompt(request)",
    request: makeRequest({ round: 3, followUpContext: templateRoundThreeContext }),
    body: v1PromptConfig.buildSystemPrompt(
      makeRequest({ round: 3, followUpContext: templateRoundThreeContext })
    ),
  },
  {
    file: "round3-user.txt",
    title: "Round 3 — User prompt (final check of the 1st pick)",
    source: "v1PromptConfig.buildUserPrompt(request)",
    request: makeRequest({ round: 3, followUpContext: templateRoundThreeContext }),
    body: v1PromptConfig.buildUserPrompt(
      makeRequest({ round: 3, followUpContext: templateRoundThreeContext })
    ),
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const item of exports) {
  const header = [
    `# ${item.title}`,
    `# Builder: ${item.source}`,
    `# promptVersion: ${v1PromptConfig.version} | round: ${item.request.round} | focusPolygon: ${item.request.focusPolygon ? "provided" : "null"}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, item.file), `${header}${renderDocumentationTemplate(item.body)}\n`);
  console.log(`Exported docs/prompts/${item.file}`);
}
console.log(`\n${exports.length} production prompt variants exported to ${OUT_DIR}`);
