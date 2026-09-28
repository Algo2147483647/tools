import type { FieldMapping } from "./fieldMapping";
import { indexGraphDocument } from "./graphIndex";
import type { GraphDocument, NormalizedDag } from "./types";

export function serializeDag(dag: NormalizedDag, _mapping?: FieldMapping): GraphDocument {
  // structuredClone excludes non-enumerable node IDs and adjacency indexes.
  return structuredClone(dag);
}

export function structuredCloneValue<T>(value: T): T {
  const clone = structuredClone(value);
  if (clone && typeof clone === "object" && "format" in clone && clone.format === "graph-studio" && "nodes" in clone && "edges" in clone) {
    indexGraphDocument(clone as unknown as NormalizedDag);
  }
  return clone;
}
