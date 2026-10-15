import { isExampleId } from "../workspace/examples";

export interface RecentLocation {
  exampleId?: string;
  id: string;
  kind: "file" | "workspace";
  name: string;
  location: string;
  openedAt: number;
  canReopen: boolean;
  lastGraph?: string;
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}
const DB_NAME = "graph-studio-open-recent";
const STORE = "locations";
const STORAGE_KEY = "graph-studio:recent-locations";
const LIMIT = 20;
const STORAGE_TIMEOUT_MS = 1000;
let pendingWrites: Promise<void> = Promise.resolve();

function queueWrite(operation: () => Promise<void>): Promise<void> {
  const next = pendingWrites.then(operation);
  pendingWrites = next.catch(() => {});
  return pendingWrites;
}
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
export function readRecentMetadata(storage: StorageLike | null = browserStorage()): RecentLocation[] {
  try {
    const items: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          ["file", "workspace"].includes(item.kind) &&
          typeof item.name === "string" &&
          typeof item.location === "string" &&
          Number.isFinite(item.openedAt),
      )
      .map(({ id, kind, name, location, openedAt, lastGraph, exampleId }) => ({
        id,
        kind,
        name,
        location,
        openedAt,
        lastGraph: typeof lastGraph === "string" ? lastGraph : undefined,
        exampleId: isExampleId(exampleId) ? exampleId : undefined,
        canReopen: isExampleId(exampleId),
      }))
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}
function saveMetadata(items: RecentLocation[]) {
  try {
    browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(items.map(({ handle: _handle, ...item }) => item)));
  } catch {
    /* Opening files still works without browser storage. */
  }
}
export function rankRecentLocations(items: RecentLocation[], incoming: RecentLocation): RecentLocation[] {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, LIMIT);
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Recent locations cannot be stored in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const fail = (error: unknown) => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("Recent location storage timed out.")), STORAGE_TIMEOUT_MS);
    request.onblocked = () => fail(new Error("Recent location storage is blocked by another tab."));
    request.onupgradeneeded = () => {
      if (settled) request.transaction?.abort();
      else request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => fail(request.error);
  });
}
async function storeRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      const fail = (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      };
      const timer = setTimeout(() => {
        fail(new Error("Recent location storage timed out."));
        try {
          transaction.abort();
        } catch {
          /* The transaction may already have finished. */
        }
      }, STORAGE_TIMEOUT_MS);
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      transaction.onabort = () => fail(transaction.error || new Error("Recent location storage was aborted."));
      transaction.onerror = () => fail(transaction.error);
      request.onerror = () => fail(request.error);
    });
  } finally {
    db.close();
  }
}
export async function loadRecentLocations(): Promise<RecentLocation[]> {
  const metadata = readRecentMetadata();
  try {
    const stored = (await storeRequest("readonly", (store) => store.getAll())) as RecentLocation[];
    const byId = new Map(stored.map((item) => [item.id, item]));
    return metadata.map((item) => {
      const handle = byId.get(item.id)?.handle;
      return { ...item, handle, canReopen: Boolean(handle || item.exampleId) };
    });
  } catch {
    return metadata;
  }
}
export async function rememberLocation(
  input: Omit<RecentLocation, "id" | "openedAt" | "canReopen"> & { id?: string },
  knownLocations?: RecentLocation[],
): Promise<{ items: RecentLocation[]; id: string }> {
  // Bundled examples have stable IDs and no native handles to persist or compare.
  // Opening them must not wait for IndexedDB (which can be blocked in another tab).
  if (input.exampleId && !input.handle) {
    const next: RecentLocation = {
      ...input,
      id: input.id || `example:${input.exampleId}`,
      openedAt: Date.now(),
      canReopen: true,
    };
    const current = readRecentMetadata().map((item) => {
      const known = knownLocations?.find((location) => location.id === item.id);
      return known?.handle ? { ...item, handle: known.handle, canReopen: true } : item;
    });
    const items = rankRecentLocations(current, next);
    saveMetadata(items);
    return { items, id: next.id };
  }
  // The hook already holds hydrated locations. Do not read IndexedDB again in
  // the critical path for opening a local file or folder.
  const current = knownLocations || (await loadRecentLocations());
  let id = input.id;
  if (!id && input.handle) {
    const handle = input.handle as FileSystemHandle;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const matches = await Promise.race([
        Promise.all(
          current.map(async (item) => {
            if (item.kind !== input.kind || !item.handle || !handle.isSameEntry) return undefined;
            try {
              return (await handle.isSameEntry(item.handle as FileSystemHandle)) ? item.id : undefined;
            } catch {
              return undefined;
            }
          }),
        ),
        new Promise<undefined[]>((resolve) => {
          timer = setTimeout(() => resolve([]), STORAGE_TIMEOUT_MS);
        }),
      ]);
      id = matches.find((match) => match !== undefined);
    } finally {
      clearTimeout(timer);
    }
  }
  const next: RecentLocation = {
    ...input,
    id: id || (input.exampleId ? `example:${input.exampleId}` : crypto.randomUUID()),
    openedAt: Date.now(),
    canReopen: Boolean(input.handle || input.exampleId),
  };
  const result = rankRecentLocations(current, next);
  saveMetadata(result);
  const retained = new Set(result.map((item) => item.id));
  await queueWrite(async () => {
    try {
      await storeRequest("readwrite", (store) => store.put(next));
    } catch {
      // Keep the live handle usable in this session even if persistence failed.
      // readRecentMetadata drops handles and requires reconnection after reload.
    }
    await Promise.all(
      current
        .filter((item) => !retained.has(item.id))
        .map((item) => storeRequest("readwrite", (store) => store.delete(item.id)).catch(() => {})),
    );
  });
  return { items: result, id: next.id };
}
export async function forgetRecentLocation(id: string): Promise<RecentLocation[]> {
  const current = (await loadRecentLocations()).filter((item) => item.id !== id);
  await queueWrite(async () => {
    await storeRequest("readwrite", (store) => store.delete(id)).catch(() => {});
  });
  saveMetadata(current);
  return current;
}
