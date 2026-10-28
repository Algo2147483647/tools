import { type Dispatch, useEffect, useRef } from "react";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import type { StageData } from "../../layout/shared/types";
interface InteractionInput {
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;
  activeType: string;
  stage: StageData | null;
  setFocusedKey(key: string): void;
  openNodeDetail(key: string): void;
}
export function useGraphInteractions({
  state,
  dispatch,
  activeType,
  stage,
  setFocusedKey,
  openNodeDetail,
}: InteractionInput) {
  const pendingNodeClickTimeoutRef = useRef<number | null>(null);
  useEffect(() => clearPendingNodeClick, [state.document.generation, state.chartType, activeType]);
  function handleNodeClick(nodeKey: string) {
    clearPendingNodeClick();
    if (state.chartType === "compound" || state.chartType === "timeline" || state.chartType === "spatial") {
      setFocusedKey(nodeKey);
      return;
    }
    if (activeType) {
      setFocusedKey(nodeKey);
      return;
    }
    pendingNodeClickTimeoutRef.current = window.setTimeout(() => {
      pendingNodeClickTimeoutRef.current = null;
      if (!state.selection || state.selection.type !== "node" || state.selection.key !== nodeKey) {
        dispatch({ type: "selectionChanged", selection: { type: "node", key: nodeKey }, pushHistory: true });
      }
    }, 240);
  }

  function handleNodeDoubleClick(nodeKey: string) {
    clearPendingNodeClick();
    if (!stage?.nodeMap[nodeKey]) {
      return;
    }
    openNodeDetail(nodeKey);
  }

  function clearPendingNodeClick() {
    if (pendingNodeClickTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(pendingNodeClickTimeoutRef.current);
    pendingNodeClickTimeoutRef.current = null;
  }

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    clearPendingNodeClick,
  };
}
