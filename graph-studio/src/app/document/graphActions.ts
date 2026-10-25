import type { GraphChartType, GraphLayoutMode, GraphSelection, NodeKey, NormalizedDag } from "../../graph/types";
import type { EditTransaction } from "./initialState";
import type { GraphContextTarget } from "../ui/contextMenu";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { ChartStyle } from "../../schema/appearance/styles";

export type GraphAction =
  | {
      type: "timelineLayoutCommitted";
      generation: number;
      revision: number;
      beforeDag: NormalizedDag;
      historyBase: import("./initialState").GraphAppState["editHistory"];
      data: import("../../graph/timeline/layoutData").TimelineLayoutData;
    }
  | { type: "layoutDocumentChanged"; generation: number; data: import("../../schema/layoutProtocol").LayoutDocument; source?: string }
  | { type: "layoutDocumentSaved"; generation: number; data: import("../../schema/layoutProtocol").LayoutDocument; source: string }
  | { type: "timelineSettingsChanged"; patch: Partial<TimelineViewSettings> }
  | { type: "graphClosed"; status: string }
  | {
      type: "graphLoaded";
      linkedStyle?: ChartStyle;
      linkedLayout?: import("../../schema/layoutProtocol").LayoutDocument;
      layoutSource?: string;
      layoutNotice?: string;
      documentId: string;
      dag: NormalizedDag;
      fileName: string;
      fileHandle?: FileSystemFileHandle | null;
      selection: GraphSelection;
      status: string;
    }
  | {
      type: "canvasInitialized";
      documentId: string;
      dag: NormalizedDag;
      fileName: string;
      selection: GraphSelection;
      status: string;
    }
  | {
      type: "graphCommandsCommitted";
      transaction: EditTransaction;
      renamedKeys: Array<{ from: NodeKey; to: NodeKey }>;
      deletedKeys: NodeKey[];
      status: string;
    }
  | { type: "undoRequested" }
  | { type: "redoRequested" }
  | { type: "selectionChanged"; selection: GraphSelection; pushHistory?: boolean }
  | { type: "navigateBack" }
  | { type: "layoutModeChanged"; mode: GraphLayoutMode }
  | { type: "chartTypeChanged"; chartType: GraphChartType }
  | { type: "zoomChanged"; scale: number; minScale?: number }
  | { type: "settingsToggled"; open?: boolean }
  | { type: "consoleSidebarToggled"; open?: boolean }
  | { type: "consoleSidebarWidthChanged"; width: number }
  | { type: "contextMenuOpened"; x: number; y: number; target: GraphContextTarget }
  | { type: "contextMenuClosed" }
  | { type: "relationEditorOpened"; nodeKey: NodeKey; field: "parents" | "children" }
  | { type: "nodeDetailOpened"; nodeKey: NodeKey }
  | { type: "modalClosed" }
  | { type: "saveDialogOpened" }
  | { type: "saveDialogClosed" }
  | { type: "saved"; generation: number; revision: number; dag: NormalizedDag; status: string }
  | { type: "savedAsCopy"; status: string }
  | { type: "statusChanged"; status: string };
