import type { NodeKey } from "../../graph/types";

export type FieldDisplayMode = "markdown" | "text";

export interface EditableField {
  name: string;
  value: unknown;
}

export function buildEditableFields(nodeKey: NodeKey, node: Record<string, unknown>): EditableField[] {
  const clonedNode = { ...node };
  if (clonedNode.key === nodeKey) {
    delete clonedNode.key;
  }
  return [{ name: "key", value: nodeKey }, ...Object.entries(clonedNode).map(([name, value]) => ({ name, value }))];
}

export function formatEditorValue(field: EditableField): string {
  if (typeof field.value === "string") {
    return field.value;
  }
  if (typeof field.value === "number" || typeof field.value === "boolean") {
    return String(field.value);
  }
  return JSON.stringify(field.value, null, 2);
}

export function supportsDisplayMode(field: EditableField): boolean {
  return field.name !== "key" && typeof field.value === "string";
}

export function parseNodeFieldValue(
  field: EditableField,
  rawValue: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (typeof field.value === "string") return { ok: true, value: rawValue };
  const trimmed = rawValue.trim();

  if (typeof field.value === "number") {
    const nextNumber = Number(trimmed);
    if (!trimmed || !Number.isFinite(nextNumber)) {
      return { ok: false, message: `Field "${field.name}" must be a valid number.` };
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
    return { ok: false, message: `Field "${field.name}" must be true or false.` };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed || "null") };
  } catch {
    return { ok: false, message: `Field "${field.name}" contains invalid JSON.` };
  }
}
