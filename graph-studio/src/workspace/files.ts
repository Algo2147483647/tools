import type { WorkspaceFile } from "./types";

/** Live handles are read afresh; example assets supply their own immutable download cache. */
export async function readWorkspaceFile(entry: WorkspaceFile): Promise<File> {
  if (entry.handle) return entry.handle.getFile();
  if (entry.file) return entry.file;
  if (entry.loadFile) return entry.loadFile();
  throw new Error(`File unavailable: ${entry.path}`);
}
