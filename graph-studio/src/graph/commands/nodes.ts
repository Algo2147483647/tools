import { pruneHierarchyEdges } from "../compound/hierarchy";
import { getSpaceMetadata } from "../space";
import { getTimelineClock, type TimelineClock } from "../timeline/clock";
import { getTimelineEditError } from "../timeline/editing";
import { collectDescendantKeys } from "../traversal";
import { type NodeKey, type NormalizedDag } from "../types";

import type { CommandContext } from "./context";
import type { GraphCommand } from "./types";
export type NodeCommand = Extract<
  GraphCommand,
  {
    type:
      "renameNode" | "deleteNode" | "deleteSubtree" | "addNode" | "addNodeFromFields" | "copyNode" | "updateNodeFields";
  }
>;
export function isNodeCommand(command: GraphCommand): command is NodeCommand {
  return [
    "renameNode",
    "deleteNode",
    "deleteSubtree",
    "addNode",
    "addNodeFromFields",
    "copyNode",
    "updateNodeFields",
  ].includes(command.type);
}
export function applyNodeCommand(context: CommandContext, command: NodeCommand): void {
  const {
    source,
    document,
    timelineReferenceTime,
    defaultRelationValue,
    nodes,
    result,
    requireNode,
    requireNew,
    putNode,
    rename,
    setEdge,
  } = context;
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
  }
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
