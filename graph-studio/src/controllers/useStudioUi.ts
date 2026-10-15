import { type Dispatch, useCallback, useState } from "react";
import type { NodeKey, GraphChartType, GraphLayoutMode } from "../graph/types";
import type { GraphAction } from "../state/graphActions";

export function useStudioUi(dispatch: Dispatch<GraphAction>) {
  const [nodeDetailInitialFocus, setNodeDetailInitialFocus] = useState<"fields" | "raw">("fields");
  const openNodeDetail = useCallback(
    (nodeKey: NodeKey, focus: "fields" | "raw" = "fields") => {
      setNodeDetailInitialFocus(focus);
      dispatch({ type: "nodeDetailOpened", nodeKey });
    },
    [dispatch],
  );
  const closeModals = useCallback(() => dispatch({ type: "modalClosed" }), [dispatch]);
  const closeContextMenu = useCallback(() => dispatch({ type: "contextMenuClosed" }), [dispatch]);
  return {
    nodeDetailInitialFocus,
    openNodeDetail,
    closeModals,
    closeContextMenu,
    toggleSettings: () => dispatch({ type: "settingsToggled" }),
    toggleConsole: () => dispatch({ type: "consoleSidebarToggled" }),
    closeSaveDialog: () => dispatch({ type: "saveDialogClosed" }),
    changeLayout: (mode: GraphLayoutMode) => dispatch({ type: "layoutModeChanged", mode }),
    changeChartType: (chartType: GraphChartType) => dispatch({ type: "chartTypeChanged", chartType }),
  };
}
export type StudioUiController = ReturnType<typeof useStudioUi>;
