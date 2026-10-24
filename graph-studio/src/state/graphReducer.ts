import { getSankeyError } from "../graph/sankey";
import { serializeDag } from "../graph/serialize";
import { normalizeDagInput } from "../graph/normalize";
import { COMPOUND_LAYOUT_VERSION, writeLayoutData } from "../layout/compound/layout-plan";
import { validateLayoutGeometry } from "../layout/compound/layout-quality";
import { validateLayoutConstraints } from "../layout/compound/layout-solver";
import { prepareGraphTransaction } from "./graphTransactions";
import { areSelectionsEqual } from "../graph/selectors";
import { getGraphChartLabel, getGraphLayoutLabel } from "../graph/types";
import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";
import { clampConsoleSidebarWidth } from "./preferences";
import { sanitizeTimelineSettings } from "../graph/timeline/settings";
import { parseTimelineLayoutPlan, writeTimelineLayout } from "../graph/timeline/layoutData";

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
        const document = serializeDag(state.dag);
        writeTimelineLayout(document, { version: 1, mode: action.data.mode, ...(plan ? { plan } : {}) });
        const transaction = prepareGraphTransaction(
          state,
          [{ dag: normalizeDagInput(document), changedKeys: [] }],
          action.data.mode === "ai" ? "Using AI timeline layout." : "Using Algorithm timeline layout.",
        );
        return transaction ? reduceGraphState(state, transaction) : state;
      } catch (error) {
        return {
          ...state,
          ui: { ...state.ui, status: error instanceof Error ? error.message : "Invalid timeline layout." },
        };
      }
    }
    case "compoundLayoutCommitted": {
      if (
        state.chartType !== "compound" ||
        action.generation !== state.document.generation ||
        action.revision !== state.editHistory.revision ||
        action.beforeDag !== state.dag ||
        action.historyBase !== state.editHistory
      )
        return { ...state, ui: { ...state.ui, status: "Layout candidate is stale. Generate a new preview." } };
      const validation = validateLayoutGeometry(action.problem, action.candidate.snapshot);
      const errors = [
        ...validation.errors,
        ...validateLayoutConstraints(action.problem, action.candidate.snapshot, action.candidate.data, action.intent),
      ];
      if (errors.length) return { ...state, ui: { ...state.ui, status: `Layout rejected: ${errors[0]}` } };
      const document = serializeDag(state.dag!);
      writeLayoutData(document, {
        ...action.candidate.data,
        accepted: {
          fingerprint: action.problem.fingerprint,
          engineVersion: COMPOUND_LAYOUT_VERSION,
          snapshot: action.candidate.snapshot,
        },
      });
      const transaction = prepareGraphTransaction(
        state,
        [{ dag: normalizeDagInput(document), changedKeys: [] }],
        "Applied compound layout.",
      );
      return transaction ? reduceGraphState(state, transaction) : state;
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
    case "undoRequested":
      return traverseEditHistory(state, "undo");
    case "redoRequested":
      return traverseEditHistory(state, "redo");
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
