import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const requireProxy = createRequire(new URL("../../../apps/proxy/package.json", import.meta.url));
const { buildSync } = requireProxy("esbuild");

const rendered = (local: boolean, debug: boolean): string => {
  const result = buildSync({
    absWorkingDir: fileURLToPath(new URL("../../../apps/web", import.meta.url)),
    stdin: {
      contents: `import React from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { PomonaApp } from "./src/App";
      const client={getQuota:async()=>({remainingDeviceScans:10,budgetOpen:true}),overrideQuota:async()=>({success:true,deviceId:"test",deviceLimit:10,remainingDeviceScans:10}),submitScan:async()=>{throw Error("unused")},submitDeepScan:async()=>{throw Error("unused")}};
      const telemetry={capture(){},identify(){},captureException(){}};
      process.stdout.write(renderToStaticMarkup(React.createElement(PomonaApp,{apiClient:client,telemetry,enableDebugOverride:${debug}})));`,
      resolveDir: fileURLToPath(new URL("../../../apps/web", import.meta.url)),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    loader: { ".css": "empty" },
    logLevel: "silent",
    define: { "import.meta.env.DEV": String(local), "__APP_VERSION__": '"test"' },
  });
  return execFileSync(process.execPath, ["--input-type=commonjs"], {
    input: result.outputFiles[0].text,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 15000,
  });
};

it.each([
  [true, true, true],
  [true, false, false],
  [false, true, false],
  [false, false, false],
] as const)("debug deep-scan shortcut follows the 5-tap debug gates (local=%s, debugUnlock=%s)", (local, debugUnlock, expected) => {
  expect(rendered(local, debugUnlock).includes('data-testid="dev-deep-scan-button"')).toBe(expected);
}, 40000);
