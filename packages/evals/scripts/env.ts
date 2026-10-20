import fs from "node:fs";
import path from "node:path";

export function loadApiKeyFromEnvFiles(scriptsDirectory: string, env: NodeJS.ProcessEnv = process.env): { geminiKey?: string; openaiKey?: string } {
  const candidates = [
    path.resolve(scriptsDirectory, "../../../.env"),
    path.resolve(scriptsDirectory, "../../../apps/proxy/.dev.vars"),
    path.resolve(scriptsDirectory, "../.env"),
  ];
  let geminiKey = env.GEMINI_API_KEY;
  let openaiKey = env.OPENAI_API_KEY;

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key === "GEMINI_API_KEY" && !geminiKey && val) geminiKey = val;
        if (key === "OPENAI_API_KEY" && !openaiKey && val) openaiKey = val;
      }
    }
  }
  return { geminiKey, openaiKey };
}

