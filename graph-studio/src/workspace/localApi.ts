import type { GraphWorkspace, WorkspaceFile } from "./types";
import type { RecentLocation } from "./locations";

export interface LocalFileReference {
  locationId: string;
  path: string;
  revision?: string | null;
}
export interface LocalLocation {
  id: string;
  kind: "workspace" | "file";
  name: string;
  location: string;
  lastGraph?: string;
  exampleId?: string;
}
export type WorkspaceSnapshot = LocalLocation & Omit<GraphWorkspace, "files" | "handle"> & { files: string[] };
let session: Promise<string> | undefined;
export class LocalApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function connectLocalService() {
  return (session ||= fetch("/api/v1/session")
    .then(async (response) => {
      if (!response.ok) throw new Error("Graph Studio local service is unavailable. Restart using the launcher.");
      return (await response.json()).token as string;
    })
    .catch((error) => {
      session = undefined;
      throw error;
    }));
}
export async function localRequest(path: string, method = "GET", data?: unknown): Promise<Response> {
  const token = await connectLocalService();
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: { "X-Graph-Studio-Token": token, ...(data !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) {
    if (response.status === 401) session = undefined;
    const result = await response.json().catch(() => null);
    throw new LocalApiError(
      result?.error?.code || "REQUEST_FAILED",
      result?.error?.message || `Local service request failed (${response.status}).`,
      response.status,
    );
  }
  return response;
}
export async function localJson<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  return (await localRequest(path, method, data)).json();
}
export async function chooseLocalPath(kind: "directory" | "file" | "save", name?: string) {
  return (await localJson<{ path: string | null }>(`/dialogs/${kind}`, "POST", { name })).path;
}
export async function readLocalFile(ref: LocalFileReference): Promise<File> {
  const response = await localRequest(`/files/${ref.locationId}/file?path=${encodeURIComponent(ref.path)}`);
  const bytes = await response.arrayBuffer();
  ref.revision = response.headers.get("X-File-Revision");
  return new File([bytes], ref.path.split("/").pop()!, {
    type: response.headers.get("Content-Type") || "application/octet-stream",
  });
}
export function localEntry(locationId: string, path: string): WorkspaceFile {
  const local = { locationId, path };
  return { path, handle: null, local, loadFile: () => readLocalFile(local) };
}
export async function writeLocalFile(ref: LocalFileReference, content: string) {
  if (ref.revision === undefined) throw new Error("Read the file before overwriting it.");
  const result = await localJson<{ revision: string }>(
    `/files/${ref.locationId}/file?path=${encodeURIComponent(ref.path)}`,
    "PUT",
    { content, expectedRevision: ref.revision },
  );
  ref.revision = result.revision;
}
export function workspaceFromSnapshot(snapshot: WorkspaceSnapshot): GraphWorkspace {
  return {
    ...snapshot,
    localId: snapshot.id,
    absolutePath: snapshot.location,
    handle: null,
    files: new Map(snapshot.files.map((path) => [path, localEntry(snapshot.id, path)])),
  };
}
export async function fetchWorkspace(id: string) {
  return workspaceFromSnapshot(await localJson<WorkspaceSnapshot>(`/workspaces/${id}`));
}
export async function openLocalWorkspace(path: string, id?: string) {
  return workspaceFromSnapshot(await localJson<WorkspaceSnapshot>("/workspaces/open", "POST", { path, id }));
}
export async function openLocalFile(path: string, id?: string, saveAs = false) {
  const record = await localJson<LocalLocation>("/files/open", "POST", { path, id, saveAs });
  return { record, entry: localEntry(record.id, record.name) };
}
export async function getLocalRecents() {
  return localJson<RecentLocation[]>("/recents");
}
export function subscribeLocalChanges(
  listener: (event: { locationId?: string; path?: string }) => void,
  locationId?: string,
) {
  let closed = false;
  let events: EventSource | undefined;
  void connectLocalService()
    .then(() => {
      if (closed) return;
      events = new EventSource("/api/v1/events" + (locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""));
      events.addEventListener("ready", () => listener({}));
      events.addEventListener("change", (event) => listener(JSON.parse((event as MessageEvent).data)));
    })
    .catch(() => {});
  return () => {
    closed = true;
    events?.close();
  };
}
