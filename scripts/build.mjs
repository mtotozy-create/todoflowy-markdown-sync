import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "vite";

const pluginRoot = resolve(import.meta.dirname, "..");
const output = resolve(pluginRoot, "dist");
const entries = ["runtime", "task-view", "settings"];

await rm(output, { force: true, recursive: true });

for (const entry of entries) {
  await build({
    build: {
      emptyOutDir: false,
      lib: {
        entry: resolve(pluginRoot, `src/${entry}.ts`),
        fileName: () => `${entry}.js`,
        formats: ["es"],
      },
      minify: false,
      outDir: output,
      rolldownOptions: { output: { codeSplitting: false } },
      sourcemap: false,
      target: "es2022",
    },
    configFile: false,
    logLevel: "silent",
  });
}
