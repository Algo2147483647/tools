import type { NodeKey } from "../graph/types";
import { remapNodeInput, remapNodeOutput, type FieldMapping } from "../graph/fieldMapping";

export function buildRawNodeEditorValue(nodeKey: NodeKey, node: Record<string, unknown>, fieldMapping: FieldMapping): string {
  return JSON.stringify({ [nodeKey]: buildSerializableNode(nodeKey, node, fieldMapping) }, null, 2);
}

export function parseRawNodeEditorValue(
  rawValue: string,
  fallbackKey: NodeKey,
  fieldMapping: FieldMapping,
): { ok: true; nextKey: NodeKey; fields: Record<string, unknown> } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return { ok: false, message: "Raw JSON contains invalid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "Raw JSON must be a JSON object." };
  }

  const objectValue = parsed as Record<string, unknown>;
  const wrappedEntry = getWrappedNodeEntry(objectValue);
  const nextKey = String(wrappedEntry?.[0] ?? objectValue.key ?? fallbackKey).trim();
  if (!nextKey) {
    return { ok: false, message: "Node key cannot be empty." };
  }
  if (nextKey.includes("\n") || nextKey.includes(",")) {
    return { ok: false, message: "Node key cannot contain commas or line breaks." };
  }

  const nodeValue = wrappedEntry ? wrappedEntry[1] : objectValue;
  if (!nodeValue || typeof nodeValue !== "object" || Array.isArray(nodeValue)) {
    return { ok: false, message: "Raw JSON must describe a single node object." };
  }

  const fields = { ...(remapNodeInput(nodeValue as Record<string, unknown>, fieldMapping) as Record<string, unknown>) };
  if (fields.key === nextKey) {
    delete fields.key;
  }
  return { ok: true, nextKey, fields };
}

function getWrappedNodeEntry(value: Record<string, unknown>): [NodeKey, Record<string, unknown>] | null {
  const entries = Object.entries(value);
  if (entries.length !== 1) {
    return null;
  }
  const [nodeKey, nodeValue] = entries[0];
  if (!nodeValue || typeof nodeValue !== "object" || Array.isArray(nodeValue)) {
    return null;
  }
  return [nodeKey, nodeValue as Record<string, unknown>];
}

function buildSerializableNode(nodeKey: NodeKey, node: Record<string, unknown>, fieldMapping: FieldMapping): Record<string, unknown> {
  const clonedNode: Record<string, unknown> = { ...node };
  if (clonedNode.key === nodeKey) {
    delete clonedNode.key;
  }
  return remapNodeOutput(clonedNode, fieldMapping) as Record<string, unknown>;
}
