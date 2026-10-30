import { defaultLayoutSession, type LayoutSessionState } from "../../schema/layoutSession";
import type {
  GraphChartType,
  GraphLayoutMode,
  GraphMode,
  GraphSelection,
  NodeKey,
  NormalizedDag,
} from "../../graph/types";
import { type GraphPagePreferences, getInitialGraphPagePreferences } from "../preferences/preferences";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { ChartStyle } from "../../schema/appearance/styles";

export interface EditTransaction {
  label: string;
  beforeStyles?: Partial<Record<GraphChartType, ChartStyle>>;
  afterStyles?: Partial<Record<GraphChartType, ChartStyle>>;
  beforeTimeline?: TimelineViewSettings;
  afterTimeline?: TimelineViewSettings;
  beforeLayout?: LayoutSessionState;
  afterLayout?: LayoutSessionState;
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
  documentStyles: Partial<Record<GraphChartType, ChartStyle>>;
  layoutSession: { data: LayoutSessionState; notice: string };
  timelineSettings: TimelineViewSettings;
  dag: NormalizedDag | null;
  document: {
    id: string;
    generation: number;
    savedDag: NormalizedDag | null;
    linkedStyle?: ChartStyle;
    linkedChartType?: GraphChartType;
  };
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
    nodeDetail: null | { nodeKey: NodeKey };
    saveDialogOpen: boolean;
  };
}

export function createInitialGraphState(
  savedPreferences: GraphPagePreferences = getInitialGraphPagePreferences(),
): GraphAppState {
  return {
    documentStyles: {},
    layoutSession: { data: defaultLayoutSession(), notice: "" },
    timelineSettings: savedPreferences.chartStyles.timeline.style.timeline!,
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
      nodeDetail: null,
      saveDialogOpen: false,
    },
  };
}

export const initialGraphAppState = createInitialGraphState();
