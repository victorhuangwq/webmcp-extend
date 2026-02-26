import { defineConfig } from "vite";
import { resolve } from "node:path";

// Chrome extension content scripts and service workers can't use ES module imports,
// so we build each entry as a separate IIFE with all dependencies inlined.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        "content-script": resolve(__dirname, "src/content-script.ts"),
        "nudge-banner": resolve(__dirname, "src/nudge-banner.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
        // Prevent code splitting — inline everything into each entry
        manualChunks: () => undefined,
      },
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    minify: false,
    // Ensure all imports are bundled, not externalized
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
