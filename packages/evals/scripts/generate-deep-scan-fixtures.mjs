import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const evalRoot = path.resolve(scriptDir, "..");
const datasetRoot = path.join(evalRoot, "dataset");
const outDir = path.join(datasetRoot, "deep-scan");

const TILE = 448;
const GRID_W = TILE * 3;
const GRID_H = TILE * 2;
const TARGET_BYTES = 256 * 1024;

fs.mkdirSync(outDir, { recursive: true });
const avocadoPath = path.join(datasetRoot, "images/02-avocado-polygon-isolation.jpg");
if (!fs.existsSync(avocadoPath)) {
  console.error(`missing source image: ${avocadoPath}`);
  process.exit(1);
}
const avocadoDataUrl = `data:image/jpeg;base64,${fs.readFileSync(avocadoPath).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: GRID_W, height: GRID_H } });

async function compose({ label, sources, filter }) {
  await page.setContent(
    `<!doctype html><html><body><canvas id="c" width="${GRID_W}" height="${GRID_H}"></canvas></body></html>`
  );
  const dataUrl = await page.evaluate(
    async ({ sources, filter, tile, targetBytes }) => {
      const canvas = document.getElementById("c");
      canvas.width = tile * 3;
      canvas.height = tile * 2;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FBFAF6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const images = [];
      for (const src of sources) {
        images.push(
          src
            ? await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("image decode failed"));
                img.src = src;
              })
            : null
        );
      }
      const layout = [
        [0, 0], [tile, 0], [tile * 2, 0],
        [0, tile], [tile, tile], [tile * 2, tile],
      ];
      images.forEach((img, i) => {
        const [x, y] = layout[i];
        if (img) {
          ctx.save();
          ctx.filter = filter === "dark" ? "brightness(0.16)" : filter === "blurry" ? "blur(18px)" : "none";
          const vw = img.naturalWidth;
          const vh = img.naturalHeight;
          const s = Math.max(tile / vw, tile / vh);
          const dw = vw * s;
          const dh = vh * s;
          ctx.drawImage(img, x + (tile - dw) / 2, y + (tile - dh) / 2, dw, dh);
          ctx.restore();
        }
        ctx.strokeStyle = "#FBFAF6";
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, tile, tile);
        ctx.fillStyle = filter === "dark" ? "#FFFFFF" : "#A34A21";
        ctx.font = "600 20px system-ui";
        ctx.textBaseline = "top";
        ctx.fillText(String(i + 1), x + 12, y + 12);
      });
      let quality = 0.72;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (Math.round(dataUrl.length * 0.75) > targetBytes && quality > 0.3) {
        quality -= 0.05;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      return dataUrl;
    },
    { sources, filter, tile: TILE, targetBytes: TARGET_BYTES }
  );

  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  const out = path.join(outDir, label);
  fs.writeFileSync(out, bytes);
  const kb = (bytes.length / 1024).toFixed(0);
  console.log(`${label}: ${kb}KB`);
  return bytes.length;
}

const variantSources = (dataUrl) => [
  dataUrl, dataUrl, dataUrl,
  dataUrl, dataUrl, dataUrl,
];

let ok = true;
ok = (await compose({ label: "ds-01-ideal-avocado.jpg", sources: variantSources(avocadoDataUrl), filter: "none" })) <= TARGET_BYTES && ok;
ok = (await compose({ label: "ds-03-blurry-avocado.jpg", sources: variantSources(avocadoDataUrl), filter: "blurry" })) <= TARGET_BYTES && ok;
ok = (await compose({ label: "ds-04-dark-avocado.jpg", sources: variantSources(avocadoDataUrl), filter: "dark" })) <= TARGET_BYTES && ok;
ok = (await compose({ label: "ds-02-empty-oval.jpg", sources: Array(6).fill(null), filter: "empty" })) <= TARGET_BYTES && ok;

await browser.close();
if (!ok) {
  console.error("A fixture exceeded the composite budget; lower quality and regenerate.");
  process.exit(1);
}
console.log("Deep-scan fixtures regenerated.");
