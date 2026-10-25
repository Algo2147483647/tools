import { parseLayoutDocument, repairLayoutDocument, type LayoutDocument } from "../../schema/layoutProtocol";
import { getSankeyError } from "../../graph/sankey";
import { areSelectionsEqual } from "../../graph/selectors";
import { getGraphChartLabel } from "../../graph/types";
import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";
import { clampConsoleSidebarWidth } from "../preferences/preferences";
import { resolveTimeline as sanitizeTimelineSettings } from "../../schema/appearance/contract";
import { parseTimelineLayoutPlan } from "../../graph/timeline/layoutData";

import { replaceDocument, traverseEditHistory, pushEditTransaction } from "./documentTransitions";

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
    case "timelineLayoutCommitted": {
      if (
        state.chartType !== "timeline" ||
        !state.dag ||
        action.generation !== state.document.generation ||
        action.revision !== state.editHistory.revision ||
        action.beforeDag !== state.dag ||
        action.historyBase !== state.editHistory
      )
        return { ...state, ui: { ...state.ui, status: "Timeline layout is stale. Generate a new preview." } };
      try {
        if (action.data.version !== 1 || !["ai", "algorithm"].includes(action.data.mode))
          throw new Error("Invalid layout mode.");
        const plan = action.data.plan ? parseTimelineLayoutPlan(action.data.plan) : undefined;
        if (plan?.eventOrder.some((id) => !Object.prototype.hasOwnProperty.call(state.dag!.nodes, id)))
          throw new Error("Timeline layout references an unknown event.");
        return commitLayout(state, { ...state.layoutDocument.data, charts: { ...state.layoutDocument.data.charts,
          timeline: { version: 1, mode: action.data.mode, ...(plan ? { plan } : {}) } } });
      } catch (error) {
        return {
          ...state,
          ui: { ...state.ui, status: error instanceof Error ? error.message : "Invalid timeline layout." },
        };
      }
    }
    case "layoutDocumentChanged": {
      if (action.generation !== state.document.generation || !state.dag) return state;
      try {
        const data = repairLayoutDocument(parseLayoutDocument(action.data), state.dag);
        const next = commitLayout(state, data);
        return action.source ? { ...next, layoutDocument: { ...next.layoutDocument, source: action.source } } : next;
      } catch (error) {
        return { ...state, layoutDocument: { ...state.layoutDocument, notice: error instanceof Error ? error.message : "Invalid layout." } };
      }
    }
    case "layoutDocumentSaved":
      return action.generation === state.document.generation
        ? { ...state, layoutDocument: { ...state.layoutDocument, saved: action.data, source: action.source } } : state;
    case "timelineSettingsChanged":
      return { ...state, timelineSettings: sanitizeTimelineSettings({ ...state.timelineSettings, ...action.patch }) };
    case "graphClosed":
    case "graphLoaded":
    case "canvasInitialized":
      return replaceDocument(state, action);
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
      const data = repairLayoutDocument(state.layoutDocument.data, action.transaction.afterDag, action.renamedKeys);
      const transaction = { ...action.transaction, beforeLayout: state.layoutDocument.data, afterLayout: data };
      const undoStack = pushEditTransaction(state.editHistory.undoStack, transaction);
      const nextUi = applyBatchUiEffects(state.ui, action.renamedKeys, action.deletedKeys);

      return {
        ...state,
        dag: action.transaction.afterDag,
        nextRevision: revision + 1,
        source: { ...state.source, dirty: action.transaction.afterDag !== state.document.savedDag },
        layoutDocument: { ...state.layoutDocument, data },
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
    case "undoRequested":
      return traverseEditHistory(state, "undo");
    case "redoRequested":
      return traverseEditHistory(state, "redo");
    case "layoutModeChanged":
      if (state.chartType !== "node-link") return state;
      return commitLayout(state, { ...state.layoutDocument.data, charts: { ...state.layoutDocument.data.charts, "node-link": { method: action.mode } } });
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
      return { ...state, ui: { ...state.ui, contextMenu: { x: action.x, y: action.y, target: action.target } } };
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
        source: { ...state.source, dirty: state.dag !== action.dag },
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

function commitLayout(state: GraphAppState, data: LayoutDocument): GraphAppState {
  if (!state.dag || JSON.stringify(data) === JSON.stringify(state.layoutDocument.data)) return state;
  const revision = state.nextRevision;
  const transaction = {
    label: "Updated layout configuration.", beforeDag: state.dag, afterDag: state.dag,
    beforeLayout: state.layoutDocument.data, afterLayout: data,
    beforeSelection: state.selection, afterSelection: state.selection,
    beforeNavigationHistory: state.history, afterNavigationHistory: state.history,
    revisionBefore: state.editHistory.revision, revisionAfter: revision,
  };
  return { ...state, layoutDocument: { ...state.layoutDocument, data, notice: "" },
    layout: { mode: data.charts["node-link"].method }, nextRevision: revision + 1,
    editHistory: { ...state.editHistory, revision, undoStack: pushEditTransaction(state.editHistory.undoStack, transaction), redoStack: [] } };
}
