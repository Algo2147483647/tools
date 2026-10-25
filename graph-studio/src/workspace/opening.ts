import { readLinkedLayout } from "./linkedLayout";
import { discoverWorkspace, readGraphFile } from "./discovery";
import { readLinkedStyle } from "./linkedStyle";
import type { LocationInput, RecentLocation } from "./locations";
import type { GraphWorkspace, WorkspaceFile, WorkspaceFolder } from "./types";
export function documentIdentity(locationId: string, graphPath: string): string {
  return JSON.stringify([locationId, graphPath]);
}
export async function prepareWorkspace(folder: WorkspaceFolder, lastGraph?: string) {
  const workspace = await discoverWorkspace(folder, lastGraph);
  const entry = workspace.activePath ? workspace.files.get(workspace.activePath)! : null;
  const dag = entry ? await readGraphFile(entry) : null;
  return {
    workspace,
    entry,
    dag,
    ...(dag && entry
      ? {
          ...(await readLinkedStyle(dag, entry.path, workspace)),
          ...(await readLinkedLayout(dag, entry.path, workspace)),
        }
      : {}),
  };
}
export async function prepareWorkspaceGraph(workspace: GraphWorkspace, path: string) {
  const entry = workspace.files.get(path);
  if (!entry || !workspace.graphs.some((graph) => graph.path === path))
    throw new Error("Graph not found in the current workspace.");
  const dag = await readGraphFile(entry);
  return {
    entry,
    dag,
    ...(await readLinkedStyle(dag, entry.path, workspace)),
    ...(await readLinkedLayout(dag, entry.path, workspace)),
  };
}

type IdentifyLocation = (input: LocationInput) => Promise<string>;
export async function prepareFileLocation(
  entry: WorkspaceFile,
  recentId: string | undefined,
  identify: IdentifyLocation,
) {
  const dag = await readGraphFile(entry);
  const input = {
    id: recentId,
    kind: "file" as const,
    name: entry.path,
    location: entry.path,
    handle: entry.handle || undefined,
  };
  const id = await identify(input);
  return {
    dag,
    input: { ...input, id },
    ...(await readLinkedStyle(dag, entry.path)),
    ...(await readLinkedLayout(dag, entry.path)),
  };
}
export async function prepareWorkspaceLocation(
  folder: WorkspaceFolder,
  recent: RecentLocation | undefined,
  identify: IdentifyLocation,
) {
  const prepared = await prepareWorkspace(folder, recent?.lastGraph);
  const input = {
    id: recent?.id,
    kind: "workspace" as const,
    name: prepared.workspace.name,
    location: folder.handle?.name || folder.name,
    handle: folder.handle || undefined,
    lastGraph: prepared.workspace.activePath || undefined,
    exampleId: folder.exampleId,
  };
  const id = await identify(input);
  return { ...prepared, input: { ...input, id } };
}
