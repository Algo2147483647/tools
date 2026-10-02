import { useCallback, useMemo, useReducer, useState } from "react";
import { createInitialCanvasDag, INITIAL_CANVAS_FILE_NAME } from "../graph/initialCanvas";
import { createGraphDocument } from "../graph/normalize";
import { getInitialSelection } from "../graph/selectors";
import type { GraphChartType, GraphLayoutMode, NodeKey } from "../graph/types";
import { useGraphImport } from "../hooks/useGraphImport";
import { useGraphSave } from "../hooks/useGraphSave";
import { useRelativeFilePreview } from "../hooks/useRelativeFilePreview";
import type { ChartDisplayOptions } from "../state/chartStyles";
import { serializeDagToJson } from "../state/documentSerialization";
import { graphReducer } from "../state/graphReducer";
import { createInitialGraphState } from "../state/initialState";
import { loadGraphPagePreferences } from "../state/preferences";

export function useDocumentSession() {
  const [preferences] = useState(loadGraphPagePreferences);
  const [state, dispatch] = useReducer(graphReducer, preferences, createInitialGraphState);

  const [displayByChart, setDisplayByChart] = useState<Record<GraphChartType, ChartDisplayOptions>>(() => ({
    "node-link": displayOptions(preferences.chartStyles["node-link"]),
    sankey: displayOptions(preferences.chartStyles.sankey),
    compound: displayOptions(preferences.chartStyles.compound),
  }));
  const { showNodeDetail, hideNodeBorders, alignNodeWidthsToMax } = displayByChart[state.chartType];
  function toggleDisplay(key: keyof ChartDisplayOptions) {
    setDisplayByChart((current) => ({
      ...current,
      [state.chartType]: { ...current[state.chartType], [key]: !current[state.chartType][key] },
    }));
  }
  const [aiSettings, setAiSettings] = useState(preferences.aiSettings);
  const [nodeDetailInitialFocus, setNodeDetailInitialFocus] = useState<"fields" | "raw">("fields");
  const files = useGraphImport({ dispatch, state });
  const relativeRoot = useMemo(
    () =>
      files.workspace
        ? {
            name: files.workspace.name,
            handle: files.workspace.handle,
            files: files.workspace.files,
            baseFile: files.workspace.activePath || "",
          }
        : null,
    [files.workspace?.name, files.workspace?.handle, files.workspace?.files, files.workspace?.activePath],
  );
  const preview = useRelativeFilePreview(dispatch, relativeRoot);
  const currentJsonContent = useMemo(() => serializeDagToJson(state.dag || createGraphDocument()), [state.dag]);
  const savedJsonContent = useMemo(
    () => serializeDagToJson(state.document.savedDag || createGraphDocument()),
    [state.document.savedDag],
  );
  const save = useGraphSave({ state, currentJsonContent, dispatch });
  const openNodeDetail = useCallback((nodeKey: NodeKey, focus: "fields" | "raw" = "fields") => {
    setNodeDetailInitialFocus(focus);
    dispatch({ type: "nodeDetailOpened", nodeKey });
  }, []);
  const closeModals = useCallback(() => dispatch({ type: "modalClosed" }), []);
  const closeContextMenu = useCallback(() => dispatch({ type: "contextMenuClosed" }), []);
  const requestSave = useCallback(() => {
    dispatch(
      state.dag
        ? { type: "saveDialogOpened" }
        : { type: "statusChanged", status: "Load or render a graph before saving JSON." },
    );
  }, [state.dag]);
  function initializeCanvas() {
    if (!files.prepareNewDocument()) return;
    const dag = createInitialCanvasDag();
    dispatch({
      type: "canvasInitialized",
      documentId: crypto.randomUUID(),
      dag,
      fileName: INITIAL_CANVAS_FILE_NAME,
      selection: getInitialSelection(dag),
      status: "Initialized a new canvas with one starting node.",
    });
  }

  function handleAppDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleAppDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dispatch({ type: "contextMenuClosed" });
    void files.handleDroppedFiles(event.dataTransfer.files);
  }

  return {
    state,
    dispatch,
    preferences,
    files,
    ...preview,
    ...save,
    currentJsonContent,
    savedJsonContent,
    nodeDetailInitialFocus,
    openNodeDetail,
    closeModals,
    closeContextMenu,
    requestSave,
    initializeCanvas,
    handleAppDragOver,
    handleAppDrop,
    aiSettings,
    setAiSettings,
    showNodeDetail,
    hideNodeBorders,
    alignNodeWidthsToMax,
    displayByChart,
    toggleNodeDetail: () => toggleDisplay("showNodeDetail"),
    toggleNodeBorders: () => toggleDisplay("hideNodeBorders"),
    toggleNodeWidthAlign: () => toggleDisplay("alignNodeWidthsToMax"),
    toggleSettings: () => dispatch({ type: "settingsToggled" }),
    toggleConsole: () => dispatch({ type: "consoleSidebarToggled" }),
    closeSaveDialog: () => dispatch({ type: "saveDialogClosed" }),
    changeLayout: (mode: GraphLayoutMode) => dispatch({ type: "layoutModeChanged", mode }),
    changeChartType: (chartType: GraphChartType) => dispatch({ type: "chartTypeChanged", chartType }),
  };
}

export type DocumentSessionController = ReturnType<typeof useDocumentSession>;

function displayOptions({
  showNodeDetail,
  hideNodeBorders,
  alignNodeWidthsToMax,
}: ChartDisplayOptions): ChartDisplayOptions {
  return { showNodeDetail, hideNodeBorders, alignNodeWidthsToMax };
}

function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types || []).includes("Files");
}
