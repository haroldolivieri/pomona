import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runVisibilityGate } from "@pomona/proxy";
import { clefLocalEnvironment, clefTestInferenceUrl } from "./clef-test-isolation";

// Use the locked eval toolchain's image codec; do not alter the browser upload path.
const requireEval = createRequire(fs.realpathSync(new URL("../node_modules/promptfoo/package.json", import.meta.url)));
const sharp = requireEval("sharp");

async function main() {
  const env = clefLocalEnvironment(process.env);
  const url = clefTestInferenceUrl(env);
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error("Cloudflare token missing");
  const image = process.env.EVAL_IMAGE_PATH || fileURLToPath(new URL("../dataset/images/13-carrot-packs-crate.jpg", import.meta.url));
  const buffers = new Map<number, Buffer>();
  for (const edge of [768, 512]) buffers.set(edge, await sharp(image)
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
  const rows: any[] = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const edge of repeat % 2 ? [512, 768] : [768, 512]) {
      const buffer = buffers.get(edge)!;
      const start = Date.now();
      try {
        const result = await runVisibilityGate({ async run(_model, input, options) {
          const response = await fetch(url, { method: "POST",
            headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(input), signal: options?.signal });
          if (!response.ok) return response;
          const body = await response.json() as { success: boolean; result: unknown };
          if (!body.success) throw new Error("Unsuccessful Clef inference");
          return Response.json(body.result);
        } }, { schemaVersion: "1.0", round: 1, sessionId: crypto.randomUUID(), locale: "en-GB",
          imageBase64: buffer.toString("base64"), imageMimeType: "image/webp", focusPolygon: null, followUpContext: null }, crypto.randomUUID());
        rows.push({ repeat: repeat + 1, edge, bytes: buffer.length, durationMs: Date.now() - start, ...result });
      } catch (error) {
        rows.push({ repeat: repeat + 1, edge, bytes: buffer.length, durationMs: Date.now() - start,
          errorType: error instanceof Error ? error.name : "UnknownError" });
        if ([401, 403, 429].includes((error as { status?: number }).status ?? 0)) break;
      }
    }
    if (rows.some(row => row.errorType === "Error")) break;
  }
  const report = { timeoutMs: 3000, codec: "WebP", quality: 80, rows,
    limitation: "One image, three repetitions per size; Sharp preprocessing approximates browser encoding. No Gemini calls; no global compression change." };
  fs.writeFileSync("/tmp/pomona-clef-image-size.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Image-size eval failed"); process.exitCode = 1; });
