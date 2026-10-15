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
