import { useCallback, useEffect, useState } from "react";
import { getLocalRecents, localJson } from "../../workspace/localApi";
import type { LocationInput, RecentLocation } from "../../workspace/locations";
export function useRecentLocations() {
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const refresh = useCallback(() => getLocalRecents().then(setRecents), []);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  return {
    recents,
    identify: async (input: LocationInput) => input.id || crypto.randomUUID(),
    remember(input: LocationInput & { id: string }) {
      void localJson(`/workspaces/${input.id}/session`, "PATCH", { lastGraph: input.lastGraph })
        .then(refresh)
        .catch(() => {});
    },
    remove(ids: string | string[]) {
      void localJson("/recents", "DELETE", { ids: typeof ids === "string" ? [ids] : ids })
        .then(refresh)
        .catch(() => {});
    },
  };
}
