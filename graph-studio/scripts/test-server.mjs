import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildServer } from "./build-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const checked = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "server/tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
});
if (checked.error) throw checked.error;
if (checked.status !== 0) process.exit(checked.status ?? 1);
const output = await buildServer(root, "server/test/service.test.ts", ".server/service.test.mjs");
const result = spawnSync(process.execPath, ["--test", output], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
