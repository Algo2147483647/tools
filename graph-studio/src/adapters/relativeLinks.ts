const RELATIVE_LINK_DB_NAME = "graph-studio-relative-link-root";
const RELATIVE_LINK_DB_VERSION = 1;
const RELATIVE_LINK_STORE = "roots";
const RELATIVE_LINK_KEY = "latest";
const RELATIVE_LINK_METADATA_KEY = "graph-studio:relative-link-root";

export interface RelativeLinkRoot {
  name: string;
  handle: FileSystemDirectoryHandle | null;
}

export interface RelativeLinkMetadata {
  name: string;
  savedAt: number;
  canAutoLoad: boolean;
}

export interface ResolvedRelativeFile {
  originalUrl: string;
  path: string;
  file: File;
  url: string;
  previewKind: FilePreviewKind;
}

export type FilePreviewKind = "markdown" | "html" | "image" | "text" | "unsupported";

type RelativeLinkRootRecord = {
  key: typeof RELATIVE_LINK_KEY;
  name: string;
  handle: FileSystemDirectoryHandle;
  savedAt: number;
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export async function openRelativeLinkRootDirectory(): Promise<RelativeLinkRoot | null> {
  if (typeof window.showDirectoryPicker !== "function") {
    return null;
  }
  const handle = await window.showDirectoryPicker({ mode: "read" });
  return { name: handle.name || "selected-folder", handle };
}

export async function saveRelativeLinkRoot(root: RelativeLinkRoot): Promise<void> {
  const savedAt = Date.now();
  if (root.handle) {
    await putRelativeLinkRootRecord({
      key: RELATIVE_LINK_KEY,
      name: root.name,
      handle: root.handle,
      savedAt,
    });
    saveRelativeLinkMetadata({
      name: root.name,
      savedAt,
      canAutoLoad: true,
    });
    return;
  }

  await clearRelativeLinkRootRecord();
  saveRelativeLinkMetadata({
    name: root.name,
    savedAt,
    canAutoLoad: false,
  });
}

export function loadRelativeLinkMetadata(storage: StorageLike | null = getBrowserStorage()): RelativeLinkMetadata | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(RELATIVE_LINK_METADATA_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RelativeLinkMetadata> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.name !== "string") {
      return null;
    }
    return {
      name: parsed.name,
      savedAt: typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
      canAutoLoad: parsed.canAutoLoad === true,
    };
  } catch {
    return null;
  }
}

export async function loadRelativeLinkRoot(): Promise<RelativeLinkRoot | null> {
  const record = await getRelativeLinkRootRecord();
  if (!record) {
    return null;
  }
  const permission = await ensureReadPermission(record.handle);
  if (!permission) {
    return null;
  }
  return {
    name: record.name,
    handle: record.handle,
  };
}

export function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)
    || /^(?:mailto|tel|data|blob):/i.test(value);
}

export function isRelativeLink(value: string): boolean {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed)
    && !trimmed.startsWith("#")
    && !trimmed.startsWith("/")
    && !isExternalUrl(trimmed)
    && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

export function resolveRelativePath(value: string): { ok: true; path: string } | { ok: false; message: string } {
  const cleanPath = stripUrlSuffix(String(value || "").trim()).replace(/\\/g, "/");
  if (!cleanPath) {
    return { ok: false, message: "The relative link is empty." };
  }
  if (!isRelativeLink(cleanPath)) {
    return { ok: false, message: `"${value}" is not a relative link.` };
  }

  const segments: string[] = [];
  for (const rawSegment of cleanPath.split("/")) {
    if (!rawSegment || rawSegment === ".") {
      continue;
    }
    if (rawSegment === "..") {
      if (segments.length > 0) {
        segments.pop();
      } else {
        segments.push("..");
      }
      continue;
    }
    segments.push(decodePathSegment(rawSegment));
  }

  if (segments.length === 0) {
    return { ok: false, message: `"${value}" does not point to a file.` };
  }

  return { ok: true, path: segments.join("/") };
}

