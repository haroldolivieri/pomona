import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/quota", route => route.fulfill({
    json: { remainingDeviceScans: 10, budgetOpen: true },
  }));
  await page.goto("/");
});

test("the local frontend proxies API requests only to the isolated local backend", async ({ page }) => {
  const backend = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ backend: "clef-local", path: request.url }));
  });
  await new Promise<void>((resolve, reject) => {
    backend.once("error", reject);
    backend.listen(8788, "127.0.0.1", resolve);
  });
  try {
    const response = await page.request.get("/api/__clef_local_probe");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ backend: "clef-local", path: "/api/__clef_local_probe" });
  } finally {
    await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
  }
});

// Independent pixel probes distinguish a full-frame mask from a crop, dimming,
// a bounding-rectangle mask, and an accidentally inverted polygon.
for (const [width, height] of [[1200, 800], [800, 1200]]) {
  test(`opaque concave selection preserves ${width}x${height} frame coordinates`, async ({ page }) => {
    const result = await page.evaluate(async ({ width, height }) => {
      const moduleUrl = "/src/lib/image-pipeline.ts";
      const { downsampleDataUrl } = await import(moduleUrl);
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      const ctx = source.getContext("2d")!;
      ctx.fillStyle = "rgb(240, 90, 20)";
      ctx.fillRect(0, 0, width, height);
      // An L-shaped loop excludes the lower-right quadrant of its own bounds.
      const polygon = [[200, 200], [800, 200], [800, 400], [400, 400], [400, 800], [200, 800]];
      const upload = await downsampleDataUrl(source.toDataURL("image/png"), 768, 0.95, polygon);
      const image = new Image();
      image.src = `data:${upload.mimeType};base64,${upload.base64}`;
      await image.decode();
      const decoded = document.createElement("canvas");
      decoded.width = image.width;
      decoded.height = image.height;
      const pixels = decoded.getContext("2d")!;
      pixels.drawImage(image, 0, 0);
      const sample = (x: number, y: number) => Array.from(pixels.getImageData(
        Math.floor(x * image.width / 1000), Math.floor(y * image.height / 1000), 1, 1,
      ).data);
      return {
        width: image.width, height: image.height,
        inside: sample(300, 600), outside: sample(100, 100), concavity: sample(600, 600),
      };
    }, { width, height });
    expect([result.width, result.height]).toEqual(width > height ? [768, 512] : [512, 768]);
    expect(result.inside[0]).toBeGreaterThan(220);
    expect(result.inside[1]).toBeGreaterThan(70);
    for (const pixel of [result.outside, result.concavity]) {
      expect(Math.max(...pixel.slice(0, 3))).toBeLessThan(8);
      expect(pixel[3]).toBe(255);
    }
  });
}

test("whole-photo uploads preserve outside pixels; masking failures never send the original", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const moduleUrl = "/src/lib/image-pipeline.ts";
    const { downsampleDataUrl } = await import(moduleUrl);
    const source = document.createElement("canvas");
    source.width = 120;
    source.height = 80;
    const ctx = source.getContext("2d")!;
    ctx.fillStyle = "rgb(240, 90, 20)";
    ctx.fillRect(0, 0, 120, 80);
    const upload = await downsampleDataUrl(source.toDataURL(), 768, 0.95, null);
    const image = new Image();
    image.src = `data:${upload.mimeType};base64,${upload.base64}`;
    await image.decode();
    ctx.drawImage(image, 0, 0);
    let failed = false;
    try {
      await downsampleDataUrl("data:image/jpeg;base64,invalid", 768, 0.8, [[200, 200], [800, 200], [500, 800]]);
    } catch { failed = true; }
    return { pixel: Array.from(ctx.getImageData(10, 10, 1, 1).data), failed };
  });
  expect(result.pixel[0]).toBeGreaterThan(220);
  expect(result.failed).toBe(true);
});

test("invalid selections and unavailable canvas fail instead of silently uploading unmasked pixels", async ({ page }) => {
  const failures = await page.evaluate(async () => {
    const moduleUrl = "/src/lib/image-pipeline.ts";
    const { downsampleDataUrl } = await import(moduleUrl);
    const source = document.createElement("canvas");
    source.width = source.height = 100;
    const dataUrl = source.toDataURL();
    const polygons = [[], [[200, 200], [800, 200]], [[-1, 200], [800, 200], [500, 800]]];
    const outcomes = [];
    for (const polygon of polygons) {
      try { await downsampleDataUrl(dataUrl, 768, 0.8, polygon); outcomes.push(false); }
      catch { outcomes.push(true); }
    }
    const original = HTMLCanvasElement.prototype.getContext;
    try {
      HTMLCanvasElement.prototype.getContext = (() => null) as any;
      try {
        await downsampleDataUrl(dataUrl, 768, 0.8, [[200, 200], [800, 200], [500, 800]]);
        outcomes.push(false);
      } catch { outcomes.push(true); }
    } finally { HTMLCanvasElement.prototype.getContext = original; }
    return outcomes;
  });
  expect(failures).toEqual([true, true, true, true]);
});

