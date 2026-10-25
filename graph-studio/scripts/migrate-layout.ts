import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve, relative, basename } from "node:path";
import { migrateLegacyLayout } from "../src/schema/layoutMigration";

const [input, requestedOutput] = process.argv.slice(2);
if (!input) throw new Error("Usage: migrate-layout.ts graph.json [graph.migrated.json]");
const source = resolve(input);
const output = requestedOutput
  ? resolve(requestedOutput)
  : resolve(dirname(source), basename(source, ".json") + ".migrated.json");
if (dirname(output) !== dirname(source) || output === source || !output.endsWith(".json"))
  throw new Error("Choose a new JSON filename beside the source to preserve relative links.");
const layoutPath = output.slice(0, -5) + ".layout.json";
const result = migrateLegacyLayout(
  JSON.parse(await readFile(source, "utf8")),
  relative(dirname(output), layoutPath).replace(/\\/g, "/"),
);
await writeFile(layoutPath, JSON.stringify(result.layout, null, 2) + "\n", { flag: "wx" });
try {
  await writeFile(output, JSON.stringify(result.graph, null, 2) + "\n", { flag: "wx" });
} catch (error) {
  await unlink(layoutPath);
  throw error;
}
console.log(`Created ${output} and ${layoutPath}. Source unchanged; geometry and pins discarded.`);
