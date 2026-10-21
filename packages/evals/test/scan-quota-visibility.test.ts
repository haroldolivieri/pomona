import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const requireProxy = createRequire(new URL("../../../apps/proxy/package.json", import.meta.url));
const { buildSync } = requireProxy("esbuild");

it("camera, drawing, and analysis hide remaining-scan labels in both languages, including exhausted quota", () => {
  const webDir = fileURLToPath(new URL("../../../apps/web", import.meta.url));
  const result = buildSync({
    absWorkingDir: webDir,
    stdin: {
      contents: `import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import i18n from "./src/i18n";
        import { CameraViewfinder } from "./src/components/CameraViewfinder";
        import { FreehandDrawStage } from "./src/components/FreehandDrawStage";
        import { AnalysingStage } from "./src/components/AnalysingStage";
        const results=[];
        for(const locale of ["en-GB","pt-BR"]){
          i18n.changeLanguage(locale);
          for(const count of [0,7]){
            for(const Component of [CameraViewfinder,FreehandDrawStage,AnalysingStage]){
              const html=renderToStaticMarkup(React.createElement(Component,{remainingScans:count,photoDataUrl:"data:image/png;base64,",onAnalyse(){},onRetake(){},onQuotaClick(){}}));
              results.push({locale,count,stage:Component.name,hidden:!html.includes('scan-quota-pill')&&!html.includes(i18n.t("camera.scansLeftToday",{count}))});
            }
          }
        }
        process.stdout.write(JSON.stringify(results));`,
      resolveDir: webDir, loader: "tsx",
    },
    bundle: true, write: false, platform: "node", format: "cjs",
    loader: { ".css": "empty" }, logLevel: "silent",
    define: { "import.meta.env.DEV": "true", "__APP_VERSION__": '\"test\"' },
  });
  const results = JSON.parse(execFileSync(process.execPath, ["--input-type=commonjs"], {
    input: result.outputFiles[0].text, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 15000,
  }));
  expect(results).toHaveLength(12);
  expect(results.filter((result: { hidden: boolean }) => !result.hidden)).toEqual([]);
}, 30000);
