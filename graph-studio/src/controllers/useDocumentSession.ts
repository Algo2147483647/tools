import { useCallback, useMemo, useReducer, useState } from "react";
import { createGraphDocument } from "../graph/normalize";
import { getDefaultFieldMapping } from "../graph/fieldMapping";
import { createInitialCanvasDag, INITIAL_CANVAS_FILE_NAME } from "../graph/initialCanvas";
import { getInitialSelection } from "../graph/selectors";
import type { GraphLayoutMode, NodeKey } from "../graph/types";
import { useGraphImport } from "../hooks/useGraphImport";
import { useGraphSave } from "../hooks/useGraphSave";
import { useRelativeFilePreview } from "../hooks/useRelativeFilePreview";
import { graphReducer } from "../state/graphReducer";
import { initialGraphAppState } from "../state/initialState";
import { loadGraphPagePreferences } from "../state/preferences";
import { getSavedRevisionDag, serializeDagToJson } from "../state/documentSerialization";

export function useDocumentSession() {
  const [preferences] = useState(loadGraphPagePreferences);
  const [state, dispatch] = useReducer(graphReducer, initialGraphAppState);
  const [fieldMapping] = useState(getDefaultFieldMapping);
  const [showNodeDetail, setShowNodeDetail] = useState(preferences.showNodeDetail);
  const [hideNodeBorders, setHideNodeBorders] = useState(preferences.hideNodeBorders);
  const [alignNodeWidthsToMax, setAlignNodeWidthsToMax] = useState(preferences.alignNodeWidthsToMax);
  const [aiSettings, setAiSettings] = useState(preferences.aiSettings);
  const [nodeDetailInitialFocus, setNodeDetailInitialFocus] = useState<"fields" | "raw">("fields");
  const files = useGraphImport({ dispatch, state });
  const relativeRoot = useMemo(() => files.workspace ? {
    name: files.workspace.name, handle: files.workspace.handle,
    files: files.workspace.files, baseFile: files.workspace.activePath || "",
  } : null, [files.workspace?.name, files.workspace?.handle, files.workspace?.files, files.workspace?.activePath]);
  const preview = useRelativeFilePreview(dispatch, relativeRoot);
  const currentJsonContent = useMemo(() => serializeDagToJson(state.dag || createGraphDocument(), fieldMapping), [fieldMapping, state.dag]);
  const savedJsonContent = useMemo(() => serializeDagToJson(
    getSavedRevisionDag(state.editHistory, state.dag) || createGraphDocument(), fieldMapping,
  ), [fieldMapping, state.dag, state.editHistory]);
  const save = useGraphSave({ source: state.source, currentJsonContent, dispatch });
  const openNodeDetail = useCallback((nodeKey: NodeKey, focus: "fields" | "raw" = "fields") => {
    setNodeDetailInitialFocus(focus);
    dispatch({ type: "nodeDetailOpened", nodeKey });
  }, []);
  const closeModals = useCallback(() => dispatch({ type: "modalClosed" }), []);
  const closeContextMenu = useCallback(() => dispatch({ type: "contextMenuClosed" }), []);
  const requestSave = useCallback(() => {
    dispatch(state.dag ? { type: "saveDialogOpened" }
      : { type: "statusChanged", status: "Load or render a graph before saving JSON." });
  }, [state.dag]);
  function initializeCanvas() {
    if (!files.prepareNewDocument()) return;
    const dag = createInitialCanvasDag(fieldMapping);
    dispatch({
      type: "canvasInitialized",
      dag,
      fileName: INITIAL_CANVAS_FILE_NAME,
      selection: getInitialSelection(dag, fieldMapping),
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
    state, dispatch, preferences, fieldMapping, files, ...preview, ...save,
    currentJsonContent, savedJsonContent, nodeDetailInitialFocus, openNodeDetail,
    closeModals, closeContextMenu, requestSave, initializeCanvas,
    handleAppDragOver, handleAppDrop, aiSettings, setAiSettings,
    showNodeDetail, hideNodeBorders, alignNodeWidthsToMax,
    toggleNodeDetail: () => setShowNodeDetail(current => !current),
    toggleNodeBorders: () => setHideNodeBorders(current => !current),
    toggleNodeWidthAlign: () => setAlignNodeWidthsToMax(current => !current),
    toggleSettings: () => dispatch({ type: "settingsToggled" }),
    toggleConsole: () => dispatch({ type: "consoleSidebarToggled" }),
    closeSaveDialog: () => dispatch({ type: "saveDialogClosed" }),
    changeLayout: (mode: GraphLayoutMode) => dispatch({ type: "layoutModeChanged", mode }),
  };
}

export type DocumentSessionController = ReturnType<typeof useDocumentSession>;

function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types || []).includes("Files");
}
