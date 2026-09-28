import { DEFAULT_RELATION_VALUE, type NormalizedDag, type RelationValue } from "./types";

// Non-enumerable read-only projections: edges are the only stored relation data.
export function indexGraphDocument(dag: NormalizedDag): NormalizedDag {
  Object.setPrototypeOf(dag.nodes, null);
  const incoming = new Map<string, Record<string, RelationValue>>();
  const outgoing = new Map<string, Record<string, RelationValue>>();
  for (const key of Object.keys(dag.nodes)) { incoming.set(key, Object.create(null)); outgoing.set(key, Object.create(null)); }
  for (const edge of dag.edges) {
    const value = edge.value === undefined ? DEFAULT_RELATION_VALUE : edge.value;
    outgoing.get(edge.source)![edge.target] = value;
    incoming.get(edge.target)![edge.source] = value;
  }
  for (const [key, node] of Object.entries(dag.nodes)) {
    Object.defineProperties(node, {
      key: { value: key, enumerable: false, configurable: true },
      parents: { get: () => incoming.get(key), enumerable: false, configurable: true },
      children: { get: () => outgoing.get(key), enumerable: false, configurable: true },
    });
    Object.freeze(incoming.get(key));
    Object.freeze(outgoing.get(key));
  }
  return dag;
}
