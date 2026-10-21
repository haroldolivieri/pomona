import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
let runtime: Miniflare;
beforeAll(async () => {
  const bundle = await build({ stdin: { contents: `import { serveLocalizedDocument } from "./src/document";
export default { fetch(request) { return serveLocalizedDocument(request, {fetch: async () => new Response('<html lang="en"><head><title>Pomona</title></head><body></body></html>', {headers:{'Content-Type':'text/html'}})}) } };`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "esm", platform: "browser" });
  runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-03-01" }));
});
afterAll(async () => { await runtime?.dispose(); });
it("injects locale without sharing personalized HTML", async () => {
  const pt = await runtime.dispatchFetch("http://local/", { headers: { "Accept-Language": "pt-BR" } });
  expect(pt.headers.get("cache-control")).toBe("private, no-store");
  expect(await pt.text()).toContain('data-pomona-locale="pt-BR"');
  const en = await runtime.dispatchFetch("http://local/", { headers: { "Accept-Language": "pt", cookie: "pomona_locale=en-GB" } });
  expect(await en.text()).toContain('lang="en-GB"');
});
it("does not embed raw untrusted preference strings", async () => {
  const response = await runtime.dispatchFetch("http://local/index.html", { headers: { cookie: 'pomona_locale=%3Cscript%3E', "Accept-Language": "en" } });
  const html = await response.text();
  expect(html).toContain('data-pomona-locale="en-GB"');
  expect(html).not.toContain("%3Cscript%3E");
});
