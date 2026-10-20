import { type SystemFieldKey, getSemanticFieldName } from "../graph/fieldRoles";
import { parseRelationInput, toRelationMap } from "../graph/relations";
import type { NodeKey } from "../graph/types";

type FieldEditorKind = "plainText" | "multilineText" | "json" | "relation";
export type FieldDisplayMode = "markdown" | "text";

export interface EditableField {
  name: string;
  displayName: string;
  value: unknown;
  editorKind: FieldEditorKind;
  semanticFieldName: SystemFieldKey | null;
  locked?: boolean;
}

export function buildEditableFields(nodeKey: NodeKey, node: Record<string, unknown>): EditableField[] {
  const clonedNode = { ...node };
  if (clonedNode.key === nodeKey) {
    delete clonedNode.key;
  }
  return [
    { name: "key", displayName: "key", value: nodeKey, editorKind: "plainText", semanticFieldName: null },
    ...Object.entries(clonedNode).map(([name, value]) => ({
      name,
      displayName: name,
      value,
      editorKind: inferEditorKind(name, value),
      semanticFieldName: getSemanticFieldName(name),
    })),
  ];
}

export function formatEditorValue(field: EditableField): string {
  if (field.editorKind === "relation") {
    return JSON.stringify(toRelationMap(field.value), null, 2);
  }
  if (typeof field.value === "string") {
    return field.value;
  }
  if (typeof field.value === "number" || typeof field.value === "boolean") {
    return String(field.value);
  }
  return JSON.stringify(field.value, null, 2);
}

export function supportsDisplayMode(field: EditableField): boolean {
  return (
    field.name !== "key" &&
    typeof field.value === "string" &&
    (field.editorKind === "plainText" || field.editorKind === "multilineText")
  );
}

export function parseNodeFieldValue(
  field: EditableField,
  rawValue: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const text = String(rawValue || "");
  const trimmed = text.trim();

  if (field.editorKind === "relation") {
    if (!trimmed) {
      return { ok: true, value: {} };
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return parseJsonEditorValue(field.name, trimmed);
    }
    return { ok: true, value: parseRelationInput(trimmed) };
  }

  if (field.editorKind === "plainText" || field.editorKind === "multilineText") {
    return { ok: true, value: text };
  }

  if (typeof field.value === "number") {
    const nextNumber = Number(trimmed);
    if (!trimmed || !Number.isFinite(nextNumber)) {
      return { ok: false, message: `Field "${field.displayName}" must be a valid number.` };
    }
    return { ok: true, value: nextNumber };
  }

  if (typeof field.value === "boolean") {
    if (/^true$/i.test(trimmed)) {
      return { ok: true, value: true };
    }
    if (/^false$/i.test(trimmed)) {
      return { ok: true, value: false };
    }
    return { ok: false, message: `Field "${field.displayName}" must be true or false.` };
  }

  return parseJsonEditorValue(field.displayName, trimmed || "null");
}

function parseJsonEditorValue(
  fieldName: string,
  rawJson: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(rawJson) };
  } catch {
    return { ok: false, message: `Field "${fieldName}" contains invalid JSON.` };
  }
}

function inferEditorKind(name: string, value: unknown): FieldEditorKind {
  const semanticFieldName = getSemanticFieldName(name);
  if (semanticFieldName === "parents" || semanticFieldName === "children") {
    return "relation";
  }
  if (semanticFieldName === "define" || (typeof value === "string" && value.length > 80)) {
    return "multilineText";
  }
  if (typeof value === "string") {
    return "plainText";
  }
  return "json";
}

export function getEditorRows(field: EditableField): number {
  if (field.semanticFieldName === "define") {
    return 8;
  }
  if (field.editorKind === "relation") {
    return 5;
  }
  if (field.editorKind === "json") {
    return 6;
  }
  return 3;
}

export function getEditorHint(field: EditableField): string {
  if (field.editorKind === "relation") {
    return "Use a JSON object, a JSON array, or one key per line.";
  }
  if (field.editorKind === "json") {
    return "Enter valid JSON.";
  }
  if (typeof field.value === "boolean") {
    return "Use true or false.";
  }
  return "";
}
