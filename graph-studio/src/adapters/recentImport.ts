import { createJsonCollectionFromDirectoryHandle, createJsonCollectionFromFileHandles, hasReadPermission, type PickedJsonCollection } from "./fileAccess";

const RECENT_IMPORT_DB_NAME = "graph-studio-recent-import";
const RECENT_IMPORT_DB_VERSION = 1;
const RECENT_IMPORT_STORE = "sources";
const RECENT_IMPORT_SOURCE_KEY = "latest";
const RECENT_IMPORT_METADATA_KEY = "graph-studio:recent-import-metadata";

export interface RecentImportMetadata {
  kind: "files" | "directory" | "path-only";
  name: string;
  paths: string[];
  savedAt: number;
  canAutoLoad: boolean;
}

type RecentImportRecord =
  | {
      key: typeof RECENT_IMPORT_SOURCE_KEY;
      kind: "files";
      name: string;
      handles: FileSystemFileHandle[];
      paths: string[];
      savedAt: number;
    }
  | {
      key: typeof RECENT_IMPORT_SOURCE_KEY;
      kind: "directory";
      name: string;
      handle: FileSystemDirectoryHandle;
      paths: string[];
      savedAt: number;
    };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadRecentImportMetadata(storage: StorageLike | null = getBrowserStorage()): RecentImportMetadata | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(RECENT_IMPORT_METADATA_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RecentImportMetadata> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed.kind !== "files" && parsed.kind !== "directory" && parsed.kind !== "path-only") {
      return null;
    }
    if (typeof parsed.name !== "string" || !Array.isArray(parsed.paths)) {
      return null;
    }
    return {
      kind: parsed.kind,
      name: parsed.name,
      paths: parsed.paths.filter((path): path is string => typeof path === "string"),
      savedAt: typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
      canAutoLoad: parsed.canAutoLoad === true,
    };
  } catch {
    return null;
  }
}

export async function saveRecentFileImport(collection: PickedJsonCollection): Promise<void> {
  const handles = collection.files.map((item) => item.handle).filter(Boolean) as FileSystemFileHandle[];
  const paths = collection.files.map((item) => item.path || item.file.name);
  const savedAt = Date.now();

  if (handles.length === collection.files.length && handles.length > 0) {
    await putRecentImportRecord({
      key: RECENT_IMPORT_SOURCE_KEY,
      kind: "files",
      name: collection.name,
      handles,
      paths,
      savedAt,
    });
    saveRecentImportMetadata({
      kind: "files",
      name: collection.name,
      paths,
      savedAt,
      canAutoLoad: true,
    });
    return;
  }

  await clearRecentImportRecord();
  saveRecentImportMetadata({
    kind: "path-only",
    name: collection.name,
    paths,
    savedAt,
    canAutoLoad: false,
  });
}

export async function saveRecentDirectoryImport(collection: PickedJsonCollection): Promise<void> {
  const paths = collection.files.map((item) => item.path || item.file.name);
  const savedAt = Date.now();

  if (collection.directoryHandle) {
    await putRecentImportRecord({
      key: RECENT_IMPORT_SOURCE_KEY,
      kind: "directory",
      name: collection.name,
      handle: collection.directoryHandle,
      paths,
      savedAt,
    });
    saveRecentImportMetadata({
      kind: "directory",
      name: collection.name,
      paths,
      savedAt,
      canAutoLoad: true,
    });
    return;
  }

  await clearRecentImportRecord();
  saveRecentImportMetadata({
    kind: "path-only",
    name: collection.name,
    paths,
    savedAt,
    canAutoLoad: false,
  });
}

export async function loadRecentJsonCollection(): Promise<PickedJsonCollection | null> {
  const record = await getRecentImportRecord();
  if (!record) {
    return null;
  }

  if (record.kind === "files") {
    const granted = await Promise.all(record.handles.map((handle) => hasReadPermission(handle)));
    if (granted.some((item) => !item)) {
      return null;
    }
    return createJsonCollectionFromFileHandles(record.handles, record.paths, record.name);
  }

  if (!(await hasReadPermission(record.handle))) {
    return null;
  }
  return createJsonCollectionFromDirectoryHandle(record.handle);
}

function saveRecentImportMetadata(metadata: RecentImportMetadata, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(RECENT_IMPORT_METADATA_KEY, JSON.stringify(metadata));
  } catch {
    // Best-effort only; import should continue even when storage is blocked.
  }
}

async function putRecentImportRecord(record: RecentImportRecord): Promise<void> {
  const db = await openRecentImportDatabase();
  await runStoreRequest(db, "readwrite", (store) => store.put(record));
  db.close();
}

async function getRecentImportRecord(): Promise<RecentImportRecord | null> {
  const db = await openRecentImportDatabase();
  const record = await runStoreRequest(db, "readonly", (store) => store.get(RECENT_IMPORT_SOURCE_KEY));
  db.close();
  return isRecentImportRecord(record) ? record : null;
}

async function clearRecentImportRecord(): Promise<void> {
  const db = await openRecentImportDatabase();
  await runStoreRequest(db, "readwrite", (store) => store.delete(RECENT_IMPORT_SOURCE_KEY));
  db.close();
}

function openRecentImportDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(RECENT_IMPORT_DB_NAME, RECENT_IMPORT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECENT_IMPORT_STORE)) {
        db.createObjectStore(RECENT_IMPORT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open recent import database."));
  });
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECENT_IMPORT_STORE, mode);
    const request = createRequest(transaction.objectStore(RECENT_IMPORT_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Recent import storage request failed."));
    transaction.onerror = () => reject(transaction.error || new Error("Recent import storage transaction failed."));
  });
}

function isRecentImportRecord(value: unknown): value is RecentImportRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<RecentImportRecord>;
  if (record.key !== RECENT_IMPORT_SOURCE_KEY) {
    return false;
  }
  if (record.kind === "files") {
    return Array.isArray(record.handles) && record.handles.every(isFileHandle);
  }
  return record.kind === "directory" && isDirectoryHandle(record.handle);
}

function isFileHandle(value: unknown): value is FileSystemFileHandle {
  return Boolean(value && typeof value === "object" && typeof (value as FileSystemFileHandle).getFile === "function");
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return Boolean(value && typeof value === "object" && typeof (value as FileSystemDirectoryHandle).entries === "function");
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}
