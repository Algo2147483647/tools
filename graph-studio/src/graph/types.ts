export type NodeKey = string;

export type RelationValue = string | number | boolean | null;

export type RelationField = NodeKey[] | Record<NodeKey, RelationValue>;

export interface RawGraphNode {
  key?: NodeKey;
  [field: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: NodeKey;
  target: NodeKey;
  value?: RelationValue;
  metadata?: Record<string, unknown>;
}

export interface GraphDocument {
  format: "graph-studio";
  version: 2;
  diagram?: "dag" | "sankey";
  id?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  nodes: Record<NodeKey, RawGraphNode>;
  edges: GraphEdge[];
}

export type RawGraphInput = GraphDocument;

export interface DagNode extends RawGraphNode {
  key: NodeKey;
}

export interface NormalizedDag extends GraphDocument {
  nodes: Record<NodeKey, DagNode>;
}

export type GraphSelection =
  | { type: "node"; key: NodeKey }
  | { type: "full" }
  | { type: "forest"; keys: NodeKey[]; label: string };

export type GraphMode = "edit";

export type GraphLayoutMode = "level" | "sugiyama" | "dagre" | "sankey";

export function getGraphLayoutLabel(mode: GraphLayoutMode): string {
  switch (mode) {
    case "sankey":
      return "Sankey flow";
    case "sugiyama":
      return "Sugiyama layered";
    case "dagre":
      return "Dagre layered";
    default:
      return "Level layout";
  }
}

export type GraphTitleFontStyle = "normal" | "italic";
export type GraphTitleFontWeight = 400 | 700;

export const GRAPH_TITLE_FONT_OPTIONS = [
  { label: "Georgia", value: "\"Georgia\", serif" },
  { label: "Times", value: "\"Times New Roman\", serif" },
  { label: "Sans", value: "\"IBM Plex Sans\", \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif" },
  { label: "Display", value: "\"Cormorant Garamond\", \"Georgia\", serif" },
  { label: "Mono", value: "\"IBM Plex Mono\", \"SFMono-Regular\", Consolas, monospace" },
] as const;

export type GraphTitleFontFamily = typeof GRAPH_TITLE_FONT_OPTIONS[number]["value"];

export const DEFAULT_RELATION_VALUE: RelationValue = "related_to";
