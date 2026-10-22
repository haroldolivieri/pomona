import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const workflow = fs.readFileSync(new URL(".github/workflows/deploy.yml", root), "utf8");

it.each([
  ["1.1.2", "1.1.1", "Direct gate and metrics", true],
  ["1.1.1", "1.1.1", "Direct gate and metrics", false],
  ["1.0.0", "1.1.1", "Direct gate and metrics", false],
  ["bad", "1.1.1", "Direct gate and metrics", false],
  ["1.1.2", "1.1.1", "", false],
  ["1.1.2", "1.1.1", "x".repeat(121), false],
  ["1.1.2", "1.1.1", "line one\nline two", false],
])("CI release metadata %s over %s validates the actual workflow", (version, previous, releaseDescription, valid) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pomona-release-"));
  try {
    fs.mkdirSync(path.join(directory, "apps/web/dist"), { recursive: true });
    fs.writeFileSync(path.join(directory, "apps/web/package.json"), JSON.stringify({ version, releaseDescription }));
    fs.writeFileSync(path.join(directory, "apps/web/dist/version.json"), JSON.stringify({ version, changes: releaseDescription }));
    const inline = workflow.split("node --input-type=module <<'NODE'\n")[1].split("          NODE")[0]
      .replace("import { execFileSync } from 'node:child_process';", `const execFileSync = () => JSON.stringify({version: '${previous}'});\nglobalThis.fetch = async () => ({ok:true,json:async()=>({version:'${previous}'})});`);
    const run = () => execFileSync(process.execPath, ["--input-type=module", "-e", inline], {
      cwd: directory, stdio: "pipe", env: { ...process.env, GITHUB_OUTPUT: path.join(directory, "outputs"), GITHUB_STEP_SUMMARY: path.join(directory, "summary") },
    });
    if (valid) {
      expect(run).not.toThrow();
      expect(fs.readFileSync(path.join(directory, "outputs"), "utf8")).toContain(`message=v${version}: ${releaseDescription}`);
    } else expect(run).toThrow();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it("keeps deployment in main CI and removes local deployment from provisioning", () => {
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain('--tag "v$RELEASE_VERSION" --message "$RELEASE_MESSAGE"');
  const setup = fs.readFileSync(new URL("scripts/setup-cloudflare.sh", root), "utf8");
  expect(setup).not.toMatch(/wrangler\s+deploy/);
});

it("CI pnpm setup matches the pinned package manager", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
  const versions = [...workflow.matchAll(/uses: pnpm\/action-setup@v4\s+with:\s+version: ([^\s]+)/g)].map(match => match[1]);
  expect(versions.length).toBeGreaterThan(0);
  expect(versions.every(version => `pnpm@${version}` === pkg.packageManager)).toBe(true);
});
