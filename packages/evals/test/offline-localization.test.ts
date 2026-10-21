import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("first-visit offline locale startup uses a neutral shell with every app asset", async () => {
  const listeners: Record<string,(event: any)=>void> = {};
  const files = new Map<string,Response>();
  let offline = false;
  const cache = { addAll: async (urls: string[]) => { for (const url of urls) files.set(url,new Response(url === "/offline" ? "neutral shell" : "asset")); }, keys: async () => [...files.keys()], put: async () => {} };
  const caches = { open: async () => cache, keys: async () => ["pomona-shell-old"], delete: async () => true, match: async (key: string) => files.get(key)?.clone() };
  runInNewContext(readFileSync(new URL("../../../apps/web/public/sw.js",import.meta.url),"utf8"), {
    self:{addEventListener:(name: string,handler: any)=>listeners[name]=handler,location:{origin:"https://app.test"},skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches,URL,
    fetch:async (request: string | {url:string}) => {
      if(offline) throw new Error("offline");
      const url=typeof request === "string" ? request : request.url;
      return url === "/offline-assets.json" ? Response.json(["/assets/app.js","/assets/app.css"]) : new Response("personalized online HTML");
    },
  });
  let install!: Promise<void>;
  listeners.install({waitUntil:(promise:Promise<void>)=>install=promise}); await install;
  expect(files.has("/assets/app.js")).toBe(true); expect(files.has("/assets/app.css")).toBe(true);
  expect(files.has("/")).toBe(false); expect(files.has("/index.html")).toBe(false); expect(files.has("/offline.html")).toBe(false);
  let response!: Promise<Response>;
  const event={request:{method:"GET",mode:"navigate",url:"https://app.test/"},respondWith:(promise:Promise<Response>)=>response=promise};
  listeners.fetch(event); expect(await (await response).text()).toBe("personalized online HTML");
  offline=true;
  listeners.fetch(event); expect(await (await response).text()).toBe("neutral shell");
});
