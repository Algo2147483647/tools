import { isTimelineDocument } from "../graph/timelineView";
import { getDocumentTimelineSettings, sanitizeTimelineSettings } from "../graph/timelineSettings";
import { type GraphAppState, createInitialGraphState, type EditTransaction } from "./initialState";
import type { GraphAction } from "./graphActions";
export function replaceDocument(
  state: GraphAppState,
  action: Extract<GraphAction, { type: "graphClosed" | "graphLoaded" | "canvasInitialized" }>,
): GraphAppState {
  const initial = createInitialGraphState();
  const loaded = action.type !== "graphClosed";
  const isNew = action.type === "canvasInitialized";
  return {
    ...initial,
    timelineSettings: sanitizeTimelineSettings({
      ...state.timelineSettings,
      typeColors: {},
      pins: {},
      locked: false,
      ...(loaded ? getDocumentTimelineSettings(action.dag.metadata) : {}),
    }),
    dag: loaded ? action.dag : null,
    document: {
      id: loaded ? action.documentId : "",
      generation: state.document.generation + 1,
      savedDag: action.type === "graphLoaded" ? action.dag : null,
    },
    source: loaded
      ? {
          fileName: action.fileName,
          fileHandle: action.type === "graphLoaded" ? action.fileHandle || null : null,
          dirty: isNew,
        }
      : initial.source,
    selection: loaded
      ? action.dag.hierarchy_edges?.length || isTimelineDocument(action.dag)
        ? { type: "full" }
        : action.selection
      : null,
    editHistory: { ...initial.editHistory, savedRevision: isNew ? -1 : 0 },
    chartType: loaded
      ? isTimelineDocument(action.dag)
        ? "timeline"
        : action.dag.hierarchy_edges?.length
          ? "compound"
          : action.dag.diagram === "sankey"
            ? "sankey"
            : "node-link"
      : state.chartType,
    layout: state.layout,
    ui: {
      ...initial.ui,
      consoleSidebarOpen: state.ui.consoleSidebarOpen,
      consoleSidebarWidth: state.ui.consoleSidebarWidth,
      status: action.status,
    },
  };
}
export function pushEditTransaction(stack: EditTransaction[], transaction: EditTransaction) {
  return [...stack, transaction].slice(-100);
}
export function traverseEditHistory(state: GraphAppState, direction: "undo" | "redo"): GraphAppState {
  const undo = direction === "undo";
  const transaction = (undo ? state.editHistory.undoStack : state.editHistory.redoStack).at(-1);
  if (!transaction) return state;
  const revision = undo ? transaction.revisionBefore : transaction.revisionAfter;
  return {
    ...state,
    dag: undo ? transaction.beforeDag : transaction.afterDag,
    source: { ...state.source, dirty: revision !== state.editHistory.savedRevision },
    selection: undo ? transaction.beforeSelection : transaction.afterSelection,
    history: undo ? transaction.beforeNavigationHistory : transaction.afterNavigationHistory,
    editHistory: {
      ...state.editHistory,
      revision,
      undoStack: undo
        ? state.editHistory.undoStack.slice(0, -1)
        : pushEditTransaction(state.editHistory.undoStack, transaction),
      redoStack: undo ? [...state.editHistory.redoStack, transaction] : state.editHistory.redoStack.slice(0, -1),
    },
    ui: {
      ...state.ui,
      contextMenu: null,
      relationEditor: null,
      nodeDetail: null,
      saveDialogOpen: false,
      status: (undo ? "Undid: " : "Redid: ") + transaction.label,
    },
  };
}
