import fs from "node:fs";
import { loadApiKeyFromEnvFiles } from "./env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGeminiVisionAdapter, createOpenAIVisionAdapter, runVerifiedDeepScan } from "@pomona/proxy";
import { resolveDeepScanVisualScore, type DeepScanRequest } from "@pomona/contract";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const evalRoot = path.resolve(scriptDir, "..");
const MANIFEST_PATH = path.join(evalRoot, "dataset/ground-truth-deep-scan.json");
const REPORT_PATH = process.env.EVAL_REPORT_PATH || path.join(evalRoot, "dataset/last-deep-scan-eval-report.json");

interface DeepScanGroundTruth {
  id: string;
  imagePath: string;
  arm: "live" | "gate";
  perLocale: {
    locale: string;
    expectedStatus: "ok" | "insufficient_evidence" | "no_produce" | "unclear_photo";
    expectedState: "unripe" | "nearly_ripe" | "ripe" | "overripe" | "spoiled" | "unknown" | null;
    expectManualChecks: boolean;
    /** Ripe-and-ready scenarios: afterPurchase.readyInDays must start at 0 (eat now). */
    expectReadyNow?: boolean;
    /** Upper bound for afterPurchase.readyInDays.max, a small read in range. */
    maxReadyInDays?: number;
    /** Upper bound for the resolved 0..10 visual score on overripe/spoiled outcomes. */
    maxVisualScore?: number;
  }[];
}

function assertEnvelopeArm(
  response: unknown,
  arm: DeepScanGroundTruth["perLocale"][number]
): { pass: boolean; reason: string } {
  const envelope = response as {
    status?: string;
    produce?: { displayName?: string; type?: string } | null;
    ripeness?: { state?: string; confidence?: number };
    manualChecks?: unknown[] | null;
    message?: string | null;
    afterPurchase?: { readyInDays?: { min?: number; max?: number } } | null;
  };
  if (arm.expectedStatus !== "ok" && envelope.status !== arm.expectedStatus) {
    return { pass: false, reason: `expected status ${arm.expectedStatus}, got ${envelope.status}` };
  }
  if (arm.expectManualChecks && (!envelope.manualChecks || envelope.manualChecks.length === 0)) {
    return { pass: false, reason: "expected manualChecks on abstention, but none received" };
  }
  if (arm.expectedStatus === "ok") {
    if (envelope.status !== "ok") return { pass: false, reason: `expected ok, got ${envelope.status}` };
    if (arm.expectedState && envelope.ripeness?.state !== arm.expectedState) {
      return { pass: false, reason: `expected state ${arm.expectedState}, got ${envelope.ripeness?.state}` };
    }
    // A confident veredict never co-renders manual checks.
    if ((envelope.manualChecks?.length ?? 0) > 0) {
      return { pass: false, reason: "manualChecks leaked into a confident verdict" };
    }
    const ready = envelope.afterPurchase?.readyInDays;
    if (arm.expectReadyNow && ready?.min !== 0) {
      return { pass: false, reason: `expected ready now (readyInDays.min 0), got ${JSON.stringify(ready)}` };
    }
    if (typeof arm.maxReadyInDays === "number" && (typeof ready?.max !== "number" || ready.max > arm.maxReadyInDays)) {
      return { pass: false, reason: `expected readyInDays.max <= ${arm.maxReadyInDays}, got ${JSON.stringify(ready)}` };
    }
    if (typeof arm.maxVisualScore === "number") {
      const visualScore = resolveDeepScanVisualScore({
        state: envelope.ripeness?.state ?? "unknown",
        confidence: envelope.ripeness?.confidence ?? 0,
      });
      if (visualScore > arm.maxVisualScore) {
        return { pass: false, reason: `expected visualScore <= ${arm.maxVisualScore}, got ${visualScore}` };
      }
    }
    if (!envelope.produce?.displayName) {
      return { pass: false, reason: `missing localized produce displayName for ${arm.locale}` };
    }
  }
  return { pass: true, reason: "matched" };
}

async function runDeepScanLiveBenchmark() {
  const { geminiKey, openaiKey } = loadApiKeyFromEnvFiles(scriptDir);
  const scenarioId = process.env.EVAL_SCENARIO_ID;

  if (!geminiKey && !openaiKey) {
    console.log("SKIP: no credentials — deep-scan live eval NOT run (never auto-claimed).");
    console.log(
      "Run with:\n  GEMINI_API_KEY=your_key pnpm --filter @pomona/evals eval:ds:live\n" +
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

  const manifest: DeepScanGroundTruth[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const scenarios = manifest
    .filter((row) => row.arm === "live")
    .filter((row) => !scenarioId || row.id === scenarioId);
  if (scenarios.length === 0) {
    console.error(`No live deep-scan scenarios matched EVAL_SCENARIO_ID=${scenarioId}`);
    process.exit(1);
  }

  const maxAttempts = Math.max(1, Number(process.env.EVAL_MAX_ATTEMPTS ?? 2));
  let passed = 0;
  let total = 0;
  const results: unknown[] = [];

  for (const scenario of scenarios) {
    const imagePath = path.join(evalRoot, scenario.imagePath);
    const imageBase64 = fs.readFileSync(imagePath).toString("base64");
    for (const arm of scenario.perLocale) {
      const request: DeepScanRequest = {
        schemaVersion: "1.0",
        sessionId: "00000000-0000-0000-0000-000000000000",
        locale: arm.locale,
        imageBase64,
        imageMimeType: "image/jpeg",
        sampleCount: 25,
      };
      total += 1;
      let finalResponse: unknown = null;
      let lastReason = "No attempts completed";
      let attemptsUsed = 0;
      let pass = false;
      let usage: unknown = null;
      const started = Date.now();

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attemptsUsed = attempt;
        try {
          const outcome = await runVerifiedDeepScan(
            request,
            adapter,
            "deep_scan_v1",
            undefined,
            crypto.randomUUID()
          );
          usage = outcome.usage;
          finalResponse = outcome.response;
          const verdict = assertEnvelopeArm(outcome.response, arm);
          lastReason = verdict.reason;
          if (verdict.pass) {
            pass = true;
            break;
          }
        } catch (err) {
          lastReason = err instanceof Error ? err.message : String(err);
        }
      }

      const row = {
        id: scenario.id,
        locale: arm.locale,
        model: `${adapter.providerId}:${adapter.modelId}`,
        pass,
        attemptsUsed,
        reason: lastReason,
        latencyMs: Date.now() - started,
        usage: usage ?? null,
        rawOutput: finalResponse,
      };
      results.push(row);
      passed += pass ? 1 : 0;
      console.log(
        `${pass ? "✅ PASS" : "❌ FAIL"} [${scenario.id}/${arm.locale}] (${row.latencyMs}ms${attemptsUsed > 1 ? `, attempt ${attemptsUsed}/${maxAttempts}` : ""}) — ${lastReason}`
      );
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    model: `${adapter.providerId}:${adapter.modelId}`,
    maxAttempts,
    passed,
    total,
    results,
    limitation:
      "Two seeded montages (en-GB/pt-BR) do not establish production accuracy; harvest variation and camera noise are unrepresented.",
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n📊 Summary: ${passed} / ${total} live deep-scan arms passed. Report: ${REPORT_PATH}`);
  if (passed !== total) process.exitCode = 1;
}

runDeepScanLiveBenchmark().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error("Live deep-scan eval could not complete.");
  process.exit(1);
});
