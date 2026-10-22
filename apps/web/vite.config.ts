import { readFileSync } from "node:fs";
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
    exclude: ["e2e/**", "node_modules/**"],
  },
});