// Export the exact prepared reference captures for separately runnable live grading evals.
for (const id of ["02-avocado-polygon-isolation", "17-roma-bulk-pile-focus-polygon", "20-roma-clear-ripeness-focus-polygon"]) {
  test(`reference capture ${id} keeps the full frame`, async ({ page }, testInfo) => {
    const manifest = JSON.parse(readFileSync(new URL("../dataset/ground-truth.json", import.meta.url), "utf8"));
    const scenario = manifest.find((entry: { id: string }) => entry.id === id);
    const source = readFileSync(new URL(`../${scenario.imagePath}`, import.meta.url));
    const mime = scenario.imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
    const capture = await page.evaluate(async ({ dataUrl, polygon }) => {
      const moduleUrl = "/src/lib/image-pipeline.ts";
      const { downsampleDataUrl } = await import(moduleUrl);
      const upload = await downsampleDataUrl(dataUrl, 768, 0.8, polygon);
      const image = new Image();
      image.src = `data:${upload.mimeType};base64,${upload.base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const png = canvas.toDataURL("image/png").split(",")[1];
      const outside = Array.from(ctx.getImageData(1, 1, 1, 1).data);
      const control = await downsampleDataUrl(dataUrl, 768, 0.8, null);
      image.src = `data:${control.mimeType};base64,${control.base64}`;
      await image.decode();
      ctx.drawImage(image, 0, 0);
      return { png, control: canvas.toDataURL("image/png").split(",")[1],
        outside, width: image.width, height: image.height };
    }, { dataUrl: `data:${mime};base64,${source.toString("base64")}`, polygon: scenario.groundTruth.focusPolygon });
    expect(Math.max(capture.width, capture.height)).toBe(768);
    expect(Math.max(...capture.outside.slice(0, 3))).toBeLessThan(8);
    const path = testInfo.outputPath("masked-full-frame.png");
    writeFileSync(path, Buffer.from(capture.png, "base64"));
    writeFileSync(testInfo.outputPath("unmasked-control.png"), Buffer.from(capture.control, "base64"));
    writeFileSync(testInfo.outputPath("scenario.json"), JSON.stringify({ id }));
    await testInfo.attach("masked model input", { path, contentType: "image/png" });
  });
}

test("drawing submits a masked full frame while the UI retains the original photo and box coordinates", async ({ page }) => {
  await page.evaluate(async () => {
    const reactUrl = "/node_modules/.vite/deps/react.js";
    const domUrl = "/node_modules/.vite/deps/react-dom_client.js";
    const appUrl = "/src/App.tsx";
    const [{ default: React }, { default: ReactDOM }, { PomonaApp }] = await Promise.all([
      import(reactUrl), import(domUrl), import(appUrl),
    ]);
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "mask-eval";
    document.body.appendChild(host);
    const source = document.createElement("canvas");
    source.width = 393;
    source.height = 852;
    const ctx = source.getContext("2d")!;
    ctx.fillStyle = "rgb(240, 90, 20)";
    ctx.fillRect(0, 0, 393, 852);
    const original = source.toDataURL();
    (window as any).maskEvalOriginal = original;
    ReactDOM.createRoot(host).render(React.createElement(PomonaApp, {
      apiClient: {
        getQuota: async () => ({ remainingDeviceScans: 10, budgetOpen: true }),
        submitScan: async (request: unknown) => {
          (window as any).maskEvalRequest = request;
          return { remainingScans: 9, response: {
            schemaVersion: "1.0", promptVersion: "v1", modelId: "pixel-eval", round: 1,
            status: "ok", message: null, countedTotal: 1,
            produce: { type: "orange", displayName: "Orange", variety: null },
            candidates: [{ id: "c1", box: [400, 300, 600, 700], score: 8,
              ripeness: "ripe", traits: ["Visible colour"], flipSummary: null }],
            verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
            followUp: null, afterPurchase: null,
          } };
        },
      },
      telemetry: { capture: () => {} },
      initialState: { phase: "S2_DrawFocusArea", currentPhotoDataUrl: original, round1PhotoDataUrl: original },
    }));
  });
  const host = page.locator("#mask-eval");
  await expect(host.getByTestId("stage-S2_DrawFocusArea")).toBeVisible();
  // Draw in the middle of the viewport, away from controls.
  await page.mouse.move(90, 300);
  await page.mouse.down();
  await page.mouse.move(300, 300, { steps: 8 });
  await page.mouse.move(300, 600, { steps: 8 });
  await page.mouse.move(90, 600, { steps: 8 });
  await page.mouse.move(90, 300, { steps: 8 });
  await page.mouse.up();
  await host.getByRole("button", { name: /analyse drawn area/i }).click();
  await expect(host.getByTestId("stage-S4_InitialResult")).toBeVisible();
  const result = await page.evaluate(async () => {
    const request = (window as any).maskEvalRequest;
    const image = new Image();
    image.src = `data:${request.imageMimeType};base64,${request.imageBase64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      width: image.width, height: image.height,
      outside: Array.from(ctx.getImageData(5, 5, 1, 1).data),
      inside: Array.from(ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data),
      originalStillVisible: Array.from(document.querySelectorAll("#mask-eval img")).some(
        image => (image as HTMLImageElement).src === (window as any).maskEvalOriginal,
      ),
      polygon: request.focusPolygon,
    };
  });
  expect([result.width, result.height]).toEqual([354, 768]);
  expect(Math.max(...result.outside.slice(0, 3))).toBeLessThan(8);
  expect(result.inside[0]).toBeGreaterThan(220);
  expect(result.originalStillVisible).toBe(true);
  expect(result.polygon.length).toBeGreaterThanOrEqual(3);
  // The original normalized box still drives the overlay; no crop remapping.
  const winner = host.getByTestId("winner-score-badge").locator("..");
  await expect(winner).toBeVisible();
  expect(await winner.evaluate(element => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top })))
    .toEqual({ left: "30%", top: "40%" });
});
