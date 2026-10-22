const CACHE_NAME = "pomona-shell-v18";
const PRECACHE_URLS = ["/offline", "/manifest.json", "/icon-192.png", "/icon-512.png", "/launch-screen.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        const response = await fetch("/offline-assets.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Offline asset manifest unavailable");
        const assets = await response.json();
        if (!Array.isArray(assets) || !assets.every((asset) => typeof asset === "string" && asset.startsWith("/assets/"))) throw new Error("Invalid offline asset manifest");
        await cache.addAll([...PRECACHE_URLS, ...assets]);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {}));
        }
        return response;
      })
      .catch(() =>
        caches.match(request)
      )
  );
});
