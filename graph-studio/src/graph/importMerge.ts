import { getMappedFieldName, inferFieldMapping, MAPPABLE_SYSTEM_FIELD_KEYS, type FieldMapping } from "./fieldMapping";
import { normalizeDagInput } from "./normalize";
import { reconcileDagRelations } from "./reconcileRelations";
import { structuredCloneValue } from "./serialize";
import type { DagNode, NodeKey, NormalizedDag } from "./types";

export interface ImportGraphDocument {
  name: string;
  payload: unknown;
}

export interface ImportWarning {
  type: "empty" | "duplicate-key" | "field-conflict" | "relation-conflict" | "missing-relation-node";
  message: string;
}

export interface ImportedDagResult {
  dag: NormalizedDag;
  mapping: FieldMapping;
  warnings: ImportWarning[];
  documentCount: number;
  duplicateRenameCount: number;
}

export function buildImportedDag(documents: ImportGraphDocument[], fallbackMapping: FieldMapping): ImportedDagResult {
  const firstPayload = documents[0]?.payload;
  const targetMapping = firstPayload === undefined ? fallbackMapping : inferFieldMapping(firstPayload, fallbackMapping);
  const dag: NormalizedDag = {};
  const warnings: ImportWarning[] = [];
  let duplicateRenameCount = 0;

  documents.forEach((document) => {
    const sourceMapping = inferFieldMapping(document.payload, targetMapping);
    const normalizedDag = normalizeDagInput(document.payload);
    const remappedDag = remapDagToFieldMapping(normalizedDag, sourceMapping, targetMapping, document.name, warnings);
    const nodeCount = Object.keys(remappedDag).length;

    if (nodeCount === 0) {
      warnings.push({
        type: "empty",
        message: `${document.name} did not contain any graph nodes and was skipped.`,
      });
      return;
    }

    const merged = renameCollidingDocumentNodes(dag, remappedDag, document.name, targetMapping);
    duplicateRenameCount += merged.renameCount;
    if (merged.renameCount > 0) {
      warnings.push({
        type: "duplicate-key",
        message: `${document.name} had ${merged.renameCount} duplicate node key${merged.renameCount === 1 ? "" : "s"}; later duplicates were renamed.`,
      });
    }

    Object.assign(dag, merged.dag);
  });

  const reconciled = reconcileDagRelations(dag, targetMapping);
  warnings.push(...reconciled.warnings);

  return {
    dag: reconciled.dag,
    mapping: targetMapping,
    warnings,
    documentCount: documents.length,
    duplicateRenameCount,
  };
}

function remapDagToFieldMapping(
  dag: NormalizedDag,
  sourceMapping: FieldMapping,
  targetMapping: FieldMapping,
  documentName: string,
  warnings: ImportWarning[],
): NormalizedDag {
  const output: NormalizedDag = {};
  Object.entries(dag).forEach(([key, node]) => {
    output[key] = remapNodeToFieldMapping(node, sourceMapping, targetMapping, documentName, warnings);
  });
  return output;
}

function remapNodeToFieldMapping(
  node: DagNode,
  sourceMapping: FieldMapping,
  targetMapping: FieldMapping,
  documentName: string,
  warnings: ImportWarning[],
): DagNode {
  const nextNode = structuredCloneValue(node) as DagNode;

  MAPPABLE_SYSTEM_FIELD_KEYS.forEach((systemField) => {
    const sourceFieldName = getMappedFieldName(sourceMapping, systemField);
    const targetFieldName = getMappedFieldName(targetMapping, systemField);
    if (sourceFieldName === targetFieldName || !Object.prototype.hasOwnProperty.call(nextNode, sourceFieldName)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(nextNode, targetFieldName)) {
      warnings.push({
        type: "field-conflict",
        message: `${documentName} contains both "${sourceFieldName}" and "${targetFieldName}"; "${targetFieldName}" was kept for ${systemField}.`,
      });
      delete nextNode[sourceFieldName];
      return;
    }

    nextNode[targetFieldName] = nextNode[sourceFieldName];
    delete nextNode[sourceFieldName];
  });

  return nextNode;
}

function renameCollidingDocumentNodes(
  existingDag: NormalizedDag,
  documentDag: NormalizedDag,
  documentName: string,
  mapping: FieldMapping,
): { dag: NormalizedDag; renameCount: number } {
  const existingKeys = new Set(Object.keys(existingDag));
  const localKeys = Object.keys(documentDag);
  const usedKeys = new Set([...existingKeys, ...localKeys]);
  const renameMap: Record<NodeKey, NodeKey> = {};
  const sourceLabel = sanitizeKeySegment(documentName);

  localKeys.forEach((key) => {
    if (!existingKeys.has(key)) {
      return;
    }
    usedKeys.delete(key);
    const nextKey = buildUniqueNodeKey(key, sourceLabel, usedKeys);
    usedKeys.add(nextKey);
    renameMap[key] = nextKey;
  });

  if (Object.keys(renameMap).length === 0) {
    return { dag: documentDag, renameCount: 0 };
  }

  const renamedDag: NormalizedDag = {};
  Object.entries(documentDag).forEach(([key, node]) => {
    const nextKey = renameMap[key] || key;
    const nextNode = structuredCloneValue(node) as DagNode;
    nextNode.key = nextKey;
    remapNodeRelationKeys(nextNode, mapping, renameMap);
    renamedDag[nextKey] = nextNode;
  });

  return {
    dag: renamedDag,
    renameCount: Object.keys(renameMap).length,
  };
}

function remapNodeRelationKeys(node: DagNode, mapping: FieldMapping, renameMap: Record<NodeKey, NodeKey>): void {
  const parentFieldName = getMappedFieldName(mapping, "parents");
  const childFieldName = getMappedFieldName(mapping, "children");
  if (Object.prototype.hasOwnProperty.call(node, parentFieldName)) {
    node[parentFieldName] = remapRelationValue(node[parentFieldName], renameMap);
  }
  if (Object.prototype.hasOwnProperty.call(node, childFieldName)) {
    node[childFieldName] = remapRelationValue(node[childFieldName], renameMap);
  }
}

function remapRelationValue(value: unknown, renameMap: Record<NodeKey, NodeKey>): unknown {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => renameMap[String(item)] || item)));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, relationValue]) => {
      output[renameMap[key] || key] = relationValue;
    });
    return output;
  }

  return value;
}

function buildUniqueNodeKey(key: NodeKey, sourceLabel: string, usedKeys: Set<NodeKey>): NodeKey {
  const baseKey = `${key}__${sourceLabel}`;
  let candidate = baseKey;
  let index = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${baseKey}_${index}`;
    index += 1;
  }

  return candidate;
}

function sanitizeKeySegment(name: string): string {
  const withoutExtension = name.replace(/\\/g, "/").split("/").pop()?.replace(/\.json$/i, "") || "import";
  const sanitized = withoutExtension.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "import").slice(0, 40);
}
