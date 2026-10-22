import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("production requires a greater version and a versioned change description", () => {
  const code = `import { assertVersionBump, releaseMessage } from './scripts/release-policy.mjs';
    const cases=[];
    for(const [next,previous] of [['1.1.0','1.0.0'],['1.0.1','1.0.0'],['1.0.0','1.0.0'],['0.5.0','1.0.0'],['1.0.0','1.1.0'],['bad','1.0.0']]) {
      try { assertVersionBump(next,previous);cases.push(true); } catch { cases.push(false); }
    }
    const messages=[];
    for(const description of ['Masked scans; Clef gate and tracing','',undefined,'x'.repeat(121),'line one\\nline two']) {
      try { messages.push(releaseMessage('1.1.0',description)); } catch { messages.push(null); }
    }
    process.stdout.write(JSON.stringify({cases,messages}));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code],
    { cwd: new URL("../../..", import.meta.url), encoding: "utf8" }));
  expect(result.cases).toEqual([true, true, false, false, false, false]);
  expect(result.messages).toEqual(["v1.1.0: Masked scans; Clef gate and tracing", null, null, null, null]);
});


it("only main push or manual GitHub Actions releases can deploy production", () => {
  const code = `import { assertCiDeployment } from './scripts/release-policy.mjs';
    const valid = { GITHUB_ACTIONS:'true', GITHUB_REPOSITORY:'haroldolivieri/pomona', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'push' };
    const inputs = [{}, valid, {...valid,GITHUB_EVENT_NAME:'workflow_dispatch'}, {...valid,GITHUB_REF:'refs/heads/test'}, {...valid,GITHUB_EVENT_NAME:'pull_request'}, {...valid,GITHUB_REPOSITORY:'other/repo'}];
    process.stdout.write(JSON.stringify(inputs.map(env => { try { assertCiDeployment(env);return true; } catch { return false; } })));`;
  expect(JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code],
    { cwd: new URL("../../..", import.meta.url), encoding: "utf8" }))).toEqual([false, true, true, false, false, false]);
});
