import { type HierarchyCommand } from "../compound/hierarchy";
import { type NodeKey, type NormalizedDag, type RelationValue } from "../types";

export type GraphCommand =
  | HierarchyCommand
  | { type: "renameNode"; oldKey: NodeKey; newKey: NodeKey }
  | { type: "deleteNode"; key: NodeKey }
  | { type: "deleteSubtree"; rootKey: NodeKey }
  | { type: "addNode"; key: NodeKey; parentKey?: NodeKey }
  | { type: "addNodeFromFields"; key: NodeKey; fields: Record<string, unknown>; parentKey?: NodeKey }
  | { type: "copyNode"; sourceKey: NodeKey; key: NodeKey; parentKey?: NodeKey }
  | { type: "updateNodeFields"; key: NodeKey; nextKey?: NodeKey; fields: Record<string, unknown> }
  | { type: "setEdge"; parentKey: NodeKey; childKey: NodeKey; weight?: RelationValue }
  | { type: "removeEdge"; parentKey: NodeKey; childKey: NodeKey }
  | { type: "setParents"; key: NodeKey; parents: NodeKey[] }
  | { type: "setChildren"; key: NodeKey; children: NodeKey[] }
  | { type: "setParentRelations"; key: NodeKey; parents: Record<NodeKey, RelationValue> }
  | { type: "setChildRelations"; key: NodeKey; children: Record<NodeKey, RelationValue> };

export interface CommandResult {
  dag: NormalizedDag;
  changedKeys: NodeKey[];
  deletedKeys?: NodeKey[];
  renamedKey?: { from: NodeKey; to: NodeKey };
  message?: string;
}