export async function resolveRelativeFile(
  root: RelativeLinkRoot | null,
  originalUrl: string,
): Promise<{ ok: true; file: ResolvedRelativeFile } | { ok: false; message: string }> {
  const resolved = resolveRelativePath(originalUrl);
  if (!resolved.ok) {
    return { ok: false, message: `Unable to resolve relative path: ${resolved.message}` };
  }
  if (!root?.handle) {
    return {
      ok: false,
      message: `No resolve path has been selected, so the relative link "${originalUrl}" cannot be resolved. Resolved relative path: ${resolved.path}`,
    };
  }

  try {
    const fileHandle = await getFileHandleByPath(root.handle, resolved.path);
    const file = await fileHandle.getFile();
    return {
      ok: true,
      file: {
        originalUrl,
        path: `${root.name}/${resolved.path}`,
        file,
        url: URL.createObjectURL(file),
        previewKind: getFilePreviewKind(file.name, file.type),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: buildResolveErrorMessage(originalUrl, `${root.name}/${resolved.path}`, error),
    };
  }
}

export function getFilePreviewKind(fileName: string, mimeType = ""): FilePreviewKind {
  const name = fileName.toLowerCase();
  if (mimeType.startsWith("image/") || /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(name)) {
    return "image";
  }
  if (/\.md(?:own)?$/i.test(name)) {
    return "markdown";
  }
  if (mimeType === "text/html" || /\.html?$/i.test(name)) {
    return "html";
  }
  if (mimeType.startsWith("text/") || /\.(?:txt|csv|tsv|json|xml|yaml|yml|log|css|js|ts|tsx|jsx)$/i.test(name)) {
    return "text";
  }
  return "unsupported";
}

async function getFileHandleByPath(rootHandle: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemFileHandle> {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("The target path is outside the selected resolve path.");
  }
  let currentDirectory = rootHandle;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLast = index === segments.length - 1;
    if (isLast) {
      if (typeof currentDirectory.getFileHandle !== "function") {
        throw new Error("This browser does not support reading files by path.");
      }
      return currentDirectory.getFileHandle(segment);
    }
    if (typeof currentDirectory.getDirectoryHandle !== "function") {
      throw new Error("This browser does not support reading folders by path.");
    }
    currentDirectory = await currentDirectory.getDirectoryHandle(segment);
  }
  throw new Error("The target path is not a file.");
}

function buildResolveErrorMessage(originalUrl: string, targetPath: string, error: unknown): string {
  const detail = error instanceof DOMException
    ? getDomExceptionMessage(error)
    : error instanceof Error
      ? error.message
      : "The target file cannot be accessed.";
  return `Unable to open relative link "${originalUrl}". Target path: ${targetPath}. ${detail}`;
}

function getDomExceptionMessage(error: DOMException): string {
  if (error.name === "NotFoundError") {
    return "The target file does not exist, or one of its parent folders is missing.";
  }
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Read permission was denied. Choose the resolve path again and grant read access.";
  }
  if (error.name === "TypeMismatchError") {
    return "The target path is not a file.";
  }
  return error.message || "Unable to access the target file.";
}

async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (typeof handle.queryPermission === "function") {
    const permission = await handle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      return true;
    }
  }
  if (typeof handle.requestPermission === "function") {
    const permission = await handle.requestPermission({ mode: "read" });
    return permission === "granted";
  }
  return true;
}

function saveRelativeLinkMetadata(metadata: RelativeLinkMetadata, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(RELATIVE_LINK_METADATA_KEY, JSON.stringify(metadata));
  } catch {
    // Best-effort only.
  }
}

async function putRelativeLinkRootRecord(record: RelativeLinkRootRecord): Promise<void> {
  const db = await openRelativeLinkDatabase();
  await runStoreRequest(db, "readwrite", (store) => store.put(record));
  db.close();
}

async function getRelativeLinkRootRecord(): Promise<RelativeLinkRootRecord | null> {
  const db = await openRelativeLinkDatabase();
  const record = await runStoreRequest(db, "readonly", (store) => store.get(RELATIVE_LINK_KEY));
  db.close();
  return isRelativeLinkRootRecord(record) ? record : null;
}

async function clearRelativeLinkRootRecord(): Promise<void> {
  const db = await openRelativeLinkDatabase();
  await runStoreRequest(db, "readwrite", (store) => store.delete(RELATIVE_LINK_KEY));
  db.close();
}

function openRelativeLinkDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(RELATIVE_LINK_DB_NAME, RELATIVE_LINK_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RELATIVE_LINK_STORE)) {
        db.createObjectStore(RELATIVE_LINK_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open relative link database."));
  });
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RELATIVE_LINK_STORE, mode);
    const request = createRequest(transaction.objectStore(RELATIVE_LINK_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Relative link storage request failed."));
    transaction.onerror = () => reject(transaction.error || new Error("Relative link storage transaction failed."));
  });
}

function isRelativeLinkRootRecord(value: unknown): value is RelativeLinkRootRecord {
  return Boolean(
    value
      && typeof value === "object"
      && (value as Partial<RelativeLinkRootRecord>).key === RELATIVE_LINK_KEY
      && typeof (value as Partial<RelativeLinkRootRecord>).name === "string"
      && isDirectoryHandle((value as Partial<RelativeLinkRootRecord>).handle),
  );
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return Boolean(value && typeof value === "object" && typeof (value as FileSystemDirectoryHandle).getDirectoryHandle === "function");
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

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}
