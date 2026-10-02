import { indexGraphDocument } from "./graphIndex";
import { validateHierarchy } from "./hierarchy";
import { getSankeyError } from "./sankey";
import type { GraphDocument, NormalizedDag, RawGraphNode } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateNodeKey(key: unknown, path = "Node ID"): asserts key is string {
  if (typeof key !== "string" || !key || key.trim() !== key || /[\r\n,]/.test(key)) {
    throw new Error(`${path} must be a non-empty string without surrounding spaces, commas or line breaks.`);
  }
}

export function validateNodeFields(value: unknown, path: string): asserts value is RawGraphNode {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  for (const name of ["key", "parents", "children"]) {
    if (Object.prototype.hasOwnProperty.call(value, name))
      throw new Error(`${path}/${name} is not allowed. Store node IDs in nodes keys and relationships in edges.`);
  }
  for (const name of ["title", "define", "type"]) {
    if (value[name] !== undefined && typeof value[name] !== "string")
      throw new Error(`${path}/${name} must be a string.`);
  }
  validateJsonValue(value, path);
}

export function validateJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => validateJsonValue(item, `${path}/${i}`));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validateJsonValue(item, `${path}/${key}`));
    return;
  }
  throw new Error(`${path} must contain JSON values only.`);
}

export function normalizeDagInput(input: unknown): NormalizedDag {
  if (!isRecord(input) || input.format !== "graph-studio" || input.version !== 3) {
    throw new Error('Unsupported graph format. Expected format "graph-studio", version 3, with nodes and edges.');
  }
  const allowed = new Set(["format", "version", "diagram", "id", "title", "metadata", "nodes", "edges", "hierarchy"]);
  if (input.diagram !== undefined && input.diagram !== "dag" && input.diagram !== "sankey")
    throw new Error('/diagram must be "dag" or "sankey".');
  for (const name of Object.keys(input))
    if (!allowed.has(name)) throw new Error(`Unknown document field /${name}. Put custom document fields in metadata.`);
  for (const name of ["id", "title"])
    if (input[name] !== undefined && typeof input[name] !== "string") throw new Error(`/${name} must be a string.`);
  if (input.metadata !== undefined && !isRecord(input.metadata)) throw new Error("/metadata must be an object.");
  if (!isRecord(input.nodes)) throw new Error("/nodes must be an object keyed by node ID.");
  if (!Array.isArray(input.edges)) throw new Error("/edges must be an array.");
  const nodes = input.nodes;
  Object.entries(nodes).forEach(([key, node]) => {
    validateNodeKey(key, `/nodes/${key}`);
    validateNodeFields(node, `/nodes/${key}`);
  });
  const ids = new Set<string>();
  const pairs = new Set<string>();
  input.edges.forEach((edge, i) => {
    const path = `/edges/${i}`;
    if (!isRecord(edge)) throw new Error(`${path} must be an object.`);
    for (const name of Object.keys(edge))
      if (!["id", "source", "target", "value", "metadata"].includes(name))
        throw new Error(`Unknown edge field ${path}/${name}. Put custom fields in metadata.`);
    validateNodeKey(edge.id, `${path}/id`);
    validateNodeKey(edge.source, `${path}/source`);
    validateNodeKey(edge.target, `${path}/target`);
    if (ids.has(edge.id)) throw new Error(`${path}: duplicate edge ID "${edge.id}".`);
    ids.add(edge.id);
    if (
      !Object.prototype.hasOwnProperty.call(nodes, edge.source) ||
      !Object.prototype.hasOwnProperty.call(nodes, edge.target)
    )
      throw new Error(`${path}: edge endpoints must exist in nodes.`);
    if (edge.source === edge.target) throw new Error(`${path}: self-loops are not supported.`);
    const pair = JSON.stringify([edge.source, edge.target]);
    if (pairs.has(pair)) throw new Error(`${path}: duplicate directed edge ${edge.source} -> ${edge.target}.`);
    pairs.add(pair);
    if (edge.value !== undefined && edge.value !== null && !["string", "number", "boolean"].includes(typeof edge.value))
      throw new Error(`${path}/value must be a JSON scalar.`);
    if (edge.metadata !== undefined && !isRecord(edge.metadata)) throw new Error(`${path}/metadata must be an object.`);
  });
  validateJsonValue(input, "");
  if (input.hierarchy !== undefined) validateHierarchy(input.hierarchy, nodes as GraphDocument["nodes"]);
  if (input.diagram === "sankey") {
    const error = getSankeyError(nodes as GraphDocument["nodes"], input.edges as unknown as GraphDocument["edges"]);
    if (error) throw new Error(error);
  }
  return indexGraphDocument(structuredClone(input) as unknown as NormalizedDag);
}

export function createGraphDocument(
  nodes: Record<string, RawGraphNode> = {},
  edges: GraphDocument["edges"] = [],
): NormalizedDag {
  return normalizeDagInput({ format: "graph-studio", version: 3, nodes, edges });
}
