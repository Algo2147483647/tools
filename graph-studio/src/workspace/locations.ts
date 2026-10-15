import { EXAMPLE_WORKSPACES, isExampleId } from "./examples";

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
export type LocationInput = Omit<RecentLocation, "id" | "openedAt" | "canReopen"> & { id?: string };
export const RECENT_LIMIT = 20;

export function parseRecentMetadata(value: string | null): RecentLocation[] {
  try {
    const items: unknown = JSON.parse(value || "[]");
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
      .map(({ id, kind, name, location, openedAt, lastGraph, exampleId }) => {
        const legacyEurope = exampleId === "europe-history";
        const canonicalId = legacyEurope ? "china-history" : exampleId;
        const example = EXAMPLE_WORKSPACES.find((entry) => entry.id === canonicalId);
        const renamedHistory = canonicalId === "china-history" || canonicalId === "space-history";
        return {
          id: legacyEurope ? "example:china-history" : id,
          kind,
          name: renamedHistory ? (example?.title ?? name) : name,
          location,
          openedAt,
          lastGraph: legacyEurope
            ? "europe/europe-history.json"
            : typeof lastGraph === "string"
              ? lastGraph
              : undefined,
          exampleId: isExampleId(canonicalId) ? canonicalId : undefined,
          canReopen: isExampleId(canonicalId),
        };
      })
      .sort((a, b) => b.openedAt - a.openedAt)
      .filter(
        (item, index, all) =>
          item.exampleId !== "china-history" || all.findIndex((other) => other.exampleId === item.exampleId) === index,
      )
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rankRecentLocations(items: RecentLocation[], incoming: RecentLocation): RecentLocation[] {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, RECENT_LIMIT);
}

export function hydrateRecentLocations(items: RecentLocation[], identities: RecentLocation[]): RecentLocation[] {
  const handles = new Map(identities.map((item) => [item.id, item.handle]));
  return items.map((item) => {
    const handle = item.handle || handles.get(item.id);
    return { ...item, handle, canReopen: Boolean(handle || item.exampleId) };
  });
}
