import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const requireProxy = createRequire(new URL("../../../apps/proxy/package.json", import.meta.url));
const { buildSync } = requireProxy("esbuild");
it.each([true, false])("language selector follows debug and local-build gates (local=%s)", (local) => {
  const result = buildSync({
    absWorkingDir: fileURLToPath(new URL("../../../apps/web", import.meta.url)),
    stdin: { contents: `import React from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { PomonaApp } from "./src/App";
      const client={getQuota:async()=>({remainingDeviceScans:10,budgetOpen:true}),overrideQuota:async()=>({success:true,deviceId:"test",deviceLimit:10,remainingDeviceScans:10}),submitScan:async()=>{throw Error("unused")}};
      const telemetry={capture(){},captureException(){}};
      const results=[false,true].map(debug=>renderToStaticMarkup(React.createElement(PomonaApp,{apiClient:client,telemetry,enableDebugOverride:debug})).includes("<select"));
      process.stdout.write(JSON.stringify(results));`, resolveDir:fileURLToPath(new URL("../../../apps/web", import.meta.url)),loader:"tsx" },
    bundle:true,write:false,platform:"node",format:"cjs",loader:{".css":"empty"},logLevel:"silent",
    define:{"import.meta.env.DEV":String(local),"__APP_VERSION__":'"test"'},
  });
  const rendered=JSON.parse(execFileSync(process.execPath,["--input-type=commonjs"],{input:result.outputFiles[0].text,encoding:"utf8",maxBuffer:1024*1024,timeout:15000}));
  expect(rendered).toEqual(local ? [false,true] : [false,false]);
},30000);
