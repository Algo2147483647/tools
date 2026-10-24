import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

const schemaJsonModule = /[\\/]schema[\\/](?:appearanceDefinition|chartDefaults|presetManifest)\.ts$/;
const browserJsonImport = (source: string) => source.replace(/\s+with\s*\{\s*type:\s*"json"\s*\}/g, "");

export default defineConfig({
  plugins: [
    {
      name: "schema-json-import",
      enforce: "pre",
      transform(source, id) {
        if (!schemaJsonModule.test(id)) return;
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
          name: "schema-json-import",
          setup(build) {
            // Dependency scanning runs before Vite's transform plugins.
            build.onLoad({ filter: schemaJsonModule }, async ({ path }) => ({
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
