import { loadCompoundView, saveCompoundView } from "../../viewport/compoundViewStorage";
import { useCallback, useMemo, useState } from "react";
import type { CompoundView } from "../../graph/types";

export function useCompoundView(
  documentId: string,
  defaultCollapsedGroupIds: string[] = [],
  initial?: CompoundView,
  generation = 0,
) {
  const key = JSON.stringify(["graph-studio:compound-view", documentId, generation]);
  const saved = useMemo(() => initial ?? loadCompoundView(key, defaultCollapsedGroupIds), [key]);
  const [current, setCurrent] = useState({ key, view: saved });
  const [history, setHistory] = useState<{ key: string; entries: CompoundView[] }>({ key, entries: [] });
  const view = current.key === key ? current.view : saved;
  const setView = useCallback(
    (next: CompoundView) => {
      if (next.focusGroupId !== view.focusGroupId)
        setHistory((previous) => ({ key, entries: [...(previous.key === key ? previous.entries : []), view] }));
      setCurrent({ key, view: next });
      saveCompoundView(key, next);
    },
    [key, view],
  );
  const back = () => {
    if (history.key !== key || !history.entries.length) return;
    const previous = history.entries[history.entries.length - 1];
    setHistory({ key, entries: history.entries.slice(0, -1) });
    setCurrent({ key, view: previous });
    saveCompoundView(key, previous);
  };
  return { view, setView, back, canBack: history.key === key && history.entries.length > 0 };
}
