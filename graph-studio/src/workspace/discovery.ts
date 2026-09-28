import { isRecord, normalizeDagInput, validateJsonValue } from "../graph/normalize";
import { manifestPath } from "./paths";
import type { WorkspaceFolder, WorkspaceGraph, WorkspaceManifest, GraphWorkspace, WorkspaceFile } from "./types";

export const WORKSPACE_MANIFEST = "graph-studio.workspace.json";
const MAX_JSON_BYTES = 16 * 1024 * 1024;
export async function readWorkspaceFile(entry: WorkspaceFile): Promise<File> {
  if (entry.handle) return entry.handle.getFile();
  if (entry.file) return entry.file;
  throw new Error(`File unavailable: ${entry.path}`);
}
export async function readGraphFile(entry: WorkspaceFile) {
  const file = await readWorkspaceFile(entry);
  if (file.size > MAX_JSON_BYTES) throw new Error(`${entry.path}: graph JSON exceeds the 16 MB limit.`);
  try { return normalizeDagInput(JSON.parse(await file.text())); }
  catch (error) { throw new Error(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`); }
}
export function parseWorkspaceManifest(input: unknown): WorkspaceManifest {
  if (!isRecord(input) || input.format !== "graph-studio-workspace" || input.version !== 1) throw new Error("Unsupported workspace manifest. Expected graph-studio-workspace version 1.");
  for (const key of Object.keys(input)) if (!["format","version","name","graphs","defaultGraph","metadata"].includes(key)) throw new Error(`Unknown workspace field: ${key}`);
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim())) throw new Error("Workspace name must be a non-empty string.");
  if (!Array.isArray(input.graphs)) throw new Error("Workspace graphs must be an array of relative JSON paths.");
  const graphs = input.graphs.map(manifestPath);
  if (new Set(graphs).size !== graphs.length) throw new Error("Workspace graph paths must be unique.");
  if (graphs.includes(WORKSPACE_MANIFEST)) throw new Error("The workspace manifest cannot be listed as a graph.");
  if (input.defaultGraph !== undefined && !graphs.includes(manifestPath(input.defaultGraph))) throw new Error("defaultGraph must be listed in graphs.");
  if (input.metadata !== undefined && !isRecord(input.metadata)) throw new Error("Workspace metadata must be an object.");
  validateJsonValue(input, "/workspace");
  return structuredClone(input) as unknown as WorkspaceManifest;
}
export function chooseWorkspaceGraph(graphs: WorkspaceGraph[], manifest: WorkspaceManifest | null, lastPath?: string): string | null {
  const valid = (path?: string) => path && graphs.some(graph => graph.path === path && !graph.error) ? path : null;
  if (valid(lastPath)) return lastPath!;
  // An explicit but invalid default must stay visible as an error, not open another graph.
  if (manifest?.defaultGraph) return valid(manifest.defaultGraph);
  return valid("graph.json") || (graphs.length === 1 && !graphs[0].error ? graphs[0].path : null);
}
export async function discoverWorkspace(folder: WorkspaceFolder, lastPath?: string): Promise<GraphWorkspace> {
  const manifestEntry = folder.files.get(WORKSPACE_MANIFEST);
  let manifest: WorkspaceManifest | null = null;
  if (manifestEntry) {
    const file = await readWorkspaceFile(manifestEntry);
    if (file.size > MAX_JSON_BYTES) throw new Error("Workspace manifest exceeds the 16 MB limit.");
    manifest = parseWorkspaceManifest(JSON.parse(await file.text()));
    for (const path of manifest.graphs) if (!folder.files.has(path)) throw new Error(`Workspace graph is missing: ${path}`);
  }
  const graphs: WorkspaceGraph[] = [];
  const notices: string[] = [];
  let skipped = 0;
  const paths = manifest?.graphs ?? [...folder.files.keys()].filter(path => /\.json$/i.test(path) && path !== WORKSPACE_MANIFEST).sort();
  if (!manifest && paths.length > 1000) throw new Error("More than 1,000 JSON files found. Add graph-studio.workspace.json to specify which graphs to load, or open a smaller folder.");
  for (const path of paths) {
    const entry = folder.files.get(path)!;
    const expected = Boolean(manifest) || path === "graph.json" || /\.graph\.json$/i.test(path);
    try {
      const file = await readWorkspaceFile(entry);
      if (file.size > MAX_JSON_BYTES) {
        if (expected) throw new Error("Graph JSON exceeds the 16 MB limit.");
        skipped++; continue;
      }
      let payload: unknown;
      try { payload = JSON.parse(await file.text()); }
      catch { if (expected) throw new Error("Invalid JSON."); skipped++; continue; }
      if (!expected && (!isRecord(payload) || payload.format !== "graph-studio")) { skipped++; continue; }
      const dag = normalizeDagInput(payload);
      graphs.push({ path, title: dag.title || path.split("/").pop()!, nodeCount: Object.keys(dag.nodes).length, edgeCount: dag.edges.length });
    } catch (error) {
      graphs.push({ path, title: path.split("/").pop()!, nodeCount: 0, edgeCount: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (skipped) notices.push(`${skipped} unrelated or unreadable JSON file(s) excluded from graph discovery.`);
  if (!manifest) notices.push("Graphs detected automatically. Add graph-studio.workspace.json to choose the graph list and startup file.");
  return { ...folder, rootName: folder.name, name: manifest?.name || folder.name, manifest, graphs, notices, activePath: chooseWorkspaceGraph(graphs, manifest, lastPath) };
}
export function createWorkspaceManifest(workspace: GraphWorkspace): WorkspaceManifest {
  const graphs = workspace.graphs.map(graph => graph.path);
  const { defaultGraph: previousDefault, ...previous } = workspace.manifest || {};
  const defaultGraph = [workspace.activePath, previousDefault].find(path => path && graphs.includes(path));
  return {
    ...previous,
    format: "graph-studio-workspace", version: 1, name: workspace.name,
    graphs,
    ...(defaultGraph ? { defaultGraph } : {}),
  };
}
