import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const requireProxy = createRequire(new URL("../../../apps/proxy/package.json", import.meta.url));
const { buildSync } = requireProxy("esbuild");

it("error notices use catalog copy despite English, missing, or Portuguese backend messages", () => {
  const webDir = fileURLToPath(new URL("../../../apps/web", import.meta.url));
  const result = buildSync({
    absWorkingDir: webDir,
    stdin: { contents: `import React from "react";
      import {renderToStaticMarkup} from "react-dom/server";
      import i18n from "./src/i18n";
      import {ScanErrorStage} from "./src/components/ScanErrorStage";
      const results=[];
      for(const locale of ["en-GB","pt-BR"]){
        i18n.changeLanguage(locale);
        for(const [status,key,reason] of [["no_produce","noProduce",null],["unclear_photo","unclearPhoto",null],["multiple_types","multipleTypes",null],["rate_limited","rateLimited",null],["analysis_failed","analysisFailed",null],["insufficient_evidence","insufficientEvidence","missing_evidence"],["insufficient_evidence","similarMaturity","assessed_tie"]]){
          for(const errorMessage of ["RAW ENGLISH BACKEND MESSAGE",null,"MENSAGEM BRUTA DO MODELO"]){
            const html=renderToStaticMarkup(React.createElement(ScanErrorStage,{status,abstentionReason:reason,errorMessage,photoDataUrl:null,onRetake(){}}));
            results.push({locale,status,key,valid:html.includes(renderToStaticMarkup(React.createElement(React.Fragment,null,i18n.t("errors."+key))))&&!html.includes("RAW ENGLISH")&&!html.includes("MENSAGEM BRUTA")});
          }
        }
      }
      process.stdout.write(JSON.stringify(results));`, resolveDir:webDir,loader:"tsx" },
    bundle:true,write:false,platform:"node",format:"cjs",loader:{".css":"empty"},logLevel:"silent",
  });
  const results=JSON.parse(execFileSync(process.execPath,["--input-type=commonjs"],{input:result.outputFiles[0].text,encoding:"utf8",maxBuffer:1024*1024,timeout:15000}));
  expect(results).toHaveLength(42);
  expect(results.filter((result:{valid:boolean})=>!result.valid)).toEqual([]);
},30000);
