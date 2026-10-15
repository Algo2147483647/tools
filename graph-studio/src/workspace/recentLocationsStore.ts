import { hydrateRecentLocations, rankRecentLocations, type LocationInput, type RecentLocation } from "./locations";
import { resolveLocationIdentity } from "./locationIdentity";

export interface RecentLocationPorts {
  readMetadata(): RecentLocation[];
  writeMetadata(items: RecentLocation[]): void;
  readIdentities(): Promise<RecentLocation[]>;
  writeIdentity(item: RecentLocation): Promise<void>;
}

// Identity catalog and recent list have independent lifetimes. In-memory
// mutations are synchronous; optional persistence never owns the UI lock.
export function createRecentLocationsStore(ports: RecentLocationPorts) {
  let items = ports.readMetadata();
  const identities = new Map(items.map((item) => [item.id, item]));
  const listeners = new Set<() => void>();
  let hydration: Promise<void> | undefined;
  const publish = () => listeners.forEach((listener) => listener());
  function hydrate() {
    return (hydration ??= ports
      .readIdentities()
      .then((stored) => {
        for (const item of stored) if (!identities.get(item.id)?.handle) identities.set(item.id, item);
        // Read the current list, so delayed hydration cannot resurrect removals.
        items = hydrateRecentLocations(items, [...identities.values()]);
        publish();
      })
      .catch(() => {}));
  }
  function remember(input: LocationInput & { id: string }) {
    const next: RecentLocation = {
      ...input,
      openedAt: Date.now(),
      canReopen: Boolean(input.handle || input.exampleId),
    };
    identities.set(next.id, next);
    items = rankRecentLocations(items, next);
    ports.writeMetadata(items);
    publish();
    if (next.handle) void ports.writeIdentity(next).catch(() => {});
  }
  return {
    getSnapshot: () => items,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate,
    async identify(input: LocationInput) {
      if (input.handle) await hydrate();
      return resolveLocationIdentity(input, [...identities.values()]);
    },
    remember,
    remove(id: string | string[]) {
      const removed = new Set(typeof id === "string" ? [id] : id);
      items = items.filter((item) => !removed.has(item.id));
      ports.writeMetadata(items);
      publish();
    },
  };
}
