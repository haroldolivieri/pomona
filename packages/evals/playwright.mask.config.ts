import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  testMatch: "full-frame-mask.spec.ts",
  workers: 1,
  use: {
    baseURL: "https://127.0.0.1:5177",
    ignoreHTTPSErrors: true,
    viewport: { width: 393, height: 852 },
  },
  webServer: {
    command: "pnpm --filter @pomona/web dev:clef:local --port 5177",
    cwd: "../..",
    url: "https://127.0.0.1:5177",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
  },
});
