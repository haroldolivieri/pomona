import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Acceptance: the deep-scan result reuses the original scan result's contextual
// top bar (✕ close, produce chip, ↻ retake) and its header contract (eyebrow,
// serif headline, muted subtitle, circular score meter) — rendered from the same
// shared primitives, not a recreated style.

const requireProxy = createRequire(new URL("../../../apps/proxy/package.json", import.meta.url));
const { buildSync } = requireProxy("esbuild");

const deepScanFixture = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "test-model",
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Avocado", variety: "Hass" },
  ripeness: { state: "nearly_ripe", confidence: 0.86 },
  evidence: ["Skin losing green"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: { eatWhen: "in_a_few_days" },
  afterPurchase: {
    readyInDays: { min: 1, max: 2 },
    eatWithinDays: { min: 3, max: 4 },
    eatWithinLabel: "3-4 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole on the counter", tip: "Softens daily" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Sealed in the fridge", tip: "Keep chilled" },
    },
  },
  seasonality: null,
};

it("deep-scan result and the original scan result share the same contextual top bar and score-meter contract", () => {
  const webDir = fileURLToPath(new URL("../../../apps/web", import.meta.url));
  const result = buildSync({
    absWorkingDir: webDir,
    stdin: {
      contents: `import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import i18n from "./src/i18n";
        import { DeepScanResultStage } from "./src/components/DeepScanResultStage";
        const response = ${JSON.stringify(deepScanFixture)};
        const html = renderToStaticMarkup(React.createElement(DeepScanResultStage, {
          response, errorMessage: null, onNewScan() {},
        }));
        const required = [
          'data-testid="close-button"',
          'data-testid="produce-name-chip"',
          'data-testid="retake-button"',
          'data-testid="circular-score-meter"',
          'aria-label="' + i18n.t("copy.resetAndScanAgain") + '"',
          'aria-label="' + i18n.t("copy.retakePhoto") + '"',
          ">8.6</span>", // 0.86 confidence on the same 0..10 meter as the original result
        ];
        const missing = required.find((needle) => !html.includes(needle));
        if (missing) { process.stdout.write(JSON.stringify({ ok: false, missing })); }
        else { process.stdout.write(JSON.stringify({ ok: true })); }`,
      resolveDir: webDir, loader: "tsx",
    },
    bundle: true, write: false, platform: "node", format: "cjs",
    loader: { ".css": "empty" }, logLevel: "silent",
    define: { "import.meta.env.DEV": "true", "__APP_VERSION__": '"test"' },
  });
  const output = JSON.parse(execFileSync(process.execPath, ["--input-type=commonjs"], {
    input: result.outputFiles[0].text, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 15000,
  }));
  expect(output).toMatchObject({ ok: true });
});
