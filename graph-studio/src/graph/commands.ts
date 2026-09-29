import { getNodeChildKeys } from "./accessors";
import { getDefaultFieldMapping, type FieldMapping } from "./fieldMapping";
import { serializeDag } from "./serialize";
import { normalizeDagInput, validateNodeKey, validateNodeFields } from "./normalize";
import { DEFAULT_RELATION_VALUE, type NormalizedDag, type NodeKey, type RelationValue, type GraphEdge } from "./types";

export type GraphCommand =
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

export function applyGraphCommand(source: NormalizedDag, command: GraphCommand, mapping: FieldMapping = getDefaultFieldMapping()): CommandResult {
  const document = serializeDag(source);
  const defaultRelationValue = document.diagram === "sankey" ? 1 : DEFAULT_RELATION_VALUE;
  const nodes = document.nodes;
  const result: Omit<CommandResult, "dag"> = { changedKeys: [] };
  const exists = (key: string) => Object.prototype.hasOwnProperty.call(nodes, key);
  const requireNode = (key: string) => { if (!exists(key)) throw new Error(`Node "${key}" does not exist.`); };
  const requireNew = (key: string, current?: string) => {
    validateNodeKey(key);
    if (key !== current && exists(key)) throw new Error(`Node key "${key}" already exists.`);
  };
  const putNode = (key: string, fields: Record<string, unknown>) => {
    validateNodeFields(fields, `/nodes/${key}`);
    Object.defineProperty(nodes, key, { value: structuredClone(fields), enumerable: true, writable: true, configurable: true });
  };
  const rename = (oldKey: string, key: string) => {
    requireNode(oldKey); requireNew(key, oldKey);
    if (oldKey === key) return;
    putNode(key, nodes[oldKey]); delete nodes[oldKey];
    document.edges.forEach(edge => {
      if (edge.source === oldKey) edge.source = key;
      if (edge.target === oldKey) edge.target = key;
    });
    result.renamedKey = { from: oldKey, to: key };
  };
  const setEdge = (source: string, target: string, value: RelationValue) => {
    requireNode(source); requireNode(target);
    if (source === target) throw new Error("A node cannot reference itself.");
    const edge = document.edges.find(edge => edge.source === source && edge.target === target);
    if (edge) edge.value = value;
    else document.edges.push({ id: newEdgeId(document.edges), source, target, value });
  };
  switch (command.type) {
    case "renameNode":
      rename(command.oldKey, command.newKey); result.message = `Renamed node ${command.oldKey} to ${command.newKey}.`; break;
    case "deleteNode":
    case "deleteSubtree": {
      const keys = command.type === "deleteNode" ? [command.key] : collectSubtreeNodeKeys(source, command.rootKey, mapping);
      keys.forEach(requireNode);
      const removed = new Set(keys);
      keys.forEach(key => delete nodes[key]);
      document.edges = document.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target));
      result.deletedKeys = keys; result.message = `Deleted ${keys.length} node(s).`; break;
    }
    case "addNode":
    case "addNodeFromFields":
    case "copyNode": {
      requireNew(command.key);
      if (command.type === "copyNode") requireNode(command.sourceKey);
      const fields = command.type === "copyNode" ? nodes[command.sourceKey] : command.type === "addNodeFromFields" ? command.fields : { define: "", type: "" };
      putNode(command.key, fields);
      if (command.parentKey) setEdge(command.parentKey, command.key, defaultRelationValue);
      result.message = `Added node ${command.key}.`; break;
    }
    case "updateNodeFields": {
      const key = command.nextKey ?? command.key;
      rename(command.key, key);
      putNode(key, command.fields);
      result.message = `Saved node ${key}.`; break;
    }
    case "setEdge":
      setEdge(command.parentKey, command.childKey, command.weight === undefined ? defaultRelationValue : command.weight);
      result.message = `Updated edge ${command.parentKey} -> ${command.childKey}.`; break;
    case "removeEdge": {
      requireNode(command.parentKey); requireNode(command.childKey);
      const count = document.edges.length;
      document.edges = document.edges.filter(edge => edge.source !== command.parentKey || edge.target !== command.childKey);
      if (count === document.edges.length) throw new Error("Edge does not exist.");
      result.message = "Removed edge."; break;
    }
    default: {
      requireNode(command.key);
      const parents = command.type === "setParents" || command.type === "setParentRelations";
      const oldEdges = document.edges.filter(edge => (parents ? edge.target : edge.source) === command.key);
      const values = command.type === "setParents" ? command.parents : command.type === "setChildren" ? command.children : command.type === "setParentRelations" ? command.parents : command.children;
      const relations = Array.isArray(values)
        ? Object.fromEntries(values.map(key => {
            const value = oldEdges.find(edge => (parents ? edge.source : edge.target) === key)?.value;
            return [key, value === undefined ? defaultRelationValue : value];
          }))
        : values;
      for (const [key, value] of Object.entries(relations)) setEdge(parents ? key : command.key, parents ? command.key : key, value);
      document.edges = document.edges.filter(edge => (parents ? edge.target : edge.source) !== command.key || Object.prototype.hasOwnProperty.call(relations, parents ? edge.source : edge.target));
      result.message = `Updated ${parents ? "parents" : "children"} for ${command.key}.`;
    }
  }
  const dag = normalizeDagInput(document);
  return { ...result, dag, changedKeys: Object.keys(dag.nodes) };
}

export function newEdgeId(edges: GraphEdge[]): string {
  const used = new Set(edges.map(edge => edge.id));
  let n = edges.length + 1;
  while (used.has(`edge-${n}`)) n++;
  return `edge-${n}`;
}

export function collectSubtreeNodeKeys(dag: NormalizedDag, root: NodeKey, mapping: FieldMapping = getDefaultFieldMapping()): NodeKey[] {
  const seen = new Set<NodeKey>();
  const stack = [root];
  while (stack.length) {
    const key = stack.pop()!;
    if (seen.has(key) || !Object.prototype.hasOwnProperty.call(dag.nodes, key)) continue;
    seen.add(key);
    stack.push(...getNodeChildKeys(dag.nodes[key], mapping));
  }
  return [...seen];
}
