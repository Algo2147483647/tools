import type { NormalizedDag } from "../types";

export interface ImportGraphDocument {
  name: string;
  payload: unknown;
}
export type ConflictStrategy = "keep" | "merge" | "rename" | "replace";
export interface ConflictResolution {
  strategy: ConflictStrategy;
  name?: string;
}
export type ImportResolutions = Record<string, ConflictResolution>;
export interface ImportConflict {
  id: string;
  source: string;
  path: string;
  kind: "node" | "edge" | "field";
  existing: unknown;
  incoming: unknown;
  canMerge: boolean;
  canRename: boolean;
  canReplace?: boolean;
  resolution?: ConflictResolution;
}
export interface ImportAnalysis {
  dag: NormalizedDag;
  conflicts: ImportConflict[];
  unresolved: ImportConflict[];
  documentCount: number;
}
