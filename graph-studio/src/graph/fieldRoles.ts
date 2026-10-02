// Graph Studio v2 uses fixed semantic fields; other node fields remain custom data.
export const SYSTEM_FIELD_KEYS = ["children", "parents", "define", "title", "type"] as const;
export type SystemFieldKey = typeof SYSTEM_FIELD_KEYS[number];

export function getSemanticFieldName(fieldName: string): SystemFieldKey | null {
  return (SYSTEM_FIELD_KEYS as readonly string[]).includes(fieldName)
    ? fieldName as SystemFieldKey
    : null;
}
