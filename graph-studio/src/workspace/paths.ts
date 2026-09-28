// Paths are always relative to the directory the user opened.
export function resolveWorkspacePath(value: string, baseFile = ""): string {
  const raw = value.replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new Error("Use a workspace-relative path.");
  const parts = baseFile ? baseFile.split("/").slice(0, -1) : [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("The link points outside this workspace.");
      parts.pop();
    } else {
      if (/[\u0000-\u001f]/.test(part)) throw new Error("Control characters are not allowed in paths.");
      parts.push(part);
    }
  }
  if (!parts.length) throw new Error("The path does not point to a file.");
  return parts.join("/");
}
export function manifestPath(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || /[?#]/.test(value)) throw new Error("Graph paths must be relative file paths, without URL suffixes.");
  const path = resolveWorkspacePath(value);
  if (path !== value || !/\.json$/i.test(path)) throw new Error(`Use a canonical relative JSON path: ${value}`);
  return path;
}
export function linkPath(value: string, baseFile = ""): string {
  const path = value.trim().split(/[?#]/, 1)[0];
  let decoded: string;
  try { decoded = decodeURIComponent(path); }
  catch { throw new Error("The link contains invalid URL encoding."); }
  return resolveWorkspacePath(decoded, baseFile);
}
