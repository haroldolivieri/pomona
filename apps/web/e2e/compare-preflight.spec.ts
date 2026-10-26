import { test, expect } from "@playwright/test";

test("Compare pre-flight rejects a flat unusable frame locally without calling the scan API", async ({ page }) => {
  let scanCalls = 0;
  await page.route("**/api/v1/quota", (route) =>
    route.fulfill({ json: { remainingDeviceScans: 10, budgetOpen: true } })
  );
  await page.route("**/api/v1/scan", async (route) => {
    scanCalls += 1;
    await route.abort();
  });
  await page.goto("/");
  await page.getByTestId("shutter-button").click();
  await expect(page.getByTestId("stage-S_ScanError")).toBeVisible();
  await expect(page.getByTestId("error-primary-cta")).toBeVisible();
  expect(scanCalls).toBe(0);

  // Retake returns to the live camera
  await page.getByTestId("error-primary-cta").click();
  await expect(page.getByTestId("shutter-button")).toBeVisible();
});

test("Compare pre-flight bypass lets a flat frame through to focus drawing", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__POMONA_BYPASS_LOCAL_REJECT = true;
  });
  await page.route("**/api/v1/quota", (route) =>
    route.fulfill({ json: { remainingDeviceScans: 10, budgetOpen: true } })
  );
  await page.goto("/");
  await page.getByTestId("shutter-button").click();
  await expect(page.getByTestId("stage-S2_DrawFocusArea")).toBeVisible();
});
