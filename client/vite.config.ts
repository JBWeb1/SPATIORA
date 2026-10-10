import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const rootPkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf8")) as { version: string };
const BUILD_ID = `${rootPkg.version}-${Date.now().toString(36)}`;

/**
 * Self-update support: stamps every build with an id, writes /version.json (polled by
 * open browsers to detect new releases) and emits a service worker whose cache is keyed
 * to the build, so installing a new release cleanly replaces the old one.
 */
function selfUpdate(): Plugin {
  return {
    name: "vistora-self-update",
    apply: "build",
    generateBundle(_opts, bundle) {
      const assets = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f) && !f.includes("StudioTab")).map((f) => `/${f}`);
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: rootPkg.version, build: BUILD_ID, builtAt: new Date().toISOString() }) });
      const sw = fs.readFileSync(path.resolve(import.meta.dirname, "src/sw-template.js"), "utf8")
        .replace("__BUILD_ID__", BUILD_ID)
        .replace("__PRECACHE__", JSON.stringify(["/", "/manifest.webmanifest", "/brand/vistora-logo-256.webp", ...assets]));
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
    },
  };
}

export default defineConfig({
  plugins: [react(), selfUpdate()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __APP_BUILD__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
