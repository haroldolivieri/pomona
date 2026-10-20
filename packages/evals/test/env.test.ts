import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadApiKeyFromEnvFiles } from "../scripts/env";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("live eval credentials", () => {
  it("loads repository .env relative to scripts, regardless of working directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pomona-eval-env-"));
    roots.push(root);
    const scripts = path.join(root, "packages/evals/scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.writeFileSync(path.join(root, ".env"), 'GEMINI_API_KEY="test-gemini"\n');
    expect(loadApiKeyFromEnvFiles(scripts, {})).toEqual({ geminiKey: "test-gemini", openaiKey: undefined });
    expect(loadApiKeyFromEnvFiles(scripts, { GEMINI_API_KEY: "environment-key" }).geminiKey).toBe("environment-key");
    fs.rmSync(path.join(root, ".env"));
    fs.mkdirSync(path.join(root, "apps/proxy"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps/proxy/.dev.vars"), "GEMINI_API_KEY=test-proxy\n");
    expect(loadApiKeyFromEnvFiles(scripts, {}).geminiKey).toBe("test-proxy");
  });
});
