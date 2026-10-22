import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runVisibilityGate } from "@pomona/proxy";
import type { VisibilityGateRequest } from "@pomona/proxy";
import { clefLocalEnvironment, clefTestInferenceUrl } from "./clef-test-isolation";
import { shortVisibilityPrompt, minimalVisibilityPrompt, detailedVisibilityPrompt } from "./short-visibility-prompt";
import { obscurityVisibilityPrompt } from "./obscurity-visibility-prompts";

const root = fileURLToPath(new URL("../", import.meta.url));
const obscurity = process.argv.includes("--obscurity");
const variants = obscurity ? ["current", "direct", "inspectability"] : ["baseline", "short", "minimal"];
const ids = obscurity
  ? ["01", "02", "03", "04", "05", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]
  : ["01", "02", "03", "04", "05", "10", "11", "14", "15", "16", "17", "18", "20"];
const reportPath = obscurity ? "/tmp/pomona-clef-obscurity-comparison.json" : "/tmp/pomona-clef-prompt-comparison.json";

async function main() {
  const env = clefLocalEnvironment(process.env);
  const url = clefTestInferenceUrl(env);
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error("Local Cloudflare token missing");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "dataset/ground-truth.json"), "utf8"));
  const galleryRoot = "/tmp/pomona-compression-gallery";
  const gallery = obscurity ? JSON.parse(fs.readFileSync(path.join(galleryRoot, "manifest.json"), "utf8")) : [];
  const masks = new Map<string, string>();
  for (const entry of fs.readdirSync(path.join(root, "test-results"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, "test-results", entry.name);
    const metadata = path.join(directory, "scenario.json");
    if (fs.existsSync(metadata)) masks.set(JSON.parse(fs.readFileSync(metadata, "utf8")).id, path.join(directory, "masked-full-frame.png"));
  }
  // Preflight every fixture before spending any inference calls.
  const scenes = ids.map(prefix => {
    const scene = manifest.find((item: any) => item.id.startsWith(prefix + "-") && item.groundTruth.round === 1);
    if (!scene) throw new Error(`Scenario ${prefix} missing`);
    const image = obscurity ? path.join(galleryRoot, gallery.find((item: any) => item.id === scene.id).beforeFile)
      : scene.groundTruth.focusPolygon ? masks.get(scene.id) : path.join(root, scene.imagePath);
    if (!image || !fs.existsSync(image)) throw new Error(`Capture missing: ${scene.id}`);
    // The supplied carrot photo is byte-identical to scene 13. Its confirmed Gemini
    // unclear_photo response is the regression this gate experiment aims to avoid.
    const expected = obscurity && prefix === "13" ? "unclear_photo" : ["no_produce", "unclear_photo", "multiple_types"].includes(scene.groundTruth.expectedStatus)
      ? scene.groundTruth.expectedStatus : null;
    const request: VisibilityGateRequest = {
      schemaVersion: "1.0", round: 1, sessionId: crypto.randomUUID(), locale: "en-GB",
      imageBase64: fs.readFileSync(image).toString("base64"), imageMimeType: image.endsWith(".webp") ? "image/webp" : image.endsWith(".png") ? "image/png" : "image/jpeg",
      focusPolygon: scene.groundTruth.focusPolygon ?? null, followUpContext: null,
    };
    return { id: scene.id, expected, request };
  });
  const results: any[] = [];
  // Rotate prompt order by repetition to reduce order effects; no inference retries.
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const scene of scenes) {
      for (let offset = 0; offset < variants.length; offset++) {
        const variant = variants[(offset + repeat) % variants.length];
        const start = Date.now();
        let raw: unknown = null;
        let sentInput: Record<string, unknown> = {};
        try {
          const outcome = await runVisibilityGate({ async run(_model, input, options) {
            sentInput = variant === "current" ? input : variant === "direct" || variant === "inspectability"
              ? obscurityVisibilityPrompt(input, variant) : variant === "short" ? shortVisibilityPrompt(input)
              : variant === "minimal" ? minimalVisibilityPrompt(input) : detailedVisibilityPrompt(input, !!scene.request.focusPolygon);
            const response = await fetch(url, {
              method: "POST", headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify(sentInput), signal: options?.signal,
            });
            if (!response.ok) return response;
            const body = await response.json() as { success: boolean; result: unknown };
            if (!body.success) throw new Error("Unsuccessful inference");
            raw = body.result;
            return Response.json(raw);
          } }, scene.request, crypto.randomUUID());
          results.push({ id: scene.id, repeat: repeat + 1, variant, expected: scene.expected,
            actual: outcome.status, pass: outcome.usage !== null && outcome.status === scene.expected,
            falseRejection: scene.expected === null && outcome.status !== null,
            raw, usage: outcome.usage, durationMs: Date.now() - start,
            promptCharacters: JSON.stringify({ state: sentInput.state, questions: sentInput.questions }).length });
        } catch (error) {
          results.push({ id: scene.id, repeat: repeat + 1, variant, expected: scene.expected, pass: false,
            error: error instanceof Error ? error.message : "Inference error", durationMs: Date.now() - start });
          const status = (error as { status?: number }).status;
          if (status === 401 || status === 403 || status === 429) {
            fs.writeFileSync(reportPath, JSON.stringify({ incomplete: true, results }, null, 2));
            throw new Error(`Stopped after provider denial ${status}`);
          }
        }
        fs.writeFileSync(reportPath, JSON.stringify({ incomplete: true, results }, null, 2));
      }
    }
    console.log(`Completed repetition ${repeat + 1}/3 (${results.length}/${scenes.length * variants.length * 3} requests).`);
  }
  const summaries = variants.map(variant => {
    const rows = results.filter(row => row.variant === variant);
    const tokens = rows.reduce((sum, row) => sum + (row.usage?.promptTokens ?? 0), 0);
    // Compare the same image mix: aborted requests have unknown usage, not zero cost.
    const observedTokens = scenes.map(scene => rows.find(row => row.id === scene.id && row.usage)?.usage.promptTokens);
    const tokensPerImageSet = observedTokens.every(Number.isFinite)
      ? observedTokens.reduce((sum, count) => sum + count, 0) : null;
    const durations = rows.filter(row => row.usage).map(row => row.durationMs).sort((a, b) => a - b);
    return { variant, passed: rows.filter(row => row.pass).length, total: rows.length,
      falseRejections: rows.filter(row => row.falseRejection).length, errors: rows.filter(row => row.error || !row.usage).length,
      inputTokens: tokens, estimatedUsd: tokens * 0.038 / 1e6,
      tokensPerImageSet, estimatedUsdPerImageSet: tokensPerImageSet === null ? null : tokensPerImageSet * 0.038 / 1e6,
      uniqueCorrectImages: scenes.filter(scene => rows.some(row => row.id === scene.id && row.pass)).length,
      medianDurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      meanDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length };
  });
  summaries.sort((a, b) => b.passed - a.passed || a.falseRejections - b.falseRejections || a.errors - b.errors || a.inputTokens - b.inputTokens);
  fs.writeFileSync(reportPath, JSON.stringify({ incomplete: false, threshold: 0.85, repetitions: 3, uniqueImages: scenes.length,
    rankingRule: "Correct decisions, then fewer false rejections, then fewer errors, then lower input cost",
    summaries, results, limitation: "Repeated images test stability, not independent accuracy. Fixed local dataset; no Gemini calls. Obscurity mode uses actual 768px browser uploads and labels the confirmed scene-13 carrot failure as unclear_photo." }, null, 2));
  console.log(JSON.stringify({ summaries, reportPath }));
  if (summaries.some(row => row.errors)) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Comparison failed"); process.exitCode = 1; });
