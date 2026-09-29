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
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
function browserStorage(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
export function readRecentMetadata(storage: StorageLike | null = browserStorage()): RecentLocation[] {
  try {
    const items: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(items)) return [];
    return items.filter(item => item && typeof item.id === "string" && ["file","workspace"].includes(item.kind) && typeof item.name === "string" && typeof item.location === "string" && Number.isFinite(item.openedAt))
      .map(({id,kind,name,location,openedAt,lastGraph,exampleId}) => ({id,kind,name,location,openedAt,lastGraph: typeof lastGraph === "string" ? lastGraph : undefined,exampleId: isExampleId(exampleId) ? exampleId : undefined,canReopen: isExampleId(exampleId)}))
      .sort((a,b) => b.openedAt-a.openedAt).slice(0,LIMIT);
  } catch { return []; }
}
function saveMetadata(items: RecentLocation[]) {
  try { browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(items.map(({handle: _handle,...item}) => item))); } catch { /* Opening files still works without browser storage. */ }
}
export function rankRecentLocations(items: RecentLocation[], incoming: RecentLocation): RecentLocation[] {
  return [incoming, ...items.filter(item => item.id !== incoming.id)].sort((a,b) => b.openedAt-a.openedAt).slice(0,LIMIT);
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Recent locations cannot be stored in this browser.")); return; }
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:"id"});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function storeRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore)=>IDBRequest<T>): Promise<T> {
  const db=await database();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const transaction=db.transaction(STORE,mode);
      const request=operation(transaction.objectStore(STORE));
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error || new Error("Recent location storage was aborted."));
      transaction.onerror=()=>reject(transaction.error);
      request.onerror=()=>reject(request.error);
    });
  } finally { db.close(); }
}
export async function loadRecentLocations(): Promise<RecentLocation[]> {
  const metadata=readRecentMetadata();
  try {
    const stored=await storeRequest("readonly",store=>store.getAll()) as RecentLocation[];
    const byId=new Map(stored.map(item=>[item.id,item]));
    return metadata.map(item=>{
      const handle=byId.get(item.id)?.handle;
      return {...item,handle,canReopen:Boolean(handle || item.exampleId)};
    });
  } catch { return metadata; }
}
export async function rememberLocation(input: Omit<RecentLocation,"id"|"openedAt"|"canReopen"> & {id?:string}): Promise<RecentLocation[]> {
  const current=await loadRecentLocations();
  let id=input.id;
  if (!id && input.handle) {
    const handle=input.handle as FileSystemHandle;
    for(const item of current) {
      if (item.kind!==input.kind || !item.handle || !handle.isSameEntry) continue;
      try { if(await handle.isSameEntry(item.handle as FileSystemHandle)){id=item.id;break;} } catch { /* A removed location is kept as an unavailable recent item. */ }
    }
  }
  const next:RecentLocation={...input,id:id || (input.exampleId ? `example:${input.exampleId}` : crypto.randomUUID()),openedAt:Date.now(),canReopen:Boolean(input.handle || input.exampleId)};
  try { await storeRequest("readwrite",store=>store.put(next)); }
  catch { next.canReopen=Boolean(input.exampleId); delete next.handle; }
  const result=rankRecentLocations(current,next);
  saveMetadata(result);
  const retained=new Set(result.map(item=>item.id));
  for(const item of current) if(!retained.has(item.id)) await storeRequest("readwrite",store=>store.delete(item.id)).catch(()=>{});
  return result;
}
export async function forgetRecentLocation(id: string): Promise<RecentLocation[]> {
  const current=(await loadRecentLocations()).filter(item=>item.id!==id);
  await storeRequest("readwrite",store=>store.delete(id)).catch(()=>{});
  saveMetadata(current);
  return current;
}
