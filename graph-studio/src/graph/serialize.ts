import { indexGraphDocument } from "./graphIndex";
import type { GraphDocument, NodeKey, NormalizedDag } from "./types";

export function serializeDag(dag: NormalizedDag): GraphDocument {
  // structuredClone excludes non-enumerable node IDs and adjacency indexes.
  const document = structuredClone(dag);
  if (document.metadata && typeof document.metadata.layout !== "string") delete document.metadata.layout;
  return document;
}

export function cloneGraphDocument(dag: NormalizedDag): NormalizedDag {
  return indexGraphDocument(structuredClone(dag));
}

/** Project validated graph data without cloning hidden nodes or retaining containment edges. */
export function projectGraphDocument(source: NormalizedDag, visible: ReadonlySet<NodeKey>): NormalizedDag {
  const { hierarchy_edges: _hierarchy, ...document } = source;
  return cloneGraphDocument({
    ...document,
    nodes: Object.fromEntries(Object.entries(source.nodes).filter(([key]) => visible.has(key))),
    edges: source.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  });
}

export function serializeDagToJson(dag: NormalizedDag): string {
  return JSON.stringify(serializeDag(dag), null, 2);
}
