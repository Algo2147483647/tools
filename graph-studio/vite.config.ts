import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

const jsonImportModule =
  /[\\/](?:schema[\\/](?:appearance|document)[\\/][^\\/]+|components[\\/]settings[\\/]previewModel)\.ts$/;
const browserJsonImport = (source: string) => source.replace(/\s+with\s*\{\s*type:\s*"json"\s*\}/g, "");

function jsonImportPlugin(): Plugin {
  return {
    name: "node-json-import",
    enforce: "pre",
    transform(source, id) {
      if (!jsonImportModule.test(id)) return;
      // Node requires JSON import attributes; Vite 4's esbuild predates that syntax.
      // Vite already handles JSON modules, so it only needs the bare import.
      return { code: browserJsonImport(source), map: null };
    },
  };
}

export default defineConfig({
  worker: { plugins: [jsonImportPlugin()] },
  plugins: [jsonImportPlugin(), react()],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "node-json-import",
          setup(build) {
            // Dependency scanning runs before Vite's transform plugins.
            build.onLoad({ filter: jsonImportModule }, async ({ path }) => ({
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
