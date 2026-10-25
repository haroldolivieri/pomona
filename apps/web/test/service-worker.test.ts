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

it("first-visit offline locale startup caches assets and uses a neutral shell", async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const files = new Map<string, Response>();
  let offline = false;
  const cache = {
    addAll: async (urls: string[]) => {
      for (const url of urls) files.set(url, new Response(url === "/offline" ? "neutral shell" : "asset"));
    },
    keys: async () => [...files.keys()],
    put: async () => {},
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["pomona-shell-old"],
    delete: async () => true,
    match: async (key: string) => files.get(key)?.clone(),
  };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: {
      addEventListener: (name: string, handler: any) => listeners[name] = handler,
      location: { origin: "https://app.test" },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    URL,
    fetch: async (request: string | { url: string }) => {
      if (offline) throw new Error("offline");
      const url = typeof request === "string" ? request : request.url;
      return url === "/offline-assets.json"
        ? Response.json(["/assets/app.js", "/assets/app.css"])
        : new Response("personalized online HTML");
    },
  });
  let install!: Promise<void>;
  listeners.install({ waitUntil: (promise: Promise<void>) => install = promise });
  await install;
  expect(files.has("/assets/app.js")).toBe(true);
  expect(files.has("/assets/app.css")).toBe(true);
  expect(files.has("/")).toBe(false);
  expect(files.has("/index.html")).toBe(false);
  expect(files.has("/offline.html")).toBe(false);

  let response!: Promise<Response>;
  const event = {
    request: { method: "GET", mode: "navigate", url: "https://app.test/" },
    respondWith: (promise: Promise<Response>) => response = promise,
  };
  listeners.fetch(event);
  expect(await (await response).text()).toBe("personalized online HTML");
  offline = true;
  listeners.fetch(event);
  expect(await (await response).text()).toBe("neutral shell");
});
