import { getSpaceMetadata } from "./space";
import { repairLayoutData } from "../layout/compound-layout-plan";
import { repairTimelineLayout } from "./timelineLayout";
import { getTimelineClock, type TimelineClock } from "./timelineClock";
import { nextEdgeId } from "./relations";
import { normalizeDagInput, validateNodeFields, validateNodeKey } from "./normalize";
import { serializeDag } from "./serialize";
import { applyHierarchyCommand, pruneHierarchyEdges, type HierarchyCommand } from "./hierarchy";
import { collectDescendantKeys } from "./traversal";
import { getTimelineEditError, getTimelineReferenceTime } from "./timelineEditing";
import { type NodeKey, type NormalizedDag, type RelationValue, DEFAULT_RELATION_VALUE } from "./types";

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

export function applyGraphCommand(source: NormalizedDag, command: GraphCommand): CommandResult {
  const document = serializeDag(source);
  const timelineReferenceTime = getTimelineReferenceTime(document);
  if (
    command.type === "groupCreate" ||
    command.type === "groupMove" ||
    command.type === "groupRename" ||
    command.type === "groupDissolve"
  ) {
    applyHierarchyCommand(document, command);
    repairLayoutData(document, source);
    repairTimelineLayout(document);
    return { dag: normalizeDagInput(document), changedKeys: [], message: "Updated subgraph hierarchy." };
  }
  const defaultRelationValue = document.diagram === "sankey" ? 1 : DEFAULT_RELATION_VALUE;
  const nodes = document.nodes;
  const result: Omit<CommandResult, "dag"> = { changedKeys: [] };
  const exists = (key: string) => Object.prototype.hasOwnProperty.call(nodes, key);
  const requireNode = (key: string) => {
    if (!exists(key)) throw new Error(`Node "${key}" does not exist.`);
  };
  const requireNew = (key: string, current?: string) => {
    validateNodeKey(key);
    if (key !== current && exists(key)) throw new Error(`Node key "${key}" already exists.`);
  };
  const putNode = (key: string, fields: Record<string, unknown>) => {
    validateNodeFields(fields, `/nodes/${key}`);
    Object.defineProperty(nodes, key, {
      value: structuredClone(fields),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };
  const rename = (oldKey: string, key: string) => {
    requireNode(oldKey);
    requireNew(key, oldKey);
    if (oldKey === key) return;
    putNode(key, nodes[oldKey]);
    delete nodes[oldKey];
    [...document.edges, ...(document.hierarchy_edges ?? [])].forEach((edge) => {
      if (edge.source === oldKey) edge.source = key;
      if (edge.target === oldKey) edge.target = key;
    });
    result.renamedKey = { from: oldKey, to: key };
  };
  const setEdge = (source: string, target: string, value: RelationValue) => {
    requireNode(source);
    requireNode(target);
    if (source === target) throw new Error("A node cannot reference itself.");
    const edge = document.edges.find((edge) => edge.source === source && edge.target === target);
    if (edge) edge.value = value;
    else {
      const id = nextEdgeId(new Set(document.edges.map((edge) => edge.id)), document.edges.length + 1);
      document.edges.push({ id, source, target, value });
    }
  };
  switch (command.type) {
    case "renameNode":
      rename(command.oldKey, command.newKey);
      result.message = `Renamed node ${command.oldKey} to ${command.newKey}.`;
      break;
    case "deleteNode":
    case "deleteSubtree": {
      const keys = command.type === "deleteNode" ? [command.key] : collectSubtreeNodeKeys(source, command.rootKey);
      keys.forEach(requireNode);
      const removed = new Set(keys);
      keys.forEach((key) => delete nodes[key]);
      document.edges = document.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
      result.deletedKeys = keys;
      pruneHierarchyEdges(document);
      result.message = `Deleted ${keys.length} node(s).`;
      break;
    }
    case "addNode":
    case "addNodeFromFields":
    case "copyNode": {
      requireNew(command.key);
      if (command.type === "copyNode") requireNode(command.sourceKey);
      const fields =
        command.type === "copyNode"
          ? nodes[command.sourceKey]
          : command.type === "addNodeFromFields"
            ? command.fields
            : {
                define: "",
                type: "",
                ...(getSpaceMetadata(document) ? { space: Array(getSpaceMetadata(document)!.dimensions).fill(0) } : {}),
              };
      if (command.type === "addNodeFromFields")
        validateEventFields(undefined, fields, timelineReferenceTime, getTimelineClock(document.metadata));
      putNode(command.key, fields);
      if (command.parentKey) setEdge(command.parentKey, command.key, defaultRelationValue);
      result.message = `Added node ${command.key}.`;
      break;
    }
    case "updateNodeFields": {
      const key = command.nextKey ?? command.key;
      validateEventFields(
        nodes[command.key],
        command.fields,
        timelineReferenceTime,
        getTimelineClock(document.metadata),
      );
      rename(command.key, key);
      putNode(key, command.fields);
      result.message = `Saved node ${key}.`;
      break;
    }
    case "setEdge":
      setEdge(
        command.parentKey,
        command.childKey,
        command.weight === undefined ? defaultRelationValue : command.weight,
      );
      result.message = `Updated edge ${command.parentKey} -> ${command.childKey}.`;
      break;
    case "removeEdge": {
      requireNode(command.parentKey);
      requireNode(command.childKey);
      const count = document.edges.length;
      document.edges = document.edges.filter(
        (edge) => edge.source !== command.parentKey || edge.target !== command.childKey,
      );
      if (count === document.edges.length) throw new Error("Edge does not exist.");
      result.message = "Removed edge.";
      break;
    }
    default: {
      requireNode(command.key);
      const parents = command.type === "setParents" || command.type === "setParentRelations";
      const oldEdges = document.edges.filter((edge) => (parents ? edge.target : edge.source) === command.key);
      const values =
        command.type === "setParents"
          ? command.parents
          : command.type === "setChildren"
            ? command.children
            : command.type === "setParentRelations"
              ? command.parents
              : command.children;
      const relations = Array.isArray(values)
        ? Object.fromEntries(
            values.map((key) => {
              const value = oldEdges.find((edge) => (parents ? edge.source : edge.target) === key)?.value;
              return [key, value === undefined ? defaultRelationValue : value];
            }),
          )
        : values;
      for (const [key, value] of Object.entries(relations))
        setEdge(parents ? key : command.key, parents ? command.key : key, value);
      document.edges = document.edges.filter(
        (edge) =>
          (parents ? edge.target : edge.source) !== command.key ||
          Object.prototype.hasOwnProperty.call(relations, parents ? edge.source : edge.target),
      );
      result.message = `Updated ${parents ? "parents" : "children"} for ${command.key}.`;
    }
  }
  repairLayoutData(document, source, result.renamedKey);
  repairTimelineLayout(document, result.renamedKey);
  const dag = normalizeDagInput(document);
  return { ...result, dag, changedKeys: Object.keys(dag.nodes) };
}

function validateEventFields(
  previous: Record<string, unknown> | undefined,
  fields: Record<string, unknown>,
  referenceTime?: number,
  clock?: TimelineClock,
) {
  const error = getTimelineEditError(previous, fields, referenceTime, clock);
  if (error) throw new Error(error);
}

export function collectSubtreeNodeKeys(dag: NormalizedDag, root: NodeKey): NodeKey[] {
  return collectDescendantKeys(dag.nodes, [root]);
}
