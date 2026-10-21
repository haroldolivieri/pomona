import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
it("enforces copy gate acceptance and failure scenarios", () => {
  const output = execFileSync(process.execPath, ["--test", "--test-reporter=tap", "scripts/check-copy.test.mjs"], { cwd: new URL("../../..", import.meta.url), encoding: "utf8", timeout: 25000 });
  expect(output).toContain("# fail 0");
}, 30000);
