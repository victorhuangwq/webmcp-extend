import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Vite config for bundling Chrome Extension content scripts and background worker.
 * Used by `webmcp-extend build` to bundle a generated extension directory.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, "extension-template/background.ts"),
        "content-script": resolve(__dirname, "extension-template/content-script.ts"),
        "injector-main-world": resolve(__dirname, "extension-template/injector-main-world.ts"),
        "nudge-banner": resolve(__dirname, "extension-template/nudge-banner.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
      },
    },
    outDir: "dist-extension",
    emptyOutDir: true,
    target: "chrome120",
    minify: false,
  },
});
