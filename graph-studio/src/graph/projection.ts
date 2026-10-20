import { cloneGraphDocument } from "./serialize";
import type { NodeKey, NormalizedDag } from "./types";

/** Project validated graph data without cloning hidden nodes or retaining containment edges. */
export function projectGraphDocument(source: NormalizedDag, visible: ReadonlySet<NodeKey>): NormalizedDag {
  const { hierarchy_edges: _hierarchy, ...document } = source;
  return cloneGraphDocument({
    ...document,
    nodes: Object.fromEntries(Object.entries(source.nodes).filter(([key]) => visible.has(key))),
    edges: source.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  });
}
