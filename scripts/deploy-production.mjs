import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { execFileSync, spawnSync } from "node:child_process";
import { assertVersionBump, releaseMessage, assertCiDeployment } from "./release-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
try {
  assertCiDeployment(process.env);
  git("fetch", "origin", "main", "--tags");
  git("merge-base", "--is-ancestor", "origin/main", "HEAD");
  git("diff", "--exit-code", "HEAD", "--");
  const pkg = JSON.parse(fs.readFileSync(`${root}/apps/web/package.json`, "utf8"));
  const base = process.env.RELEASE_BASE_REF || (git("rev-parse", "HEAD") === git("rev-parse", "origin/main") ? "HEAD^" : "origin/main");
  const previous = JSON.parse(git("show", `${base}:apps/web/package.json`)).version;
  assertVersionBump(pkg.version, previous);
  const message = releaseMessage(pkg.version, pkg.releaseDescription);
  const built = JSON.parse(fs.readFileSync(`${root}/apps/web/dist/version.json`, "utf8"));
  if (built.version !== pkg.version || built.changes !== pkg.releaseDescription) throw new Error("Rebuild the app: release metadata differs from the source");
  const local = fs.existsSync(`${root}/.env`) ? parseEnv(fs.readFileSync(`${root}/.env`, "utf8")) : {};
  const token = process.env.CLOUDFLARE_API_TOKEN || local.CLOUDFLARE_API_TOKEN || local.CLOUDFARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || "553fb87d04f36b2f088f1250f34503cc";
  if (!token) throw new Error("Cloudflare API token missing");
  // Public metadata prevents publishing an equal/lower version even before GitHub is updated.
  const current = await fetch("https://pomona-proxy.pomona-app.workers.dev/version.json", { cache: "no-store" });
  if (current.ok) assertVersionBump(pkg.version, (await current.json()).version);
  else if (current.status !== 404) throw new Error(`Cannot verify production version: HTTP ${current.status}`);
  const config = JSON.parse(fs.readFileSync(`${root}/apps/proxy/wrangler.jsonc`, "utf8"));
  if (config.name !== "pomona-proxy" || account !== "553fb87d04f36b2f088f1250f34503cc") throw new Error("Unexpected production target");
  console.log(`Deploying ${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Production deployment\n\n${message}\n\nCommit: ${git("rev-parse", "HEAD")}\n`);
  const args = [`${root}/apps/proxy/node_modules/wrangler/bin/wrangler.js`, "deploy", "--config", `${root}/apps/proxy/wrangler.jsonc`,
    "--keep-vars", "--tag", `v${pkg.version}`, "--message", message];
  for (const key of ["AI_GATEWAY_ACCOUNT_ID", "AI_GATEWAY_ID"]) {
    if (process.env[key]) args.push("--var", `${key}:${process.env[key]}`);
  }
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env,
    CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_LOG_PATH: "/tmp/pomona-production-deploy.log" }, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production deployment stopped");
  process.exitCode = 1;
}
