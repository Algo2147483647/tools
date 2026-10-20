import { discoverWorkspace, readGraphFile } from "./discovery";
import type { GraphWorkspace, WorkspaceFolder } from "./types";
import { readLinkedStyle } from "./linkedStyle";
export function documentIdentity(locationId: string, graphPath: string): string {
  return JSON.stringify([locationId, graphPath]);
}
export async function prepareWorkspace(folder: WorkspaceFolder, lastGraph?: string) {
  const workspace = await discoverWorkspace(folder, lastGraph);
  const entry = workspace.activePath ? workspace.files.get(workspace.activePath)! : null;
  const dag = entry ? await readGraphFile(entry) : null;
  return { workspace, entry, dag, ...(dag && entry ? await readLinkedStyle(dag, entry.path, workspace) : {}) };
}
export async function prepareWorkspaceGraph(workspace: GraphWorkspace, path: string) {
  const entry = workspace.files.get(path);
  if (!entry || !workspace.graphs.some((graph) => graph.path === path))
    throw new Error("Graph not found in the current workspace.");
  const dag = await readGraphFile(entry);
  return { entry, dag, ...(await readLinkedStyle(dag, entry.path, workspace)) };
}
