import { type Dispatch, useCallback, useState } from "react";
import type { NodeKey, GraphChartType, GraphLayoutMode } from "../../graph/types";
import type { GraphAction } from "../document/graphActions";

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
  return {
    nodeDetailInitialFocus,
    openNodeDetail,
    closeModals,
    toggleSettings: () => dispatch({ type: "settingsToggled" }),
    closeSaveDialog: () => dispatch({ type: "saveDialogClosed" }),
    changeLayout: (mode: GraphLayoutMode) => dispatch({ type: "layoutModeChanged", mode }),
    changeChartType: (chartType: GraphChartType) => dispatch({ type: "chartTypeChanged", chartType }),
  };
}
export type StudioUiController = ReturnType<typeof useStudioUi>;
