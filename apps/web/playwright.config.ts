import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.POMONA_WEB_PORT ?? 5173);
const baseURL = `https://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/*.production.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    viewport: { width: 393, height: 852 },
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        ignoreHTTPSErrors: true,
        viewport: { width: 393, height: 852 },
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
