/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { cpSync } from "node:fs";
import process from "node:process";
import type { Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;

/**
 * foliate-js loads PDF.js's worker, fonts, cmaps and CSS at runtime via
 * `new URL("vendor/pdfjs/…", import.meta.url)`. After bundling, that resolves next to the
 * chunk in dist/assets, so copy the files there. (Dev serves them from vendor/ directly.)
 */
function copyPdfjsAssets(): Plugin {
  return {
    name: "copy-pdfjs-assets",
    apply: "build",
    enforce: "pre",
    // Vite rewrites `new URL(`…${x}`, import.meta.url)` into an import.meta.glob it can't
    // resolve here (and leaves broken in the output). Concatenation is left alone.
    transform(code, id) {
      if (!id.endsWith("/foliate-js/pdf.js")) return;
      const from = "new URL(`vendor/pdfjs/${path}`, import.meta.url)";
      if (!code.includes(from)) this.error("foliate-js pdf.js changed; update copyPdfjsAssets");
      return code.replace(from, 'new URL("vendor/pdfjs/" + path, import.meta.url)');
    },
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
      cpSync(
        fileURLToPath(new URL("./vendor/foliate-js/vendor/pdfjs", import.meta.url)),
        `${outDir}/assets/vendor/pdfjs`,
        {
          recursive: true,
          filter: (src) => !src.endsWith(".map"),
        },
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), copyPdfjsAssets()],

  resolve: {
    alias: {
      "foliate-js": fileURLToPath(new URL("./vendor/foliate-js", import.meta.url)),
    },
  },

  // foliate-js uses top-level await and other modern syntax; both target WebViews support it.
  build: {
    target: "es2022",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    include: ["src/**/*.test.ts"],
  },
}));
