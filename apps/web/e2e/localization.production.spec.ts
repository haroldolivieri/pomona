import { test, expect } from "@playwright/test";

test("built Worker negotiates HTML and keeps static assets unpersonalized", async ({request}) => {
  const pt=await request.get("/",{headers:{"Accept-Language":"pt-BR"}});
  const html=await pt.text();
  expect(html).toContain('data-pomona-locale="pt-BR"');
  expect(html).toContain("Pomona · Escolha suas frutas");
  expect(pt.headers()["cache-control"]).toBe("private, no-store");
  const en=await request.get("/",{headers:{"Accept-Language":"pt-BR",Cookie:"pomona_locale=en-GB"}});
  expect(await en.text()).toContain('data-pomona-locale="en-GB"');
  const shell=await request.get("/offline.html");
  expect(await shell.text()).not.toContain("data-pomona-locale");
  const asset=html.match(/src="([^\"]+\.js)"/)!;
  expect((await request.get(asset[1])).headers()["content-type"]).toContain("javascript");
  expect((await request.get("/missing.js")).status()).toBe(404);
});

test("offline restart works after the first visit without caching personalized HTML", async ({page,context}) => {
  await page.route("**/api/v1/quota",route=>route.fulfill({json:{remainingDeviceScans:10,budgetOpen:true}}));
  await page.goto("/");
  await expect(page.getByText("Aponte para uma fruta ou um grupo")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached=await page.evaluate(async () => { const cache=await caches.open((await caches.keys())[0]); return (await cache.keys()).map(request=>new URL(request.url).pathname); });
  expect(cached).not.toContain("/"); expect(cached).not.toContain("/index.html");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang","pt-BR");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Você está sem conexão")).toBeVisible();
});
