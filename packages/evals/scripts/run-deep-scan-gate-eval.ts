import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildDeepScanGateInput, resolveDeepScanGate, VISIBILITY_GATE_MODEL } from "@pomona/proxy";
import { clefTestInferenceUrl, requireClefTestAccount } from "./clef-test-isolation";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const evalRoot = path.resolve(scriptDir, "..");
const MANIFEST_PATH = path.join(evalRoot, "dataset/ground-truth-deep-scan.json");
const REPORT_PATH = process.env.EVAL_REPORT_PATH || "/tmp/pomona-deep-scan-gate-report.json";

// Capture credentials in memory; never write command output or tokens into reports.
function wranglerJson(args: string[]): Record<string, any> | null {
  const result = spawnSync("pnpm", ["--filter", "@pomona/proxy", "exec", "wrangler", ...args, "--json"], {
    cwd: path.resolve(evalRoot, "../../.."), encoding: "utf8", timeout: 20000,
    env: { ...process.env, WRANGLER_LOG_PATH: "/dev/null" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

async function main() {
  const manifest: {
    id: string;
    arm: "live" | "gate";
    imagePath: string;
    perLocale: { locale: string; expectedStatus: string }[];
  }[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const scenarios = manifest.filter((row) => row.arm === "gate");

  let inferenceUrl: string;
  try {
    inferenceUrl = clefTestInferenceUrl(process.env);
  } catch (error) {
    console.error("SKIP: no credentials — deep-scan gate eval NOT run (never auto-claimed).");
    console.error(error instanceof Error ? error.message : "Test account isolation is required.");
    process.exit(0);
    return;
  }
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const credentials = wranglerJson(["auth", "token"]);
    if (credentials?.type === "oauth" || credentials?.type === "api_token") token = credentials.token;
  }
  if (!token) {
    console.error("SKIP: no credentials — deep-scan gate eval NOT run (never auto-claimed). Authenticate access to the separate test account with wrangler login.");
    process.exit(0);
    return;
  }
  void requireClefTestAccount(process.env);

  let passed = 0;
  const results: unknown[] = [];
  for (const scenario of scenarios) {
    const image = path.join(evalRoot, scenario.imagePath);
    const started = Date.now();
    let rawResult: unknown = null;
    try {
      const imageBase64 = fs.readFileSync(image).toString("base64");
      const outcome = await resolveDeepScanGate(
        await (async () => {
          const response = await fetch(inferenceUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(buildDeepScanGateInput(imageBase64, "image/jpeg")),
          });
          if (!response.ok) {
            const status = response.status;
            if (status === 401 || status === 403 || status === 429) {
              results.push(...scenarios.slice(scenarios.indexOf(scenario) + 1).map((row) => ({
                id: row.id, pass: false, unrun: true, reason: "Stopped after provider denial",
              })));
              throw new Error("Stopped after provider denial");
            }
            throw new Error(`Clef HTTP ${status}`);
          }
          const body = (await response.json()) as { success?: boolean; result?: unknown };
          if (!body.success) throw new Error("Workers AI reported an unsuccessful inference");
          rawResult = body.result;
          return body.result;
        })()
      );
      const expected = scenario.perLocale[0].expectedStatus === "no_produce" ? "no_produce" : "unclear_photo";
      const pass = outcome.status === expected && outcome.usage !== null;
      passed += pass ? 1 : 0;
      const row = { id: scenario.id, expected, actual: outcome.status, pass, durationMs: Date.now() - started, rawResult, usage: outcome.usage };
      results.push(row);
      console.log(JSON.stringify(row));
    } catch (error) {
      results.push({ id: scenario.id, pass: false, durationMs: Date.now() - started, reason: error instanceof Error ? error.message : "gate call failed" });
    }
  }

  const report = {
    model: VISIBILITY_GATE_MODEL,
    timestamp: new Date().toISOString(),
    passed,
    total: results.length,
    results,
    limitation: "Three gate smoke montages do not establish production gate accuracy. No Gemini calls were made.",
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`${passed}/${results.length} live deep-scan gate scenarios passed. Report: ${REPORT_PATH}`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch(() => {
  console.error("Live deep-scan gate eval could not complete; check Cloudflare access and configuration.");
  process.exit(1);
});
