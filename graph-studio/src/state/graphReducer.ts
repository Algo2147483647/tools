import { getSankeyError } from "../graph/sankey";
import { areSelectionsEqual } from "../graph/selectors";
import { getGraphChartLabel, getGraphLayoutLabel } from "../graph/types";
import type { GraphAction } from "./graphActions";
import { type GraphAppState, createInitialGraphState } from "./initialState";
import { clampConsoleSidebarWidth } from "./preferences";

const EDIT_HISTORY_LIMIT = 100;

export function graphReducer(state: GraphAppState, action: GraphAction): GraphAppState {
  const next = reduceGraphState(state, action);
  if (next.chartType === "sankey" && next.dag && (next.dag !== state.dag || next.chartType !== state.chartType)) {
    const error = getSankeyError(next.dag.nodes, next.dag.edges);
    if (error)
      return { ...next, chartType: "node-link", ui: { ...next.ui, status: `${error} Showing the node-link chart.` } };
  }
  return next;
}

function reduceGraphState(state: GraphAppState, action: GraphAction): GraphAppState {
  switch (action.type) {
    case "graphClosed":
    case "graphLoaded":
    case "canvasInitialized": {
      const initial = createInitialGraphState();
      const loaded = action.type !== "graphClosed";
      const isNew = action.type === "canvasInitialized";
      return {
        ...initial,
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
        selection: loaded ? (action.dag.hierarchy ? { type: "full" } : action.selection) : null,
        editHistory: { ...initial.editHistory, savedRevision: isNew ? -1 : 0 },
        chartType: loaded
          ? action.dag.hierarchy
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
    case "selectionChanged": {
      const shouldPush =
        action.pushHistory && state.selection && !areSelectionsEqual(state.selection, action.selection);
      return {
        ...state,
        selection: action.selection,
        history: shouldPush ? [...state.history, state.selection!] : state.history,
        ui: { ...state.ui, contextMenu: null },
      };
    }
    case "navigateBack": {
      const previousSelection = state.history[state.history.length - 1];
      if (!previousSelection) {
        return state;
      }
      return {
        ...state,
        selection: previousSelection,
        history: state.history.slice(0, -1),
        ui: { ...state.ui, contextMenu: null },
      };
    }
    case "graphCommandsCommitted": {
      const revision = action.transaction.revisionAfter;
      const savedRevision = state.editHistory.savedRevision;
      const undoStack = pushEditTransaction(state.editHistory.undoStack, action.transaction);
      const nextUi = applyBatchUiEffects(state.ui, action.renamedKeys, action.deletedKeys);

      return {
        ...state,
        dag: action.transaction.afterDag,
        nextRevision: revision + 1,
        source: { ...state.source, dirty: revision !== savedRevision },
        selection: action.transaction.afterSelection,
        history: action.transaction.afterNavigationHistory,
        editHistory: {
          ...state.editHistory,
          undoStack,
          redoStack: [],
          revision,
        },
        ui: {
          ...nextUi,
          contextMenu: null,
          status: action.status,
        },
      };
    }
    case "undoRequested": {
      const transaction = state.editHistory.undoStack[state.editHistory.undoStack.length - 1];
      if (!transaction) {
        return state;
      }

      const undoStack = state.editHistory.undoStack.slice(0, -1);
      const redoStack = [...state.editHistory.redoStack, transaction];
      const revision = transaction.revisionBefore;
      const savedRevision = state.editHistory.savedRevision;

      return {
        ...state,
        dag: transaction.beforeDag,
        source: { ...state.source, dirty: revision !== savedRevision },
        selection: transaction.beforeSelection,
        history: transaction.beforeNavigationHistory,
        editHistory: {
          ...state.editHistory,
          undoStack,
          redoStack,
          revision,
        },
        ui: {
          ...state.ui,
          contextMenu: null,
          relationEditor: null,
          nodeDetail: null,
          saveDialogOpen: false,
          status: `Undid: ${transaction.label}`,
        },
      };
    }
    case "redoRequested": {
      const transaction = state.editHistory.redoStack[state.editHistory.redoStack.length - 1];
      if (!transaction) {
        return state;
      }

      const redoStack = state.editHistory.redoStack.slice(0, -1);
      const undoStack = pushEditTransaction(state.editHistory.undoStack, transaction);
      const revision = transaction.revisionAfter;
      const savedRevision = state.editHistory.savedRevision;

      return {
        ...state,
        dag: transaction.afterDag,
        source: { ...state.source, dirty: revision !== savedRevision },
        selection: transaction.afterSelection,
        history: transaction.afterNavigationHistory,
        editHistory: {
          ...state.editHistory,
          undoStack,
          redoStack,
          revision,
        },
        ui: {
          ...state.ui,
          contextMenu: null,
          relationEditor: null,
          nodeDetail: null,
          saveDialogOpen: false,
          status: `Redid: ${transaction.label}`,
        },
      };
    }
    case "layoutModeChanged":
      if (state.chartType !== "node-link") return state;
      return {
        ...state,
        layout: { ...state.layout, mode: action.mode },
        ui: {
          ...state.ui,
          contextMenu: null,
          status: state.dag ? `Layout: ${getGraphLayoutLabel(action.mode)}.` : state.ui.status,
        },
      };
    case "chartTypeChanged": {
      if (action.chartType === state.chartType) return state;
      if (action.chartType === "sankey" && state.dag) {
        const error = getSankeyError(state.dag.nodes, state.dag.edges);
        if (error) return { ...state, ui: { ...state.ui, status: error } };
      }
      return {
        ...state,
        chartType: action.chartType,
        ui: { ...state.ui, contextMenu: null, status: `Chart type: ${getGraphChartLabel(action.chartType)}.` },
      };
    }
    case "zoomChanged":
      if (
        Math.abs(state.zoom.scale - action.scale) < 0.0001 &&
        Math.abs(state.zoom.minScale - (action.minScale ?? state.zoom.minScale)) < 0.0001
      ) {
        return state;
      }
      return {
        ...state,
        zoom: {
          ...state.zoom,
          minScale: action.minScale ?? state.zoom.minScale,
          scale: action.scale,
        },
      };
    case "settingsToggled":
      return { ...state, ui: { ...state.ui, settingsOpen: action.open ?? !state.ui.settingsOpen } };
    case "consoleSidebarToggled":
      return { ...state, ui: { ...state.ui, consoleSidebarOpen: action.open ?? !state.ui.consoleSidebarOpen } };
    case "consoleSidebarWidthChanged":
      return { ...state, ui: { ...state.ui, consoleSidebarWidth: clampConsoleSidebarWidth(action.width) } };
    case "contextMenuOpened":
      return { ...state, ui: { ...state.ui, contextMenu: { x: action.x, y: action.y, nodeKey: action.nodeKey } } };
    case "contextMenuClosed":
      return { ...state, ui: { ...state.ui, contextMenu: null } };
    case "relationEditorOpened":
      return {
        ...state,
        ui: { ...state.ui, contextMenu: null, relationEditor: { nodeKey: action.nodeKey, field: action.field } },
      };
    case "nodeDetailOpened":
      return { ...state, ui: { ...state.ui, contextMenu: null, nodeDetail: { nodeKey: action.nodeKey } } };
    case "modalClosed":
      return { ...state, ui: { ...state.ui, relationEditor: null, nodeDetail: null, saveDialogOpen: false } };
    case "saveDialogOpened":
      return { ...state, ui: { ...state.ui, saveDialogOpen: true } };
    case "saveDialogClosed":
      return { ...state, ui: { ...state.ui, saveDialogOpen: false } };
    case "saved":
      if (action.generation !== state.document.generation || !state.dag) return state;
      return {
        ...state,
        source: { ...state.source, dirty: state.editHistory.revision !== action.revision },
        document: { ...state.document, savedDag: action.dag },
        editHistory: { ...state.editHistory, savedRevision: action.revision },
        ui: { ...state.ui, saveDialogOpen: false, status: action.status },
      };
    case "savedAsCopy":
      return {
        ...state,
        ui: { ...state.ui, saveDialogOpen: false, status: action.status },
      };
    case "statusChanged":
      return { ...state, ui: { ...state.ui, status: action.status } };
  }
}

function pushEditTransaction(
  stack: GraphAppState["editHistory"]["undoStack"],
  transaction: GraphAppState["editHistory"]["undoStack"][number],
) {
  const next = [...stack, transaction];
  return next.length > EDIT_HISTORY_LIMIT ? next.slice(next.length - EDIT_HISTORY_LIMIT) : next;
}

function applyBatchUiEffects(
  ui: GraphAppState["ui"],
  renamedKeys: Array<{ from: string; to: string }>,
  deletedKeys: string[],
): GraphAppState["ui"] {
  const deleted = new Set(deletedKeys);
  let nodeDetail = ui.nodeDetail;
  let relationEditor = ui.relationEditor;

  renamedKeys.forEach((renamed) => {
    if (nodeDetail?.nodeKey === renamed.from) {
      nodeDetail = { nodeKey: renamed.to };
    }
    if (relationEditor?.nodeKey === renamed.from) {
      relationEditor = { ...relationEditor, nodeKey: renamed.to };
    }
  });

  if (nodeDetail && deleted.has(nodeDetail.nodeKey)) {
    nodeDetail = null;
  }
  if (relationEditor && deleted.has(relationEditor.nodeKey)) {
    relationEditor = null;
  }

  return {
    ...ui,
    nodeDetail,
    relationEditor,
  };
}
