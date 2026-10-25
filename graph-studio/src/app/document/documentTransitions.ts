import { isSpatialDocument } from "../../graph/space";
import { isTimelineDocument } from "../../graph/timeline/view";
import { resolveTimeline as sanitizeTimelineSettings } from "../../schema/appearance/contract";
import { type GraphAppState, createInitialGraphState, type EditTransaction } from "./initialState";
import type { GraphAction } from "./graphActions";
export function replaceDocument(
  state: GraphAppState,
  action: Extract<GraphAction, { type: "graphClosed" | "graphLoaded" | "canvasInitialized" }>,
): GraphAppState {
  const initial = createInitialGraphState();
  const loaded = action.type !== "graphClosed";
  const isNew = action.type === "canvasInitialized";
  const loadedLayout = action.type === "graphLoaded" ? action.linkedLayout : undefined;
  const rendering = loadedLayout?.activeChart ? loadedLayout.renderings?.[loadedLayout.activeChart] : undefined;
  return {
    ...initial,
    timelineSettings: sanitizeTimelineSettings({
      ...initial.timelineSettings,
      typeColors: {},
      pins: {},
      locked: false,
      ...(action.type === "graphLoaded" ? action.linkedStyle?.timeline : {}),
      ...loadedLayout?.timelineView,
      ...(loadedLayout?.activeChart === "timeline" ? rendering?.timelineSettings : {}),
    }),
    dag: loaded ? action.dag : null,
    document: {
      id: loaded ? action.documentId : "",
      generation: state.document.generation + 1,
      savedDag: action.type === "graphLoaded" ? action.dag : null,
      linkedStyle: action.type === "graphLoaded" ? action.linkedStyle : undefined,
      linkedChartType: action.type === "graphLoaded" ? action.linkedChartType : undefined,
    },
    source: loaded
      ? {
          fileName: action.fileName,
          fileHandle: action.type === "graphLoaded" ? action.fileHandle || null : null,
          dirty: isNew,
        }
      : initial.source,
    selection: rendering
      ? rendering.scope.selection
      : loaded
        ? action.dag.hierarchy_edges?.length || isTimelineDocument(action.dag) || isSpatialDocument(action.dag)
          ? { type: "full" }
          : action.selection
        : null,
    editHistory: { ...initial.editHistory, savedRevision: isNew ? -1 : 0 },
    chartType:
      loadedLayout?.activeChart ??
      (action.type === "graphLoaded" && action.linkedStyle && action.linkedChartType
        ? action.linkedChartType
        : loaded
          ? isSpatialDocument(action.dag)
            ? "spatial"
            : isTimelineDocument(action.dag)
              ? "timeline"
              : action.dag.hierarchy_edges?.length
                ? "compound"
                : action.dag.diagram === "sankey"
                  ? "sankey"
                  : "node-link"
          : state.chartType),
    layoutDocument:
      action.type === "graphLoaded"
        ? {
            data: action.linkedLayout ?? initial.layoutDocument.data,
            notice: action.layoutNotice ?? "",
          }
        : initial.layoutDocument,
    layout: {
      mode:
        action.type === "graphLoaded" && action.linkedLayout
          ? action.linkedLayout.charts["node-link"].method
          : initial.layoutDocument.data.charts["node-link"].method,
    },
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
    layoutDocument: {
      ...state.layoutDocument,
      data: (undo ? transaction.beforeLayout : transaction.afterLayout) ?? state.layoutDocument.data,
    },
    layout: {
      mode: ((undo ? transaction.beforeLayout : transaction.afterLayout) ?? state.layoutDocument.data).charts[
        "node-link"
      ].method,
    },
    source: {
      ...state.source,
      dirty: (undo ? transaction.beforeDag : transaction.afterDag) !== state.document.savedDag,
    },
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
