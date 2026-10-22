import path from "node:path";
import fs from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

type Environment = Record<string, string | undefined>;
const accountId = /^[a-f0-9]{32}$/i;

export function requireClefTestAccount(env: Environment): string {
  const test = env.CLEF_TEST_ACCOUNT_ID?.trim();
  const production = env.CLEF_PRODUCTION_ACCOUNT_ID?.trim();
  if (!test || !production || !accountId.test(test) || !accountId.test(production)) {
    throw new Error("Set explicit CLEF_TEST_ACCOUNT_ID and CLEF_PRODUCTION_ACCOUNT_ID before live testing.");
  }
  if (test.toLowerCase() === production.toLowerCase() && env.CLEF_ALLOW_SHARED_ACCOUNT !== "true") {
    throw new Error("Same-account testing requires CLEF_ALLOW_SHARED_ACCOUNT=true; AI billing and capacity are shared.");
  }
  return test;
}

export function clefTestInferenceUrl(env: Environment): string {
  return `https://api.cloudflare.com/client/v4/accounts/${requireClefTestAccount(env)}/ai/run/@cf/cloudflare/clef-flash`;
}

export function localClefCommand(env: Environment) {
  const test = requireClefTestAccount(env);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const configDirectory = path.join(root, "apps/proxy/clef-local");
  const isolatedEnv: Environment = { ...env, CLOUDFLARE_ACCOUNT_ID: test, WRANGLER_LOG_PATH: "/tmp/pomona-clef-local.log" };
  for (const key of ["AI_GATEWAY_ACCOUNT_ID", "AI_GATEWAY_ID", "AI_GATEWAY_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY"]) {
    delete isolatedEnv[key];
  }
  return {
    command: "pnpm",
    args: ["--filter", "@pomona/proxy", "exec", "wrangler", "dev", "--config", path.join(configDirectory, "wrangler.jsonc"),
      "--ip", "127.0.0.1", "--port", "8788", "--persist-to", "/tmp/pomona-clef-local-state"],
    cwd: configDirectory,
    env: isolatedEnv,
  };
}

export function localClefStackCommand(env: Environment) {
  const isolated = localClefCommand(env);
  return {
    command: "pnpm",
    args: ["--parallel", "--filter", "@pomona/web", "--filter", "@pomona/evals", "run", "dev:clef:local"],
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    env: isolated.env,
  };
}

// This file belongs only to local test launchers, never deployment configuration.
export function clefLocalEnvironment(env: Environment): Environment {
  const settingsPath = fileURLToPath(new URL("../../../apps/proxy/clef-local/.env", import.meta.url));
  const local: Environment = {};
  const rootEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (fs.existsSync(rootEnvPath)) {
    const rootEnv = parseEnv(fs.readFileSync(rootEnvPath, "utf8"));
    // Load only Cloudflare authentication, never production provider keys.
    const token = rootEnv.CLOUDFLARE_API_TOKEN || rootEnv.CLOUDFARE_API_TOKEN;
    if (token) local.CLOUDFLARE_API_TOKEN = token;
  }
  if (fs.existsSync(settingsPath)) {
    for (const line of fs.readFileSync(settingsPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^(CLEF_TEST_ACCOUNT_ID|CLEF_PRODUCTION_ACCOUNT_ID|CLEF_ALLOW_SHARED_ACCOUNT)=([a-zA-Z0-9]*)$/);
      if (match) local[match[1]] = match[2];
    }
  }
  return { ...local, ...env };
}
