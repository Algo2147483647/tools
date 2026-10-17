import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--cache")) {
  console.error("Usage: npm run clean [-- --cache]");
  process.exit(1);
}

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const targets = ["dist", "test-results", "coverage"];
if (args.includes("--cache")) targets.push(".npm-cache", ".example-source-cache");
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && /\.(log|tsbuildinfo)$/.test(entry.name)) targets.push(entry.name);
}

for (const name of targets) {
  const target = join(root, name);
  if (!existsSync(target)) continue;
  // Reject links/junctions and verify the resolved path before recursive removal.
  if (lstatSync(target).isSymbolicLink() || !realpathSync(target).startsWith(root + sep)) {
    throw new Error(`Refusing to clean a path outside the project: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${name}`);
}
