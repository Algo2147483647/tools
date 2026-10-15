import { useEffect, useRef, useState } from "react";
import {
  forgetRecentLocation,
  loadRecentLocations,
  readRecentMetadata,
  rememberLocation,
} from "../adapters/recentImport";
export function useRecentLocations() {
  const [recents, setRecents] = useState(readRecentMetadata);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    void loadRecentLocations().then((items) => {
      if (!active) return;
      setRecents((current) => {
        if (revision.current === initialRevision) return items;
        // An example may open before the handle database finishes loading. Hydrate
        // surviving locations without restoring removed entries or stale metadata.
        return current.map((item) => {
          const handle = items.find((stored) => stored.id === item.id)?.handle;
          return handle ? { ...item, handle, canReopen: true } : item;
        });
      });
    });
    return () => {
      active = false;
    };
  }, []);
  async function remember(input: Parameters<typeof rememberLocation>[0]) {
    const request = ++revision.current;
    const { items, id } = await rememberLocation(input, recents);
    if (request === revision.current) setRecents(items);
    return id;
  }
  async function remove(id: string | string[]) {
    const request = ++revision.current;
    const items = await forgetRecentLocation(id);
    if (request === revision.current) setRecents(items);
  }
  return { recents, remember, remove };
}
