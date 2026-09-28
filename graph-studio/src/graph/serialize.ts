import type { FieldMapping } from "./fieldMapping";
import { indexGraphDocument } from "./graphIndex";
import type { GraphDocument, NormalizedDag } from "./types";

export function serializeDag(dag: NormalizedDag, _mapping?: FieldMapping): GraphDocument {
  // structuredClone excludes non-enumerable node IDs and adjacency indexes.
  return structuredClone(dag);
}

export function structuredCloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function cloneGraphDocument(dag: NormalizedDag): NormalizedDag {
  return indexGraphDocument(structuredClone(dag));
}
