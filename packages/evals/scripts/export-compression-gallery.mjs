import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.EVAL_GALLERY_DIR || "/tmp/pomona-compression-gallery";
const requireEval = createRequire(fs.realpathSync(new URL("../node_modules/promptfoo/package.json", import.meta.url)));
const sharp = requireEval("sharp");
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, "dataset/ground-truth.json"), "utf8"));
const rows = [];
try {
  await page.goto(process.env.EVAL_WEB_URL || "https://127.0.0.1:5177");
  for (const scene of manifest) {
    const source = fs.readFileSync(path.join(root, scene.imagePath));
    const mime = scene.imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
    const prepared = await page.evaluate(async ({ dataUrl, polygon }) => {
      const moduleUrl = "/src/lib/image-pipeline.ts";
      const { downsampleDataUrl } = await import(moduleUrl);
      const before = await downsampleDataUrl(dataUrl, 768, 0.8, polygon);
      const after = await downsampleDataUrl(dataUrl, 512, 0.8, polygon);
      return { before, after };
    }, { dataUrl: `data:${mime};base64,${source.toString("base64")}`, polygon: scene.groundTruth.focusPolygon ?? null });
    const beforeFile = `${scene.id}-768.webp`, afterFile = `${scene.id}-512.webp`;
    const before = Buffer.from(prepared.before.base64, "base64"), after = Buffer.from(prepared.after.base64, "base64");
    fs.writeFileSync(path.join(output, beforeFile), before);
    fs.writeFileSync(path.join(output, afterFile), after);
    rows.push({ id: scene.id, masked: !!scene.groundTruth.focusPolygon, originalBytes: source.length,
      beforeFile, afterFile, beforeBytes: before.length, afterBytes: after.length,
      beforeDimensions: await sharp(before).metadata().then(({ width, height }) => ({ width, height })),
      afterDimensions: await sharp(after).metadata().then(({ width, height }) => ({ width, height })) });
  }
} finally { await browser.close(); }
const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
const cards = rows.map((row, index) => `<section><h2>${index + 1}. ${escape(row.id)}</h2><p>${row.masked ? "Selection mask preserved" : "Whole image"} · ${(100 * (1 - row.afterBytes / row.beforeBytes)).toFixed(0)}% smaller</p><div class="pair">${[
  ["Current upload", row.beforeFile, row.beforeBytes, row.beforeDimensions], ["Proposed", row.afterFile, row.afterBytes, row.afterDimensions],
].map(([label, file, bytes, dimensions]) => `<figure><figcaption>${label}: ${dimensions.width}×${dimensions.height} · ${kb(bytes)}</figcaption><a href="${escape(file)}" target="_blank"><img loading="lazy" src="${escape(file)}" alt="${escape(row.id)} ${label}"></a></figure>`).join("")}</div></section>`).join("");
fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pomona compression comparison</title><style>body{font:16px system-ui;margin:24px auto;max-width:1200px;padding:0 18px;background:#f5f7f5;color:#173126}h1{font-size:28px}h2{font-size:18px;overflow-wrap:anywhere}section{background:white;border:1px solid #dce4dd;border-radius:12px;padding:18px;margin:24px 0}p{color:#506458}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{margin-bottom:10px;font-weight:600}img{width:100%;height:420px;object-fit:contain;background:#101912;border-radius:8px}a{display:block}@media(max-width:650px){img{height:240px}body{margin:12px auto}}</style><h1>768px current vs 512px proposed</h1><p>All ${rows.length} eval scenarios. Actual browser upload pipeline; WebP quality 80 for both. Focus masks preserved. Current means the prepared 768px upload, not the original camera file. Click any image for full resolution. No model calls. Production compression unchanged.</p>${cards}</html>`);
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(rows, null, 2));
// Contact sheets provide a compact, complete preview; the gallery keeps full-size files.
for (let start = 0; start < rows.length; start += 6) {
  const subset = rows.slice(start, start + 6), width = 1000, rowHeight = 240;
  const layers = [];
  const labels = [`<text x="28" y="32" font-size="20" font-weight="bold">Current 768px</text><text x="520" y="32" font-size="20" font-weight="bold">Proposed 512px</text>`];
  for (let i = 0; i < subset.length; i++) {
    const row = subset[i], y = 52 + i * rowHeight;
    labels.push(`<text x="28" y="${y + 17}" font-size="15" font-weight="bold">${escape(row.id)}</text>`);
    labels.push(`<text x="28" y="${y + 37}" font-size="13">${kb(row.beforeBytes)} · ${row.masked ? "masked" : "whole image"}</text><text x="520" y="${y + 37}" font-size="13">${kb(row.afterBytes)} · ${(100 * (1 - row.afterBytes / row.beforeBytes)).toFixed(0)}% smaller</text>`);
    for (const [file, x] of [[row.beforeFile, 28], [row.afterFile, 520]]) {
      layers.push({ input: await sharp(path.join(output, file)).resize(452, 180, { fit: "contain", background: "#142119" }).png().toBuffer(), left: x, top: y + 46 });
    }
  }
  const height = 52 + subset.length * rowHeight;
  layers.push({ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial,sans-serif" fill="#173126">${labels.join("")}</g></svg>`), left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 3, background: "#f5f7f5" } }).composite(layers).jpeg({ quality: 88 }).toFile(path.join(output, `overview-${Math.floor(start / 6) + 1}.jpg`));
}
console.log(JSON.stringify({ scenarios: rows.length, gallery: path.join(output, "index.html"), contactSheets: Math.ceil(rows.length / 6) }));
