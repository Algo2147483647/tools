import type {
  GraphChartType,
  GraphLayoutMode,
  GraphMode,
  GraphSelection,
  NodeKey,
  NormalizedDag,
} from "../graph/types";
import { type GraphPagePreferences, getInitialGraphPagePreferences } from "./preferences";
import type { GraphContextMenu } from "./contextMenu";

export interface EditTransaction {
  label: string;
  beforeDag: NormalizedDag;
  afterDag: NormalizedDag;
  beforeSelection: GraphSelection | null;
  afterSelection: GraphSelection | null;
  beforeNavigationHistory: GraphSelection[];
  afterNavigationHistory: GraphSelection[];
  revisionBefore: number;
  revisionAfter: number;
}

export interface GraphAppState {
  dag: NormalizedDag | null;
  document: { id: string; generation: number; savedDag: NormalizedDag | null };
  nextRevision: number;
  source: {
    fileName: string;
    fileHandle: FileSystemFileHandle | null;
    dirty: boolean;
  };
  selection: GraphSelection | null;
  history: GraphSelection[];
  editHistory: {
    undoStack: EditTransaction[];
    redoStack: EditTransaction[];
    revision: number;
    savedRevision: number;
  };
  mode: GraphMode;
  chartType: GraphChartType;
  layout: {
    mode: GraphLayoutMode;
  };
  zoom: {
    scale: number;
    minScale: number;
    maxScale: number;
  };
  ui: {
    status: string;
    settingsOpen: boolean;
    consoleSidebarOpen: boolean;
    consoleSidebarWidth: number;
    contextMenu: GraphContextMenu | null;
    relationEditor: null | { nodeKey: NodeKey; field: "parents" | "children" };
    nodeDetail: null | { nodeKey: NodeKey };
    saveDialogOpen: boolean;
  };
}

export function createInitialGraphState(
  savedPreferences: GraphPagePreferences = getInitialGraphPagePreferences(),
): GraphAppState {
  return {
    dag: null,
    document: { id: "", generation: 0, savedDag: null },
    nextRevision: 1,
    source: {
      fileName: "",
      fileHandle: null,
      dirty: false,
    },
    selection: null,
    history: [],
    editHistory: {
      undoStack: [],
      redoStack: [],
      revision: 0,
      savedRevision: 0,
    },
    mode: savedPreferences.mode,
    chartType: savedPreferences.chartType,
    layout: {
      mode: savedPreferences.layoutMode,
    },
    zoom: {
      scale: 1,
      minScale: 1,
      maxScale: Number.POSITIVE_INFINITY,
    },
    ui: {
      status: "Open a graph file or a workspace to get started.",
      settingsOpen: false,
      consoleSidebarOpen: savedPreferences.consoleSidebarOpen,
      consoleSidebarWidth: savedPreferences.consoleSidebarWidth,
      contextMenu: null,
      relationEditor: null,
      nodeDetail: null,
      saveDialogOpen: false,
    },
  };
}

export const initialGraphAppState = createInitialGraphState();
