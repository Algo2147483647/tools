import { styleFilesMiddleware } from "./scripts/style-files";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

const schemaJsonModule = /[\\/]schema[\\/](?:appearance|document)[\\/][^\\/]+\.ts$/;
const browserJsonImport = (source: string) => source.replace(/\s+with\s*\{\s*type:\s*"json"\s*\}/g, "");

function schemaJsonPlugin(): Plugin {
  return {
    name: "schema-json-import",
    enforce: "pre",
    transform(source, id) {
      if (!schemaJsonModule.test(id)) return;
      // Node requires JSON import attributes; Vite 4's esbuild predates that syntax.
      // Vite already handles JSON modules, so it only needs the bare import.
      return { code: browserJsonImport(source), map: null };
    },
  };
}

function localStyleFiles(): Plugin {
  let root = "";
  let publicDir = "";
  let outputDir = "";
  return {
    name: "local-style-files",
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
      outputDir = resolve(root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(
        styleFilesMiddleware(resolve(publicDir, "examples"), resolve(root, "src/schema/appearance/definition.json")),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        styleFilesMiddleware(resolve(outputDir, "examples"), resolve(root, "src/schema/appearance/definition.json")),
      );
    },
  };
}

export default defineConfig({
  worker: { plugins: [schemaJsonPlugin()] },
  plugins: [schemaJsonPlugin(), react(), localStyleFiles()],
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
