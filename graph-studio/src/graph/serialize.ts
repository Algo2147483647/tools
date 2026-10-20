import { indexGraphDocument } from "./graphIndex";
import type { GraphDocument, NormalizedDag } from "./types";

export function serializeDag(dag: NormalizedDag): GraphDocument {
  // structuredClone excludes non-enumerable node IDs and adjacency indexes.
  return structuredClone(dag);
}

export function cloneGraphDocument(dag: NormalizedDag): NormalizedDag {
  return indexGraphDocument(structuredClone(dag));
}
