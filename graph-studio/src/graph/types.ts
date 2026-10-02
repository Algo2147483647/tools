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

export interface DagNode extends RawGraphNode {
  key: NodeKey;
}

export interface NormalizedDag extends GraphDocument {
  nodes: Record<NodeKey, DagNode>;
}

export type GraphSelection =
  { type: "node"; key: NodeKey } | { type: "full" } | { type: "forest"; keys: NodeKey[]; label: string };

export type GraphMode = "edit";

export type GraphChartType = "node-link" | "sankey";

export type GraphLayoutMode = "level" | "sugiyama" | "dagre";

/** Internal rendering pipeline; Sankey is a chart type, not a node-link layout. */
export type GraphRenderMode = GraphLayoutMode | "sankey";

export function getGraphChartLabel(type: GraphChartType): string {
  return type === "sankey" ? "Sankey" : "Node-link";
}

export function getGraphRenderMode(type: GraphChartType, layout: GraphLayoutMode): GraphRenderMode {
  return type === "sankey" ? "sankey" : layout;
}

export function getGraphLayoutLabel(mode: GraphRenderMode): string {
  switch (mode) {
    case "sankey":
      return "Sankey flow";
    case "sugiyama":
      return "Sugiyama layered";
    case "dagre":
      return "Dagre layered";
    default:
      return "BFS levels";
  }
}

export const GRAPH_TITLE_FONT_OPTIONS = [
  { label: "Georgia", value: '"Georgia", serif' },
  { label: "Times", value: '"Times New Roman", serif' },
  { label: "Sans", value: '"IBM Plex Sans", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: "Display", value: '"Cormorant Garamond", "Georgia", serif' },
  { label: "Mono", value: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace' },
] as const;

export const DEFAULT_RELATION_VALUE: RelationValue = "related_to";
