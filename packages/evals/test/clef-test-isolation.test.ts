import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { requireClefTestAccount, clefTestInferenceUrl, localClefCommand, localClefStackCommand } from "../scripts/clef-test-isolation";
import { getGatewayRouting } from "@pomona/proxy";

const accounts = { CLEF_TEST_ACCOUNT_ID: "a".repeat(32), CLEF_PRODUCTION_ACCOUNT_ID: "b".repeat(32) };

it("production enables invocation logs, traces, the AI gate, and localized asset routing", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../../../apps/proxy/wrangler.jsonc", import.meta.url), "utf8"));
  expect(config.observability.logs).toMatchObject({ enabled: true, invocation_logs: true });
  expect(config.observability.traces.enabled).toBe(true);
  expect(config.ai.binding).toBe("AI");
  expect(config.assets.binding).toBe("ASSETS");
  expect(config.assets.run_worker_first).toContain("/");
});

describe("local-only Clef test isolation", () => {
  it.each([{}, { CLOUDFLARE_ACCOUNT_ID: accounts.CLEF_PRODUCTION_ACCOUNT_ID },
    { ...accounts, CLEF_TEST_ACCOUNT_ID: accounts.CLEF_PRODUCTION_ACCOUNT_ID },
    { ...accounts, CLEF_TEST_ACCOUNT_ID: "invalid" }])("refuses missing, inferred, production, or invalid targets", env => {
    expect(() => requireClefTestAccount(env)).toThrow();
  });

  it("permits same-account inference only with explicit opt-in", () => {
    const env = { ...accounts, CLEF_TEST_ACCOUNT_ID: accounts.CLEF_PRODUCTION_ACCOUNT_ID };
    expect(() => requireClefTestAccount(env)).toThrow();
    expect(() => requireClefTestAccount({ ...env, CLEF_ALLOW_SHARED_ACCOUNT: "false" })).toThrow();
    expect(requireClefTestAccount({ ...env, CLEF_ALLOW_SHARED_ACCOUNT: "true" })).toBe(accounts.CLEF_PRODUCTION_ACCOUNT_ID);
    const command = localClefCommand({ ...env, CLEF_ALLOW_SHARED_ACCOUNT: "true", AI_GATEWAY_ID: "production" });
    expect(command.args).not.toContain("--remote");
    expect(command.args).not.toContain("deploy");
    expect(command.env.AI_GATEWAY_ID).toBeUndefined();
  });

  it("pins native inference to the separate test account and strips inherited provider/Gateway credentials", () => {
    const command = localClefCommand({ ...accounts, CLOUDFLARE_ACCOUNT_ID: accounts.CLEF_PRODUCTION_ACCOUNT_ID,
      AI_GATEWAY_ID: "production", AI_GATEWAY_TOKEN: "production-token", GEMINI_API_KEY: "production-key" });
    expect(command.env.CLOUDFLARE_ACCOUNT_ID).toBe(accounts.CLEF_TEST_ACCOUNT_ID);
    expect(command.env.AI_GATEWAY_ID).toBeUndefined();
    expect(command.env.AI_GATEWAY_TOKEN).toBeUndefined();
    expect(command.env.GEMINI_API_KEY).toBeUndefined();
    expect(command.args).not.toContain("--remote");
    expect(command.args).not.toContain("--remote");
    expect(command.args).not.toContain("deploy");
    expect(command.args).toContain("127.0.0.1");
    expect(command.args).toContain("8788");
    // Inspect the actual selected config, not a parallel test-only definition.
    const config = JSON.parse(fs.readFileSync(command.args[command.args.indexOf("--config") + 1], "utf8"));
    expect(config.name).toBe("pomona-proxy-test");
    expect(config.main).toBe("./entry.ts");
    expect(config.ai).toEqual({ binding: "AI", remote: true });
    expect(config.kv_namespaces).toEqual([{ binding: "POMONA_QUOTA_KV", id: "0".repeat(32), remote: false }]);
    expect(config.vars.LOCAL_CLEF_TEST).toBe("true");
    expect(config.vars.AI_GATEWAY_ID).toBeUndefined();
    expect(config.account_id).toBeUndefined();
    expect(path.basename(command.cwd)).toBe("clef-local");
  });

  it("the live runner can address only Clef inference in the declared test account", () => {
    const url = new URL(clefTestInferenceUrl({ ...accounts, CLOUDFLARE_ACCOUNT_ID: accounts.CLEF_PRODUCTION_ACCOUNT_ID }));
    expect(url.origin).toBe("https://api.cloudflare.com");
    expect(url.pathname).toBe(`/client/v4/accounts/${accounts.CLEF_TEST_ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-flash`);
    expect(url.href).not.toContain(accounts.CLEF_PRODUCTION_ACCOUNT_ID);
  });

  it("local mode ignores even a configured production Gateway for grading", () => {
    expect(getGatewayRouting({ COOKIE_SIGNING_SECRET: "test", LOCAL_CLEF_TEST: "true",
      AI_GATEWAY_ACCOUNT_ID: accounts.CLEF_PRODUCTION_ACCOUNT_ID, AI_GATEWAY_ID: "production" }, "google")).toBeUndefined();
  });

  it("the combined stack refuses missing accounts and launches only the isolated scripts", () => {
    expect(() => localClefStackCommand({})).toThrow();
    const command = localClefStackCommand({ ...accounts, AI_GATEWAY_ID: "production" });
    expect(command.args).toEqual(["--parallel", "--filter", "@pomona/web", "--filter", "@pomona/evals", "run", "dev:clef:local"]);
    expect(command.env.CLOUDFLARE_ACCOUNT_ID).toBe(accounts.CLEF_TEST_ACCOUNT_ID);
    expect(command.env.AI_GATEWAY_ID).toBeUndefined();
  });
});
