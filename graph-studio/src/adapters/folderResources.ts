import type { PickedJsonCollection, PickedJsonFile } from "./fileAccess";

export interface ImportedFolderResources {
  name: string;
  filesByPath: Map<string, PickedJsonFile>;
}

export type FolderResourceOpenResult =
  | { ok: true; path: string; url: string; file: File }
  | { ok: false; message: string };

export function createImportedFolderResources(collection: PickedJsonCollection): ImportedFolderResources {
  const filesByPath = new Map<string, PickedJsonFile>();
  collection.files.forEach((file) => {
    const normalizedPath = normalizeFolderResourcePath(file.path || file.file.name);
    if (normalizedPath) {
      filesByPath.set(normalizedPath, file);
    }
  });

  return {
    name: collection.name,
    filesByPath,
  };
}

export function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)
    || /^(?:mailto|tel|data|blob):/i.test(value);
}

export function isFolderRelativeUrl(value: string): boolean {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed)
    && !trimmed.startsWith("#")
    && !trimmed.startsWith("/")
    && !isExternalUrl(trimmed)
    && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

export function resolveFolderResourcePath(value: string): { ok: true; path: string } | { ok: false; message: string } {
  const cleanPath = stripUrlSuffix(String(value || "").trim()).replace(/\\/g, "/");
  if (!cleanPath) {
    return { ok: false, message: "The relative link path is empty." };
  }
  if (!isFolderRelativeUrl(cleanPath)) {
    return { ok: false, message: `The link "${value}" is not a folder-relative path.` };
  }

  const segments: string[] = [];
  for (const rawSegment of cleanPath.split("/")) {
    if (!rawSegment || rawSegment === ".") {
      continue;
    }
    if (rawSegment === "..") {
      if (segments.length === 0) {
        return { ok: false, message: `The link "${value}" points outside the imported folder.` };
      }
      segments.pop();
      continue;
    }
    segments.push(decodePathSegment(rawSegment));
  }

  if (segments.length === 0) {
    return { ok: false, message: `The link "${value}" does not point to a file.` };
  }

  return { ok: true, path: segments.join("/") };
}

export function getFolderResource(resources: ImportedFolderResources | null, value: string): PickedJsonFile | null {
  if (!resources) {
    return null;
  }
  const resolved = resolveFolderResourcePath(value);
  if (!resolved.ok) {
    return null;
  }
  return resources.filesByPath.get(resolved.path) || null;
}

export function openFolderResource(resources: ImportedFolderResources | null, value: string): FolderResourceOpenResult {
  const resolved = resolveFolderResourcePath(value);
  if (!resolved.ok) {
    return resolved;
  }
  if (!resources) {
    return { ok: false, message: "No imported folder is available for resolving relative links." };
  }

  const resource = resources.filesByPath.get(resolved.path);
  if (!resource) {
    return { ok: false, message: `File not found in imported folder: ${resolved.path}` };
  }

  return {
    ok: true,
    path: resolved.path,
    url: URL.createObjectURL(resource.file),
    file: resource.file,
  };
}

function normalizeFolderResourcePath(value: string): string {
  const resolved = resolveFolderResourcePath(value);
  return resolved.ok ? resolved.path : "";
}

function stripUrlSuffix(value: string): string {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const suffixIndexes = [queryIndex, hashIndex].filter((index) => index >= 0);
  if (suffixIndexes.length === 0) {
    return value;
  }
  return value.slice(0, Math.min(...suffixIndexes));
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
