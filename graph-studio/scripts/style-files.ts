import { parseLayoutConfigFile } from "../src/schema/layoutConfig";
import { readFile, realpath, writeFile, rename, unlink } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute, basename } from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveDefinition, type AppearanceFieldDefinition } from "../src/schema/definition";

function within(root: string, path: string) {
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel))
    throw new Error("Path leaves the workspace.");
  return path;
}
async function existing(root: string, path: string) {
  return within(root, await realpath(within(root, resolve(root, path))));
}
function jsonPath(path: unknown): asserts path is string {
  if (typeof path !== "string" || !path || /[\\:?#\x00-\x1f]/.test(path) || isAbsolute(path) || !path.endsWith(".json"))
    throw new Error("Expected a relative JSON path.");
}

export async function saveExampleStyle(
  examplesRoot: string,
  schemaPath: string,
  input: any,
  kind: "style" | "layout" = "style",
) {
  if (!input || typeof input.exampleId !== "string" || !/^[a-z0-9-]+$/.test(input.exampleId))
    throw new Error("Invalid example workspace.");
  const root = await realpath(examplesRoot);
  const folder = await existing(root, input.exampleId);
  const manifest = JSON.parse(await readFile(await existing(folder, "graph-studio.workspace.json"), "utf8"));
  jsonPath(input.graphPath);
  if (!Array.isArray(manifest.graphs) || !manifest.graphs.includes(input.graphPath))
    throw new Error("Graph is not part of this workspace.");
  const graph = await existing(folder, input.graphPath);
  const document = input.document;
  let normalized: any;
  if (kind === "layout") {
    normalized = parseLayoutConfigFile(document);
  } else {
    if (
      !document ||
      document.format !== "graph-studio-style" ||
      document.version !== 1 ||
      !["node-link", "compound", "timeline", "sankey", "spatial"].includes(document.chartType) ||
      Object.keys(document).some((key) => !["format", "version", "chartType", "style"].includes(key))
    )
      throw new Error("Invalid Appearance Schema document.");
    const definitions = JSON.parse(await readFile(schemaPath, "utf8"));
    const definition: AppearanceFieldDefinition = {
      kind: "object",
      required: true,
      properties: {
        ...definitions.options.properties,
        appearance: definitions.appearance,
        ...(document.chartType === "timeline" ? { timeline: definitions.timeline } : {}),
      },
    };
    normalized = { ...document, style: resolveDefinition(definition, document.style, "style") };
  }
  let reference = input.reference;
  if (reference !== undefined) jsonPath(reference);
  else reference = `${basename(graph).replace(/\.json$/, "")}.${document.chartType}.${kind}.json`;
  const target = within(folder, resolve(dirname(graph), reference));
  await existing(folder, relative(folder, dirname(target)));
  if (
    target === graph ||
    basename(target) === "graph-studio.workspace.json" ||
    manifest.graphs.some((path: string) => resolve(folder, path) === target)
  )
    throw new Error("Style target must be separate from graph data.");
  let found = false;
  try {
    const actual = await existing(folder, relative(folder, target));
    found = true;
    const previous = JSON.parse(await readFile(actual, "utf8"));
    if (
      !(kind === "layout" ? ["graph-studio-layout", "graph-studio-layout-settings"] : ["graph-studio-style"]).includes(
        previous.format,
      )
    )
      throw new Error(`Target is not a ${kind} file.`);
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  const content = JSON.stringify(normalized, null, 2);
  if (!found) await writeFile(target, content, { flag: "wx" });
  else {
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { flag: "wx" });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  return { reference, path: relative(folder, target).replace(/\\/g, "/"), document: normalized };
}

export function styleFilesMiddleware(examplesRoot: string, schemaPath: string) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const endpoint = request.url?.split("?")[0];
    if (endpoint !== "/__graph-studio/style" && endpoint !== "/__graph-studio/layout") return next();
    const kind = endpoint.endsWith("/layout") ? "layout" : "style";
    response.setHeader("Content-Type", "application/json");
    const fail = (status: number, message: string) => {
      response.statusCode = status;
      response.end(JSON.stringify({ error: message }));
    };
    const address = request.socket.remoteAddress ?? "";
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? "") ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address) ||
      request.headers.origin !== `http://${request.headers.host}` ||
      request.headers["x-graph-studio"] !== `${kind}-update`
    )
      return fail(403, "Local same-origin access required.");
    if (request.method !== "POST" || !request.headers["content-type"]?.startsWith("application/json"))
      return fail(405, "JSON POST required.");
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (kind === "style" && size > 16 * 1024 * 1024) throw new Error("Style file exceeds 16 MB.");
        chunks.push(bytes);
      }
      const result = await saveExampleStyle(
        examplesRoot,
        schemaPath,
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        kind,
      );
      response.end(JSON.stringify(result));
    } catch (error) {
      fail(400, error instanceof Error ? error.message : "Style update failed.");
    }
  };
}
