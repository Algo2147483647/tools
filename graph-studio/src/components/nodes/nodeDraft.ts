import type { NodeKey } from "../../graph/types";
import {
type EditableField,
type FieldDisplayMode,
buildRawNodeEditorValue,
parseNodeFieldValue,
supportsDisplayMode
} from "./nodeFields";


export function tryBuildRawJsonFromFieldValues(
  fields: EditableField[],
  values: Record<string, string>,
  fallbackKey: NodeKey,
): string | null {
  const nextKey = String(values.key ?? fallbackKey).trim();
  if (!nextKey || nextKey.includes("\n") || nextKey.includes(",")) {
    return null;
  }

  const patch: Record<string, unknown> = Object.create(null);
  for (const field of fields) {
    if (field.name === "key") {
      continue;
    }
    const parsed = parseNodeFieldValue(field, values[field.name] ?? "");
    if (!parsed.ok) {
      return null;
    }
    patch[field.name] = parsed.value;
  }

  return buildRawNodeEditorValue(nextKey, patch);
}

export function buildDefaultFieldDisplayModes(fields: EditableField[]): Record<string, FieldDisplayMode> {
  return Object.fromEntries(
    fields.filter((field) => supportsDisplayMode(field)).map((field) => [field.name, "markdown"]),
  );
}
