import { createEmptyDagNode, getNodeRelationMap, setNodeChildren, setNodeParents } from "./accessors";
import type { FieldMapping } from "./fieldMapping";
import { DEFAULT_RELATION_VALUE, type NodeKey, type NormalizedDag, type RelationValue } from "./types";

export interface RelationReconcileWarning {
  type: "relation-conflict" | "missing-relation-node";
  message: string;
}

interface RelationEdgeDraft {
  source: NodeKey;
  target: NodeKey;
  childValue?: RelationValue;
  parentValue?: RelationValue;
}

export function reconcileDagRelations(
  sourceDag: NormalizedDag,
  mapping: FieldMapping,
): { dag: NormalizedDag; warnings: RelationReconcileWarning[] } {
  const dag: NormalizedDag = { ...sourceDag };
  const warnings: RelationReconcileWarning[] = [];
  const edges = new Map<string, RelationEdgeDraft>();

  Object.entries(sourceDag).forEach(([sourceKey, node]) => {
    const children = getNodeRelationMap(node, mapping, "children", DEFAULT_RELATION_VALUE);
    Object.entries(children).forEach(([targetKey, relationValue]) => {
      const edge = getOrCreateEdge(edges, sourceKey, targetKey);
      edge.childValue = relationValue;
    });

    const parents = getNodeRelationMap(node, mapping, "parents", DEFAULT_RELATION_VALUE);
    Object.entries(parents).forEach(([parentKey, relationValue]) => {
      const edge = getOrCreateEdge(edges, parentKey, sourceKey);
      edge.parentValue = relationValue;
    });
  });

  edges.forEach((edge) => {
    ensureRelationNode(dag, edge.source, mapping, warnings);
    ensureRelationNode(dag, edge.target, mapping, warnings);
  });

  const nextChildrenByKey = new Map<NodeKey, Record<NodeKey, RelationValue>>();
  const nextParentsByKey = new Map<NodeKey, Record<NodeKey, RelationValue>>();
  Object.keys(dag).forEach((nodeKey) => {
    nextChildrenByKey.set(nodeKey, {});
    nextParentsByKey.set(nodeKey, {});
  });

  edges.forEach((edge) => {
    if (edge.source === edge.target) {
      return;
    }
    const relationValue = resolveRelationValue(edge, warnings);
    nextChildrenByKey.get(edge.source)![edge.target] = relationValue;
    nextParentsByKey.get(edge.target)![edge.source] = relationValue;
  });

  Object.keys(dag).forEach((nodeKey) => {
    setNodeChildren(dag[nodeKey], mapping, nextChildrenByKey.get(nodeKey) || {});
    setNodeParents(dag[nodeKey], mapping, nextParentsByKey.get(nodeKey) || {});
  });

  return { dag, warnings };
}

function getOrCreateEdge(edges: Map<string, RelationEdgeDraft>, source: NodeKey, target: NodeKey): RelationEdgeDraft {
  const normalizedSource = String(source || "").trim();
  const normalizedTarget = String(target || "").trim();
  const edgeKey = `${normalizedSource}\n${normalizedTarget}`;
  const existing = edges.get(edgeKey);
  if (existing) {
    return existing;
  }
  const edge = { source: normalizedSource, target: normalizedTarget };
  edges.set(edgeKey, edge);
  return edge;
}

function ensureRelationNode(
  dag: NormalizedDag,
  nodeKey: NodeKey,
  mapping: FieldMapping,
  warnings: RelationReconcileWarning[],
): void {
  if (!nodeKey || dag[nodeKey]) {
    return;
  }
  dag[nodeKey] = createEmptyDagNode(nodeKey, mapping);
  warnings.push({
    type: "missing-relation-node",
    message: `Created missing relation node "${nodeKey}" from an imported edge reference.`,
  });
}

function resolveRelationValue(edge: RelationEdgeDraft, warnings: RelationReconcileWarning[]): RelationValue {
  if (edge.childValue !== undefined && edge.parentValue !== undefined && edge.childValue !== edge.parentValue) {
    warnings.push({
      type: "relation-conflict",
      message: `${edge.source} -> ${edge.target} had different children/parents labels; the children label was kept.`,
    });
  }
  return edge.childValue ?? edge.parentValue ?? DEFAULT_RELATION_VALUE;
}
