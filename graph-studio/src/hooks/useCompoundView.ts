import { useCallback, useMemo, useState } from "react";
import type { CompoundView } from "../graph/types";

export function useCompoundView(documentId: string, hierarchyId = "H", defaultCollapsedGroupIds: string[] = []) {
  const key = JSON.stringify(["graph-studio:compound-view", documentId, hierarchyId]);
  const saved = useMemo<CompoundView>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null");
      if (raw && Array.isArray(raw.collapsedGroupIds))
        return {
          collapsedGroupIds: raw.collapsedGroupIds.filter((id: unknown): id is string => typeof id === "string"),
          focusGroupId: typeof raw.focusGroupId === "string" ? raw.focusGroupId : null,
        } satisfies CompoundView;
    } catch {
      /* Private storage may be unavailable. */
    }
    return { collapsedGroupIds: defaultCollapsedGroupIds, focusGroupId: null } as CompoundView;
  }, [key]);
  const [current, setCurrent] = useState({ key, view: saved });
  const [history, setHistory] = useState<{ key: string; entries: CompoundView[] }>({ key, entries: [] });
  const view = current.key === key ? current.view : saved;
  const setView = useCallback(
    (next: CompoundView) => {
      if (next.focusGroupId !== view.focusGroupId)
        setHistory((previous) => ({ key, entries: [...(previous.key === key ? previous.entries : []), view] }));
      setCurrent({ key, view: next });
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Keep the in-memory view. */
      }
    },
    [key, view],
  );
  const back = () => {
    if (history.key !== key || !history.entries.length) return;
    const previous = history.entries[history.entries.length - 1];
    setHistory({ key, entries: history.entries.slice(0, -1) });
    setCurrent({ key, view: previous });
    try {
      localStorage.setItem(key, JSON.stringify(previous));
    } catch {
      /* Keep the view. */
    }
  };
  return { view, setView, back, canBack: history.key === key && history.entries.length > 0 };
}
