import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  banner: {
    // Ensure the CLI entry has a shebang
    js: "#!/usr/bin/env node\n",
  },
  external: ["playwright", "vite"],
});
