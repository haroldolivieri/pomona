import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const requireProxy = createRequire(new URL("../../../apps/proxy/package.json", import.meta.url));
const { buildSync } = requireProxy("esbuild");

const runBundle = (): string => {
  const result = buildSync({
    absWorkingDir: fileURLToPath(new URL("../../../apps/web", import.meta.url)),
    stdin: {
      contents: `import { assembleDeepScanPayload, mockDeepScanFrames, DeepScanLocalReject } from "./src/lib/deep-scan-capture";
      const run = async () => {
        const results = {};
        const darkFrame = (seq) => ({ sequence: seq, gray: new Float32Array(24 * 24).fill(4), grayW: 24, grayH: 24, thumb: new Float32Array(24 * 24).fill(4), dataUrl: "data:image/png;base64,DARK" + seq });
        const dark = mockDeepScanFrames(3).map((f) => ({ ...f, gray: new Float32Array(24 * 24).fill(4), thumb: new Float32Array(24 * 24).fill(4), dataUrl: "data:image/png;base64,DARK" + f.sequence }));
        // Failure case: default screening rejects an all-dark capture
        try {
          await assembleDeepScanPayload(dark, { build: async () => ({ dataUrl: "x", tileCount: 0 }) });
          results.defaultScreening = "accepted";
        } catch (err) {
          results.defaultScreening = { reason: err instanceof DeepScanLocalReject ? err.reason : "other" };
        }
        // Mock pipeline: pass-through selector accepts any capture
        results.mockFramesShape = mockDeepScanFrames(6).length;
        const payload = await assembleDeepScanPayload(dark, {
          build: async () => ({ dataUrl: "composite", tileCount: 3 }),
          select: (samples) => ({ kept: samples.slice(0, 6), keptScores: samples.slice(0, 6).map(() => 0.5), stats: { sampled: samples.length, rejectedBlur: 0, rejectedExposure: 0, rejectedSimilarity: 0 } }),
        });
        results.mockPipeline = { sampleCount: payload.sampleCount, tileCount: payload.composite.tileCount, rejectedSummarised: payload.stats.rejectedBlur + payload.stats.rejectedExposure };
        process.stdout.write(JSON.stringify(results));
      };
      void run();`,
      resolveDir: fileURLToPath(new URL("../../../apps/web", import.meta.url)),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    loader: { ".css": "empty" },
    logLevel: "silent",
  });
  return execFileSync(process.execPath, ["--input-type=commonjs"], {
    input: result.outputFiles[0].text,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 20000,
  });
};

it("mock deep-scan pipeline accepts any capture while default screening still rejects unusable frames", () => {
  const results = JSON.parse(runBundle());
  expect(results.defaultScreening).toEqual({ reason: "too_dark_or_bright" });
  expect(results.mockFramesShape).toBe(6);
  expect(results.mockPipeline).toEqual({ sampleCount: 3, tileCount: 3, rejectedSummarised: 0 });
}, 40000);
