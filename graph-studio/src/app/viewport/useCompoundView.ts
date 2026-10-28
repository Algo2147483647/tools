import {
  loadCompoundView,
  saveCompoundView,
  compoundViewKey,
  sanitizeCompoundView,
} from "../../viewport/compoundViewStorage";
import { useCallback, useMemo, useState } from "react";
import type { CompoundView } from "../../graph/types";

export function useCompoundView(
  documentId: string,
  defaultCollapsedGroupIds: string[] = [],
  initial?: CompoundView,
  generation = 0,
  cacheIdentity = documentId,
) {
  const storageKey = compoundViewKey(cacheIdentity);
  const key = JSON.stringify([documentId, generation]);
  const saved = useMemo(() => loadCompoundView(storageKey, defaultCollapsedGroupIds, initial), [key]);
  const [current, setCurrent] = useState({ key, view: saved });
  const [history, setHistory] = useState<{ key: string; entries: CompoundView[] }>({ key, entries: [] });
  const sourceView = current.key === key ? current.view : saved;
  const view = useMemo(
    () => sanitizeCompoundView(sourceView, defaultCollapsedGroupIds),
    [sourceView, defaultCollapsedGroupIds],
  );
  const setView = useCallback(
    (next: CompoundView) => {
      if (next.focusGroupId !== view.focusGroupId)
        setHistory((previous) => ({ key, entries: [...(previous.key === key ? previous.entries : []), view] }));
      const clean = sanitizeCompoundView(next, defaultCollapsedGroupIds);
      setCurrent({ key, view: clean });
      saveCompoundView(storageKey, clean);
    },
    [key, storageKey, view, defaultCollapsedGroupIds],
  );
  const back = () => {
    if (history.key !== key || !history.entries.length) return;
    const previous = sanitizeCompoundView(
      { ...view, focusGroupId: history.entries[history.entries.length - 1].focusGroupId },
      defaultCollapsedGroupIds,
    );
    setHistory({ key, entries: history.entries.slice(0, -1) });
    setCurrent({ key, view: previous });
    saveCompoundView(storageKey, previous);
  };
  return { view, setView, back, canBack: history.key === key && history.entries.length > 0 };
}
