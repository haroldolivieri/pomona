import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v1PromptConfig, createGeminiVisionAdapter, createOpenAIVisionAdapter } from "@pomona/proxy";
import type { ScanRequest } from "@pomona/contract";
import { verifyPromptfooOutput } from "../assertions/verify-contract";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "../dataset/ground-truth.json");

interface GroundTruthEntry {
  id: string;
  filename: string;
  imagePath: string;
  description: string;
  groundTruth: Record<string, any>;
}

function loadApiKeyFromEnvFiles(): { geminiKey?: string; openaiKey?: string } {
  const candidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../../apps/proxy/.dev.vars"),
    path.resolve(__dirname, "../.env"),
  ];
  let geminiKey = process.env.GEMINI_API_KEY;
  let openaiKey = process.env.OPENAI_API_KEY;

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

async function runLiveBenchmark() {
  const { geminiKey, openaiKey } = loadApiKeyFromEnvFiles();

  if (!geminiKey && !openaiKey) {
    console.log(
      "ℹ️  No GEMINI_API_KEY or OPENAI_API_KEY found.\n" +
        "Run with:\n" +
        "  GEMINI_API_KEY=your_key pnpm --filter @pomona/evals eval:live\n" +
        "Or save GEMINI_API_KEY=your_key in .env or apps/proxy/.dev.vars"
    );
    process.exit(0);
  }

  const adapter = geminiKey
    ? createGeminiVisionAdapter({
        apiKey: geminiKey,
        modelId: process.env.EVAL_MODEL || "gemini-3.1-flash-lite",
      })
    : createOpenAIVisionAdapter({
        apiKey: openaiKey!,
        modelId: process.env.EVAL_MODEL || "gpt-4o-mini",
      });

  const manifest: GroundTruthEntry[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  console.log(`\n🚀 Running Pomona Offline Ground-Truth Eval against ${adapter.providerId}:${adapter.modelId}...\n`);

  let passed = 0;
  const results = [];

  for (const item of manifest) {
    const imgFullPath = path.resolve(__dirname, "..", item.imagePath);
    const imageBase64 = fs.readFileSync(imgFullPath).toString("base64");
    const gt = item.groundTruth;

    const req: ScanRequest = {
      schemaVersion: "1.0",
      sessionId: "00000000-0000-0000-0000-000000000000",
      round: (gt.round || 1) as 1 | 2 | 3,
      locale: "en-GB",
      imageBase64,
      imageMimeType: "image/jpeg",
      focusPolygon: gt.focusPolygon ?? null,
      followUpContext: gt.followUpContext ?? null,
    };

    const systemPrompt = v1PromptConfig.buildSystemPrompt(req);
    const userPrompt = v1PromptConfig.buildUserPrompt(req);

    const startMs = Date.now();
    try {
      const raw = await adapter.analyzeProduce({
        systemPrompt,
        userPrompt,
        imageBase64,
        imageMimeType: "image/jpeg",
      });

      const latencyMs = Date.now() - startMs;
      const evalRes = verifyPromptfooOutput(JSON.stringify(raw.object), { vars: gt });

      if (evalRes.pass) passed++;

      console.log(
        `${evalRes.pass ? "✅ PASS" : "❌ FAIL"} [${item.id}] (${latencyMs}ms) — Score: ${evalRes.score}\n` +
          `   Reason: ${evalRes.reason}\n`
      );

      results.push({
        id: item.id,
        model: `${adapter.providerId}:${adapter.modelId}`,
        pass: evalRes.pass,
        score: evalRes.score,
        reason: evalRes.reason,
        latencyMs,
        rawOutput: raw.object,
      });
    } catch (err: any) {
      console.log(`💥 ERROR [${item.id}]: ${err?.message || String(err)}\n`);
      results.push({
        id: item.id,
        model: `${adapter.providerId}:${adapter.modelId}`,
        pass: false,
        score: 0,
        reason: err?.message || String(err),
      });
    }
  }

  console.log(`\n📊 Summary: ${passed} / ${manifest.length} scenarios passed.`);
  const reportPayload = {
    timestamp: new Date().toISOString(),
    model: `${adapter.providerId}:${adapter.modelId}`,
    passed,
    total: manifest.length,
    results,
  };

  const reportPath = path.resolve(__dirname, "../dataset/last-eval-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2));
  console.log(`Saved detailed report to ${reportPath}`);

  const matrixReportDir = path.resolve(
    __dirname,
    "../../../.superpowers/brainstorm/34780-1792182706/content/evals"
  );
  if (fs.existsSync(matrixReportDir)) {
    const matrixReportPath = path.join(matrixReportDir, "last-eval-report.json");
    fs.writeFileSync(matrixReportPath, JSON.stringify(reportPayload, null, 2));
    console.log(`Updated live visual matrix report at ${matrixReportPath}`);
  }

  const isStrict = process.env.CI === "true" || process.argv.includes("--strict");
  if (isStrict && passed < manifest.length) {
    console.error(`\n🚨 EVAL GATE FAILED: Only ${passed}/${manifest.length} scenarios passed. Blocking CI merge/deployment.`);
    process.exit(1);
  }
}

runLiveBenchmark();

