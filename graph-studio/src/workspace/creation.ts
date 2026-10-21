import { writeJsonToHandle } from "../adapters/fileAccess";
import { createInitialCanvasDag } from "../graph/initialCanvas";
import { serializeDagToJson } from "../state/documentSerialization";
import { parseWorkspaceManifest, WORKSPACE_MANIFEST } from "./discovery";
import type { GraphWorkspace, WorkspaceFile, WorkspaceManifest } from "./types";

export function graphFileName(input: string): string {
  const name = input.trim();
  if (
    !name ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("Enter a valid file name without folders or special characters.");
  const path = /\.json$/i.test(name) ? name : `${name}.json`;
  if (path.toLowerCase() === WORKSPACE_MANIFEST) throw new Error("This name is reserved for the workspace manifest.");
  return path;
}

export function workspaceFolderName(input: string): string {
  const name = input.trim();
  if (
    !name ||
    name.length > 255 ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("Enter a valid workspace name without folders or special characters.");
  return name;
}

/** Create a new child folder; existing folders and files are never reused. */
export async function createLocalWorkspace(parent: FileSystemDirectoryHandle, input: string) {
  const name = workspaceFolderName(input);
  if (!parent.getDirectoryHandle || !parent.entries || !parent.removeEntry)
    throw new Error("This browser does not support creating workspace folders. Use Chrome or Edge.");
  const permission = await parent.queryPermission?.({ mode: "readwrite" });
  if (permission !== "granted") {
    const requested = await parent.requestPermission?.({ mode: "readwrite" });
    if (requested !== "granted" && (permission !== undefined || requested !== undefined))
      throw new Error("Write access was not granted. No workspace was created.");
  }
  for await (const [existing] of parent.entries()) {
    if (existing.toLowerCase() === name.toLowerCase())
      throw new Error(`An item named "${name}" already exists. Choose another workspace name or location.`);
  }
  const directory = await parent.getDirectoryHandle(name, { create: true });
  const createdFiles: string[] = [];
  try {
    if (!directory.entries || !directory.getFileHandle || !directory.removeEntry)
      throw new Error("This browser does not support writing workspace files.");
    // Recheck after creation in case another operation populated the folder.
    for await (const _entry of directory.entries())
      throw new Error(`The folder "${name}" is no longer empty. Choose another workspace name.`);
    const dag = createInitialCanvasDag();
    const manifest: WorkspaceManifest = {
      format: "graph-studio-workspace",
      version: 1,
      name,
      graphs: ["graph.json"],
      defaultGraph: "graph.json",
    };
    const files = new Map<string, WorkspaceFile>();
    for (const [path, content] of [
      ["graph.json", serializeDagToJson(dag)],
      [WORKSPACE_MANIFEST, JSON.stringify(manifest, null, 2)],
    ]) {
      const handle = await directory.getFileHandle(path, { create: true });
      createdFiles.push(path);
      await writeJsonToHandle(handle, content);
      files.set(path, { path, handle });
    }
    return { name, handle: directory, files };
  } catch (error) {
    try {
      for (const path of createdFiles.reverse()) await directory.removeEntry!(path);
      // Non-recursive removal preserves anything added by another application.
      await parent.removeEntry(name);
    } catch {
      throw new Error(
        `Could not finish creating "${name}" or remove the incomplete folder. Check the folder before retrying.`,
      );
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFoundError";
}

export async function createWorkspaceGraph(workspace: GraphWorkspace, input: string) {
  const path = graphFileName(input);
  const directory = workspace.handle;
  if (!directory?.getFileHandle || !directory.removeEntry)
    throw new Error("Open a local folder with folder access to create graph files.");
  if ([...workspace.files.keys()].some((name) => name.toLowerCase() === path.toLowerCase()))
    throw new Error(`A file named "${path}" already exists. Choose another name.`);
  const permission = await directory.queryPermission?.({ mode: "readwrite" });
  if (permission !== "granted" && directory.requestPermission) {
    if ((await directory.requestPermission({ mode: "readwrite" })) !== "granted")
      throw new Error("Write access was not granted. No graph file was created.");
  }
  // Check the directory again: the explorer may be older than the files on disk.
  let existing = false;
  try {
    await directory.getFileHandle(path);
    existing = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (existing) throw new Error(`A file named "${path}" already exists. Choose another name.`);

  let manifestHandle: FileSystemFileHandle | null = null;
  let manifest: WorkspaceManifest | null = null;
  try {
    manifestHandle = await directory.getFileHandle(WORKSPACE_MANIFEST);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (manifestHandle) {
    manifest = parseWorkspaceManifest(JSON.parse(await (await manifestHandle.getFile()).text()));
    manifest = { ...manifest, graphs: [...new Set([...manifest.graphs, path])] };
  }

  const dag = createInitialCanvasDag();
  const handle = await directory.getFileHandle(path, { create: true });
  try {
    await writeJsonToHandle(handle, serializeDagToJson(dag));
    if (manifestHandle) await writeJsonToHandle(manifestHandle, JSON.stringify(manifest, null, 2));
  } catch (error) {
    try {
      await directory.removeEntry(path);
    } catch {
      throw new Error(
        `Could not finish creating "${path}" or remove the incomplete file. Check the folder before retrying.`,
      );
    }
    throw error;
  }
  const entry: WorkspaceFile = { path, handle };
  const files = new Map(workspace.files);
  files.set(path, entry);
  if (manifestHandle) files.set(WORKSPACE_MANIFEST, { path: WORKSPACE_MANIFEST, handle: manifestHandle });
  else files.delete(WORKSPACE_MANIFEST);
  return {
    dag,
    entry,
    workspace: {
      ...workspace,
      files,
      manifest,
      graphs: [
        ...workspace.graphs,
        { path, title: dag.title || path, nodeCount: Object.keys(dag.nodes).length, edgeCount: dag.edges.length },
      ],
      activePath: path,
    },
  };
}
