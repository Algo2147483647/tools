import { useEffect, useState, useSyncExternalStore } from "react";
import { browserRecentLocations } from "../adapters/recentStorage";
import { createRecentLocationsStore } from "../workspace/recentLocationsStore";
export function useRecentLocations() {
  const [store] = useState(() => createRecentLocationsStore(browserRecentLocations));
  const recents = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => { void store.hydrate(); }, [store]);
  return { recents, remember: store.remember, remove: store.remove, identify: store.identify };
}
