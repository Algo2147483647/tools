import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function buildServer(root, entry = "server/main.ts", outputPath = ".server/main.mjs") {
  const output = resolve(root, outputPath);
  await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    platform: "node",
    mainFields: ["module", "main"],
    format: "esm",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    target: "node22",
    sourcemap: true,
    plugins: [
      {
        name: "json-attributes",
        setup(builder) {
          builder.onLoad({ filter: /[\\/]schema[\\/](?:appearance|document)[\\/][^\\/]+\.ts$/ }, async ({ path }) => ({
            contents: (await readFile(path, "utf8")).replace(/\s+with\s*\{\s*type:\s*"json"\s*\}/g, ""),
            loader: "ts",
          }));
        },
      },
    ],
  });
  return output;
}
