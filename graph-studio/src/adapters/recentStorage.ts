import { parseRecentMetadata, type RecentLocation } from "../workspace/locations";
import type { RecentLocationPorts } from "../workspace/recentLocationsStore";
const DB_NAME = "graph-studio-open-recent";
// Retain the v1 store: old records also provide stable location identities.
const STORE = "locations";
const STORAGE_KEY = "graph-studio:recent-locations";
const STORAGE_TIMEOUT_MS = 1000;
let pendingWrites: Promise<void> = Promise.resolve();
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
function browserStorage(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
export function readRecentMetadata(storage: StorageLike | null = browserStorage()): RecentLocation[] {
  try { return parseRecentMetadata(storage?.getItem(STORAGE_KEY) ?? null); } catch { return []; }
}
export function writeRecentMetadata(items: RecentLocation[]) {
  try { browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(items.map(({ handle: _handle, ...item }) => item))); }
  catch { /* Recent history is optional. */ }
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

export async function readLocationIdentities(): Promise<RecentLocation[]> {
  try { return await storeRequest("readonly", (store) => store.getAll()); } catch { return []; }
}
export function writeLocationIdentity(item: RecentLocation): Promise<void> {
  pendingWrites = pendingWrites.then(async () => {
    try { await storeRequest("readwrite", (store) => store.put(item)); } catch { /* Keep the live identity. */ }
  });
  return pendingWrites;
}
export const browserRecentLocations: RecentLocationPorts = {
  readMetadata: readRecentMetadata,
  writeMetadata: writeRecentMetadata,
  readIdentities: readLocationIdentities,
  writeIdentity: writeLocationIdentity,
};
