import { parseLayoutSession, repairLayoutSession, type LayoutSessionState } from "../../schema/layoutSession";
import { getSankeyError } from "../../graph/sankey";
import { areSelectionsEqual } from "../../graph/selectors";
import { getGraphChartLabel } from "../../graph/types";
import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";
import { clampConsoleSidebarWidth } from "../preferences/preferences";
import { resolveTimeline as sanitizeTimelineSettings } from "../../schema/appearance/contract";

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
    case "styleReferenceBound": {
      if (!state.dag || action.generation !== state.document.generation) return state;
      if (state.dag.metadata?.style === action.reference)
        return { ...state, ui: { ...state.ui, status: `Updated ${action.reference}.` } };
      const afterDag = { ...state.dag, metadata: { ...state.dag.metadata, style: action.reference } };
      return reduceGraphState(state, {
        type: "graphCommandsCommitted",
        transaction: {
          label: "Bound appearance style.",
          beforeDag: state.dag,
          afterDag,
          beforeSelection: state.selection,
          afterSelection: state.selection,
          beforeNavigationHistory: state.history,
          afterNavigationHistory: state.history,
          revisionBefore: state.editHistory.revision,
          revisionAfter: state.nextRevision,
        },
        renamedKeys: [],
        deletedKeys: [],
        status: `Saved ${action.reference} and bound metadata.style. Save the graph to persist this link.`,
      });
    }

    case "layoutReferenceBound": {
      if (!state.dag || action.generation !== state.document.generation) return state;
      if (state.dag.metadata?.layout === action.reference)
        return { ...state, ui: { ...state.ui, status: `Updated ${action.reference}.` } };
      const afterDag = { ...state.dag, metadata: { ...state.dag.metadata, layout: action.reference } };
      return reduceGraphState(state, {
        type: "graphCommandsCommitted",
        transaction: {
          label: "Bound layout.",
          beforeDag: state.dag,
          afterDag,
          beforeSelection: state.selection,
          afterSelection: state.selection,
          beforeNavigationHistory: state.history,
          afterNavigationHistory: state.history,
          revisionBefore: state.editHistory.revision,
          revisionAfter: state.nextRevision,
        },
        renamedKeys: [],
        deletedKeys: [],
        status: `Saved ${action.reference} and bound metadata.layout. Save the graph to persist this link.`,
      });
    }

    case "timelineLayoutCommitted": {
      if (
        state.chartType !== "timeline" ||
        !state.dag ||
        action.generation !== state.document.generation ||
        action.revision !== state.editHistory.revision ||
        action.beforeDag !== state.dag ||
        action.historyBase !== state.editHistory
      )
        return { ...state, ui: { ...state.ui, status: "Timeline changed. Arrange again." } };
      try {
        if (action.data.version !== 1 || !["ai", "algorithm"].includes(action.data.mode))
          throw new Error("Invalid layout mode.");
        return commitLayout(state, {
          ...state.layoutSession.data,
          renderings: { ...state.layoutSession.data.renderings, timeline: action.rendering },
          charts: {
            ...state.layoutSession.data.charts,
            timeline: {
              version: 1,
              mode: action.data.mode,
            },
          },
        });
      } catch (error) {
        return {
          ...state,
          ui: { ...state.ui, status: error instanceof Error ? error.message : "Invalid timeline layout." },
        };
      }
    }
    case "layoutSessionChanged": {
      if (action.generation !== state.document.generation || !state.dag) return state;
      try {
        const data = repairLayoutSession(parseLayoutSession(action.data), state.dag);
        return commitLayout(state, data);
      } catch (error) {
        return {
          ...state,
          layoutSession: {
            ...state.layoutSession,
            notice: error instanceof Error ? error.message : "Invalid layout.",
          },
        };
      }
    }
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
      const data = repairLayoutSession(state.layoutSession.data, action.transaction.afterDag, action.renamedKeys);
      const transaction = { ...action.transaction, beforeLayout: state.layoutSession.data, afterLayout: data };
      const undoStack = pushEditTransaction(state.editHistory.undoStack, transaction);
      const nextUi = applyBatchUiEffects(state.ui, action.renamedKeys, action.deletedKeys);

      return {
        ...state,
        dag: action.transaction.afterDag,
        nextRevision: revision + 1,
        source: { ...state.source, dirty: action.transaction.afterDag !== state.document.savedDag },
        layoutSession: { ...state.layoutSession, data },
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
      return commitLayout(state, {
        ...state.layoutSession.data,
        charts: { ...state.layoutSession.data.charts, "node-link": { method: action.mode } },
      });
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

function commitLayout(state: GraphAppState, data: LayoutSessionState): GraphAppState {
  if (!state.dag || JSON.stringify(data) === JSON.stringify(state.layoutSession.data)) return state;
  const revision = state.nextRevision;
  const transaction = {
    label: "Updated layout configuration.",
    beforeDag: state.dag,
    afterDag: state.dag,
    beforeLayout: state.layoutSession.data,
    afterLayout: data,
    beforeSelection: state.selection,
    afterSelection: state.selection,
    beforeNavigationHistory: state.history,
    afterNavigationHistory: state.history,
    revisionBefore: state.editHistory.revision,
    revisionAfter: revision,
  };
  return {
    ...state,
    layoutSession: { ...state.layoutSession, data, notice: "" },
    layout: { mode: data.charts["node-link"].method },
    nextRevision: revision + 1,
    editHistory: {
      ...state.editHistory,
      revision,
      undoStack: pushEditTransaction(state.editHistory.undoStack, transaction),
      redoStack: [],
    },
  };
}
