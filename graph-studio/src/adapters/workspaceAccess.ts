import { resolveWorkspacePath } from "../workspace/paths";
import type { WorkspaceFile, WorkspaceFolder } from "../workspace/types";

const IGNORED = new Set(["node_modules", "dist", "build", "coverage", "vendor", ".git", ".hg", ".svn"]);
const MAX_FILES = 20000;
function isIgnoredWorkspacePath(path: string): boolean {
  return path
    .split("/")
    .slice(0, -1)
    .some((part) => IGNORED.has(part) || part.startsWith("."));
}
export async function readWorkspaceDirectory(handle: FileSystemDirectoryHandle): Promise<WorkspaceFolder> {
  const files = new Map<string, WorkspaceFile>();
  async function walk(directory: FileSystemDirectoryHandle, prefix = "", depth = 0) {
    if (depth > 32) throw new Error("Workspace directory nesting exceeds 32 levels.");
    if (!directory.entries) throw new Error("Directory enumeration is unavailable in this browser.");
    for await (const [name, item] of directory.entries()) {
      const path = prefix + name;
      if (item.kind === "directory" || "entries" in item) {
        if (!IGNORED.has(name) && !name.startsWith("."))
          await walk(item as FileSystemDirectoryHandle, path + "/", depth + 1);
      } else {
        if (files.size >= MAX_FILES)
          throw new Error("This workspace contains more than 20,000 files. Open a smaller folder.");
        files.set(path, { path, handle: item as FileSystemFileHandle });
      }
    }
  }
  await walk(handle);
  return { name: handle.name, handle, files };
}
export function workspaceFromFiles(files: File[]): WorkspaceFolder {
  if (!files.length) throw new Error("The selected folder is empty.");
  const firstPath = files[0].webkitRelativePath;
  if (!firstPath?.includes("/")) throw new Error("Choose a folder with Open workspace.");
  const name = firstPath.split("/")[0];
  const entries = new Map<string, WorkspaceFile>();
  for (const file of files) {
    const relative = file.webkitRelativePath;
    if (!relative.startsWith(name + "/")) throw new Error("All files must belong to the same workspace.");
    const path = resolveWorkspacePath(relative.slice(name.length + 1));
    if (isIgnoredWorkspacePath(path)) continue;
    if (entries.size >= MAX_FILES) throw new Error("This workspace contains more than 20,000 files.");
    if (entries.has(path)) throw new Error(`Duplicate workspace path: ${path}`);
    entries.set(path, { path, file, handle: null });
  }
  return { name, handle: null, files: entries };
}
export async function requestReadAccess(handle: FileSystemFileHandle | FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: "read" })) === "granted") return true;
  return Boolean(handle.requestPermission && (await handle.requestPermission({ mode: "read" })) === "granted");
}
