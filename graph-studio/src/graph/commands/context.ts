import { validateNodeFields, validateNodeKey } from "../normalize";
import { nextEdgeId } from "../relations";
import { DEFAULT_RELATION_VALUE, type NormalizedDag, type RelationValue } from "../types";

import type { GraphDocument } from "../types";
import type { CommandResult } from "./types";
export function createCommandContext(source: NormalizedDag, document: GraphDocument, timelineReferenceTime?: number) {
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

  return {
    source,
    document,
    timelineReferenceTime,
    defaultRelationValue,
    nodes,
    result,
    exists,
    requireNode,
    requireNew,
    putNode,
    rename,
    setEdge,
  };
}
export type CommandContext = ReturnType<typeof createCommandContext>;
