import { refreshFlatText } from "../../layout/node-link/refreshText";
import { useMemo } from "react";
import type { StageData } from "../../layout/shared/types";
import { prepareNodeLinkInput, type NodeLinkLayoutInput } from "../../layout/node-link/input";
import { solveFlatLayout } from "../../layout/node-link/layout";
import { useLayoutCache } from "../../layout/runtime/useLayoutCache";
import { layoutIdentity } from "../../schema/layoutGeometry";
export function useFlatLayout(input: NodeLinkLayoutInput | null, generation: number) {
  const cache = useLayoutCache<StageData>(generation);
  return useMemo(() => {
    const prepared = input && prepareNodeLinkInput(input);
    if (!prepared) return { stage: null, error: "" };
    const key = layoutIdentity([
      "flat-1",
      prepared.layoutDag,
      prepared.layoutMode,
      prepared.selection,
      [...prepared.visualByKey],
      { ...prepared.theme, fontMetricsKey: undefined },
    ]);
    const cached = cache.get(key);
    if (cached) return { stage: refreshFlatText(cached, prepared), error: "" };
    try {
      return { stage: cache.set(key, solveFlatLayout(prepared)), error: "" };
    } catch (error) {
      return { stage: null, error: error instanceof Error ? error.message : "Layout failed." };
    }
  }, [input, cache]);
}
