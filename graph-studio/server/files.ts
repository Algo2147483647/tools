import { createHash, randomUUID } from "node:crypto";
import { open, readFile, realpath, rename, unlink, link, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const revision = (bytes: Buffer | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

export function relativeFilePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    /[\\:\x00-\x1f]/.test(value) ||
    isAbsolute(value) ||
    value.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new ServiceError("INVALID_PATH", "Expected a canonical workspace-relative path.");
  return value;
}
export function within(root: string, path: string): string {
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel))
    throw new ServiceError("PATH_OUTSIDE_WORKSPACE", "The file is outside the opened workspace.", 403);
  return path;
}
export async function targetPath(root: string, path: string, allowMissing = false) {
  const target = within(root, resolve(root, relativeFilePath(path)));
  // Check the real parent, including junctions, even for a file that does not yet exist.
  within(root, await realpath(dirname(target)));
  try {
    return within(root, await realpath(target));
  } catch (error: any) {
    if (allowMissing && error.code === "ENOENT") return target;
    throw error;
  }
}
export async function readBytes(path: string) {
  if ((await stat(path)).size > MAX_FILE_BYTES)
    throw new ServiceError("FILE_TOO_LARGE", "File exceeds the 32 MB limit.", 413);
  const bytes = await readFile(path);
  if (bytes.length > MAX_FILE_BYTES) throw new ServiceError("FILE_TOO_LARGE", "File exceeds the 32 MB limit.", 413);
  return bytes;
}
export async function atomicWrite(path: string, bytes: string | Buffer, createOnly = false) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const mode = await stat(path)
      .then((s) => s.mode)
      .catch(() => 0o600);
    const handle = await open(temporary, "wx", mode);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (createOnly)
      await link(temporary, path); // Atomic no-replace publication.
    else await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.catch(() => {});
    return next;
  };
}
