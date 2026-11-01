import { buildServer } from "./build-server.mjs";
import { fileURLToPath } from "node:url";
await buildServer(fileURLToPath(new URL("../", import.meta.url)));
