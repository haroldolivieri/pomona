import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runVisibilityGate, VISIBILITY_GATE_MODEL } from "@pomona/proxy";
import type { VisibilityGateRequest } from "@pomona/proxy";
import { clefLocalEnvironment, clefTestInferenceUrl } from "./clef-test-isolation";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const evalRoot = path.resolve(directory, "..");

// Capture credentials in memory; never write command output or tokens into reports.
function wranglerJson(args: string[]): Record<string, any> | null {
  const result = spawnSync("pnpm", ["--filter", "@pomona/proxy", "exec", "wrangler", ...args, "--json"], {
    cwd: root, encoding: "utf8", timeout: 20000,
    env: { ...process.env, WRANGLER_LOG_PATH: "/dev/null" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

async function main() {
  const env = clefLocalEnvironment(process.env);
  let inferenceUrl: string;
  try { inferenceUrl = clefTestInferenceUrl(env); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Test account isolation is required.");
    process.exitCode = 1;
    return;
  }
  let token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const credentials = wranglerJson(["auth", "token"]);
    if (credentials?.type === "oauth" || credentials?.type === "api_token") token = credentials.token;
  }
  if (!token) {
    console.error("Live Clef eval not run. Authenticate access to the separate test account with wrangler login.");
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(evalRoot, "dataset/ground-truth.json"), "utf8"));
  const masked = new Map<string, string>();
  const resultsDir = path.join(evalRoot, "test-results");
  if (fs.existsSync(resultsDir)) {
    for (const item of fs.readdirSync(resultsDir, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const metadata = path.join(resultsDir, item.name, "scenario.json");
      if (fs.existsSync(metadata)) {
        const { id } = JSON.parse(fs.readFileSync(metadata, "utf8"));
        masked.set(id, path.join(resultsDir, item.name, "masked-full-frame.png"));
      }
    }
  }
  const singleOnly = process.argv.includes("--single-only") || process.env.SINGLE_ONLY === "true";
  const scenarioArg = process.argv.find(a => a.startsWith("--scenario="))?.split("=")[1];

  const defaultIds = ["03-unclear-blurry-photo", "04-no-produce-cereal-box", "05-multiple-types-mixed",
    "10-single-pineapple-solo", "02-avocado-polygon-isolation", "17-roma-bulk-pile-focus-polygon", "20-roma-clear-ripeness-focus-polygon"];
  const ids = scenarioArg ? [scenarioArg] : (singleOnly ? ["10-single-pineapple-solo"] : defaultIds);
  const results = [];
  for (const id of ids) {
    const scene = manifest.find((item: { id: string }) => item.id === id);
    const image = scene.groundTruth.focusPolygon ? masked.get(id) : path.join(evalRoot, scene.imagePath);
    if (!image || !fs.existsSync(image)) {
      results.push({ id, pass: false, unrun: true, reason: "Generate masked captures with pnpm --filter @pomona/evals eval:mask first." });
      continue;
    }
    const startedAt = Date.now();
    let rawResult: unknown = null;
    try {
      const request: VisibilityGateRequest = { schemaVersion: "1.0", round: 1, sessionId: crypto.randomUUID(), locale: "en-GB",
        imageBase64: fs.readFileSync(image).toString("base64"),
        imageMimeType: image.endsWith(".png") ? "image/png" : "image/jpeg",
        focusPolygon: scene.groundTruth.focusPolygon ?? null, followUpContext: null };
      // PNG is accepted by Clef, although the public browser upload contract uses JPEG/WebP.
      const outcome = await runVisibilityGate({
        async run(_model, input, options) {
          const response = await fetch(inferenceUrl, {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(input), signal: options?.signal,
          });
          if (!response.ok) return response;
          const body = await response.json() as { success: boolean; result: unknown };
          if (!body.success) throw new Error("Workers AI reported an unsuccessful inference");
          rawResult = body.result;
          return Response.json(body.result);
        },
      }, request, crypto.randomUUID());
      const expected = ["no_produce", "unclear_photo", "multiple_types", "single_produce"].includes(scene.groundTruth.expectedStatus)
        ? scene.groundTruth.expectedStatus : (id === "10-single-pineapple-solo" ? "single_produce" : null);
      const pass = outcome.scores !== null && outcome.usage !== null && outcome.status === expected;
      const row = { id, pass, expected, actual: outcome.status, durationMs: Date.now() - startedAt,
        rawResult,
        usage: outcome.usage, estimatedUsd: outcome.usage ? outcome.usage.promptTokens * 0.038 / 1000000 : null };
      results.push(row);
      console.log(JSON.stringify(row));
    } catch (error) {
      results.push({ id, pass: false, durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : "Inference failed", usage: null });
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403 || status === 429) {
        const remaining = ids.slice(ids.indexOf(id) + 1);
        results.push(...remaining.map(id => ({ id, pass: false, unrun: true, reason: "Stopped after provider denial" })));
        break;
      }
    }
  }
  const reportPath = process.env.EVAL_REPORT_PATH || "/tmp/pomona-clef-gate-report.json";
  const report = { model: VISIBILITY_GATE_MODEL, timestamp: new Date().toISOString(),
    promptVariant: "direct",
    passed: results.filter(item => item.pass).length, total: results.length, results,
    limitation: "Six smoke scenarios do not establish production accuracy or total cost savings. No Gemini calls were made." };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${report.passed}/${report.total} live gate scenarios passed. Report: ${reportPath}`);
  if (report.passed !== report.total) process.exitCode = 1;
}

main().catch(() => { console.error("Live gate eval could not complete; check Cloudflare access and configuration."); process.exitCode = 1; });
