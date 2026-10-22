import { spawnSync } from "node:child_process";
import { clefLocalEnvironment, localClefCommand, localClefStackCommand } from "./clef-test-isolation";

try {
  const stack = process.argv.includes("--stack");
  const env = clefLocalEnvironment(process.env);
  const command = stack ? localClefStackCommand(env) : localClefCommand(env);
  if (env.CLEF_ALLOW_SHARED_ACCOUNT === "true") console.log("Same-account testing enabled: Workers AI billing and capacity are shared.");
  console.log(stack
    ? "Starting local frontend at https://127.0.0.1:5178 and isolated Worker at http://127.0.0.1:8788."
    : "Starting isolated local Worker at http://127.0.0.1:8788. No production deployment is performed.");
  const result = spawnSync(command.command, command.args, { cwd: command.cwd, env: command.env, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local Clef setup failed.");
  process.exitCode = 1;
}
