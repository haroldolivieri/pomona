// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
it("does not store online navigation and uses a neutral offline shell", async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const put = vi.fn();
  let offline = false;
  const shell = new Response("neutral shell");
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { addEventListener: (name: string, handler: any) => listeners[name] = handler, location: { origin: "https://app.test" } }, URL,
    fetch: async () => { if (offline) throw new Error("offline"); return new Response("personalized"); },
    caches: { open: async () => ({ put }), match: async (key: any) => key === "/offline" ? shell : undefined },
  });
  let response!: Promise<Response>;
  const event = { request: { method: "GET", mode: "navigate", url: "https://app.test/" }, respondWith: (value: Promise<Response>) => response = value };
  listeners.fetch(event);
  expect(await (await response).text()).toBe("personalized");
  expect(put).not.toHaveBeenCalled();
  offline = true;
  listeners.fetch(event);
  expect(await (await response).text()).toBe("neutral shell");
});
