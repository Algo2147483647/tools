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
      if (active && revision.current === initialRevision) setRecents(items);
    });
    return () => {
      active = false;
    };
  }, []);
  async function remember(input: Parameters<typeof rememberLocation>[0]) {
    const request = ++revision.current;
    const { items, id } = await rememberLocation(input);
    if (request === revision.current) setRecents(items);
    return id;
  }
  async function remove(id: string) {
    const request = ++revision.current;
    const items = await forgetRecentLocation(id);
    if (request === revision.current) setRecents(items);
  }
  return { recents, remember, remove };
}
