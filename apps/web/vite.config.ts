import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const webPkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineConfig({
  plugins: [react(), basicSsl(), {
    name: "neutral-offline-shell",
    enforce: "post",
    generateBundle(_options, bundle) {
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
