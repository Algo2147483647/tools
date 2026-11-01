import { normalizeDagInput, validateJsonValue } from "../graph/normalize";
import { isRecord } from "../shared/json";
import { readWorkspaceFile } from "./browserAccess";
import { manifestPath } from "./paths";
import type { GraphWorkspace, WorkspaceFile, WorkspaceFolder, WorkspaceGraph, WorkspaceManifest } from "./types";

export const WORKSPACE_MANIFEST = "graph-studio.workspace.json";
const MAX_JSON_BYTES = 16 * 1024 * 1024;
export async function readGraphFile(entry: WorkspaceFile) {
  const file = await readWorkspaceFile(entry);
  if (file.size > MAX_JSON_BYTES) throw new Error(`${entry.path}: graph JSON exceeds the 16 MB limit.`);
  try {
    return normalizeDagInput(JSON.parse(await file.text()));
  } catch (error) {
    throw new Error(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
export function parseWorkspaceManifest(input: unknown): WorkspaceManifest {
  if (!isRecord(input) || input.format !== "graph-studio-workspace" || input.version !== 1)
    throw new Error("Unsupported workspace manifest. Expected graph-studio-workspace version 1.");
  for (const key of Object.keys(input))
    if (!["format", "version", "name", "graphs", "metadata"].includes(key))
      throw new Error(`Unknown workspace field: ${key}`);
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim()))
    throw new Error("Workspace name must be a non-empty string.");
  if (!Array.isArray(input.graphs)) throw new Error("Workspace graphs must be an array of relative JSON paths.");
  const graphs = input.graphs.map(manifestPath);
  if (new Set(graphs).size !== graphs.length) throw new Error("Workspace graph paths must be unique.");
  if (graphs.includes(WORKSPACE_MANIFEST)) throw new Error("The workspace manifest cannot be listed as a graph.");
  if (input.metadata !== undefined && !isRecord(input.metadata))
    throw new Error("Workspace metadata must be an object.");
  validateJsonValue(input, "/workspace");
  return structuredClone(input) as unknown as WorkspaceManifest;
}
export function chooseWorkspaceGraph(graphs: WorkspaceGraph[], lastPath?: string): string | null {
  const valid = (path?: string) => (path && graphs.some((graph) => graph.path === path && !graph.error) ? path : null);
  if (valid(lastPath)) return lastPath!;
  return valid("graph.json") || (graphs.length === 1 && !graphs[0].error ? graphs[0].path : null);
}
export async function discoverWorkspace(folder: WorkspaceFolder, lastPath?: string): Promise<GraphWorkspace> {
  if (folder.exampleId === "spatial-atlas" && lastPath === "beijing-roads.json") lastPath = "beijing-metro.json";
  const manifestEntry = folder.files.get(WORKSPACE_MANIFEST);
  let manifest: WorkspaceManifest | null = null;
  const notices: string[] = [];
  if (manifestEntry) {
    try {
      const file = await readWorkspaceFile(manifestEntry);
      if (file.size > MAX_JSON_BYTES) throw new Error("Workspace manifest exceeds the 16 MB limit.");
      manifest = parseWorkspaceManifest(JSON.parse(await file.text()));
    } catch (error) {
      notices.push(`Workspace configuration ignored: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const graphs: WorkspaceGraph[] = [];
  let skipped = 0;
  const detected = [...folder.files.keys()]
    .filter((path) => /\.json$/i.test(path) && path !== WORKSPACE_MANIFEST && !/\.(?:layout|style)\.json$/i.test(path))
    .sort();
  const paths = [...new Set([...(manifest?.graphs || []), ...detected])];
  for (const path of paths) {
    const entry = folder.files.get(path)!;
    const expected = Boolean(manifest?.graphs.includes(path)) || path === "graph.json" || /\.graph\.json$/i.test(path);
    try {
      if (!entry) throw new Error(`Workspace graph is missing: ${path}`);
      const file = await readWorkspaceFile(entry);
      if (file.size > MAX_JSON_BYTES) {
        if (expected) throw new Error("Graph JSON exceeds the 16 MB limit.");
        skipped++;
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        if (expected) throw new Error("Invalid JSON.");
        skipped++;
        continue;
      }
      if (!expected && (!isRecord(payload) || payload.format !== "graph-studio")) {
        skipped++;
        continue;
      }
      const dag = normalizeDagInput(payload);
      graphs.push({
        path,
        title: dag.title || path.split("/").pop()!,
        nodeCount: Object.keys(dag.nodes).length,
        edgeCount: dag.edges.length,
      });
    } catch (error) {
      graphs.push({
        path,
        title: path.split("/").pop()!,
        nodeCount: 0,
        edgeCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (skipped) notices.push(`${skipped} unrelated or unreadable JSON file(s) excluded from graph discovery.`);
  if (!manifest) notices.push("Graphs detected automatically. Workspace configuration is optional.");
  return {
    ...folder,
    rootName: folder.name,
    name: manifest?.name || folder.name,
    manifest,
    graphs,
    notices,
    activePath: chooseWorkspaceGraph(graphs, lastPath),
  };
}
export function createWorkspaceManifest(workspace: GraphWorkspace): WorkspaceManifest {
  const graphs = workspace.graphs.map((graph) => graph.path);
  return {
    ...workspace.manifest,
    format: "graph-studio-workspace",
    version: 1,
    name: workspace.name,
    graphs,
  };
}
