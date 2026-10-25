import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const defaultCopy = JSON.parse(readFileSync(new URL("../../packages/contract/src/locales/en-GB.json", import.meta.url), "utf8"));

const webPkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string; releaseDescription: string };

export default defineConfig({
  plugins: [react(), basicSsl(), {
    name: "neutral-offline-shell",
    enforce: "post",
    configureServer(server) {
      server.middlewares.use("/offline-assets.json", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end("[]");
      });
      server.middlewares.use("/api/dev/debug-capture", (request, response) => {
        let body = "";
        request.on("data", (chunk) => { body += chunk; });
        request.on("end", () => {
          try {
            const data = JSON.parse(body);
            const dir = "/tmp/pomona-last-inspect";
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "meta.json"), JSON.stringify({
              sessionId: data.sessionId,
              at: data.at,
              sampleCount: data.sampleCount,
              rejectedReason: data.rejectedReason,
              photosCount: data.allDataUrls?.length ?? 0,
              keptCount: data.keptDataUrls?.length ?? 0,
            }, null, 2));
            if (Array.isArray(data.allDataUrls)) {
              data.allDataUrls.forEach((url, i) => {
                const base64 = url.replace(/^data:image\/[a-z]+;base64,/, "");
                writeFileSync(join(dir, `frame-${String(i).padStart(2, "0")}.jpg`), Buffer.from(base64, "base64"));
              });
            }
            if (data.compositeDataUrl) {
              const base64 = data.compositeDataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
              writeFileSync(join(dir, "composite.jpg"), Buffer.from(base64, "base64"));
            }
            console.log(`[vite] Saved ${data.allDataUrls?.length ?? 0} inspect frames to /tmp/pomona-last-inspect (rejectedReason: ${data.rejectedReason ?? "none"})`);
          } catch (e) {
            console.error("[vite] Failed to save debug capture:", e);
          }
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ ok: true }));
        });
      });
    },
    transformIndexHtml(html) {
      return html.replace("%POMONA_TITLE%", defaultCopy.metadata.title).replace("%POMONA_DESCRIPTION%", defaultCopy.metadata.description);
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: webPkg.version, changes: webPkg.releaseDescription }) });
      const offlineAssets = Object.keys(bundle).filter((file) => file.startsWith("assets/") && /\.(?:js|css)$/.test(file)).map((file) => `/${file}`);
      this.emitFile({ type: "asset", fileName: "offline-assets.json", source: JSON.stringify(offlineAssets) });
      const shell = bundle["index.html"];
      if (shell?.type === "asset") this.emitFile({ type: "asset", fileName: "offline.html", source: shell.source });
    },
  }],
  define: {
    __APP_VERSION__: JSON.stringify(webPkg.version),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15000,
    exclude: ["e2e/**", "node_modules/**"],
  },
});
