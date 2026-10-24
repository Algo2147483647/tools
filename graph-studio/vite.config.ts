import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

const appearanceDefinitionModule = /[\\/]schema[\\/]appearanceDefinition\.ts$/;
const browserJsonImport = (source: string) => source.replace(' with { type: "json" }', "");

export default defineConfig({
  plugins: [
    {
      name: "appearance-json-import",
      enforce: "pre",
      transform(source, id) {
        if (!appearanceDefinitionModule.test(id)) return;
        // Node requires JSON import attributes; Vite 4's esbuild predates that syntax.
        // Vite already handles JSON modules, so it only needs the bare import.
        return { code: browserJsonImport(source), map: null };
      },
    },
    react(),
  ],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "appearance-json-import",
          setup(build) {
            // Dependency scanning runs before Vite's transform plugins.
            build.onLoad({ filter: appearanceDefinitionModule }, async ({ path }) => ({
              contents: browserJsonImport(await readFile(path, "utf8")),
              loader: "ts",
            }));
          },
        },
      ],
    },
  },
  server: {
    watch: { ignored: ["**/dist/**"] },
  },
});
