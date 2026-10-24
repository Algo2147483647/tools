import { getGroupNodes } from "../graph/compound/hierarchy";
import { type Dispatch, useEffect, useRef } from "react";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import type { StageData } from "../layout/shared/types";
interface InteractionInput {
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;
  activeType: string;
  stage: StageData | null;
  setFocusedKey(key: string): void;
  openNodeDetail(key: string): void;
  focusGroupId: string | null;
}
export function useGraphInteractions({
  state,
  dispatch,
  activeType,
  stage,
  setFocusedKey,
  openNodeDetail,
  focusGroupId,
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

  function handleNodeContextMenu(event: React.MouseEvent<Element>, nodeKey: string) {
    event.preventDefault();
    event.stopPropagation();
    const group =
      state.chartType === "compound" && Object.prototype.hasOwnProperty.call(getGroupNodes(state.dag), nodeKey);
    dispatch({
      type: "contextMenuOpened",
      x: event.clientX,
      y: event.clientY,
      target: { kind: group ? "group" : "node", id: nodeKey },
    });
  }

  function handleBackgroundContextMenu(event: React.MouseEvent<Element>) {
    if (!state.dag || (event.target instanceof Element && event.target.closest(".dag-node"))) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const groupId =
      state.chartType === "compound" && event.target instanceof Element
        ? event.target.closest<SVGElement>("[data-group-id]")?.dataset.groupId
        : undefined;
    dispatch({
      type: "contextMenuOpened",
      x: event.clientX,
      y: event.clientY,
      target: groupId
        ? { kind: "group", id: groupId }
        : { kind: "canvas", parentId: state.chartType === "compound" ? focusGroupId : null },
    });
  }

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeContextMenu,
    handleBackgroundContextMenu,
    clearPendingNodeClick,
  };
}
