// Native v2 documents have fixed semantic fields. Mapping helpers are shared UI labels.
export const MAPPABLE_SYSTEM_FIELD_KEYS = ["children", "parents", "define", "title", "type"] as const;
export type MappableSystemFieldKey = typeof MAPPABLE_SYSTEM_FIELD_KEYS[number];
export type FieldMapping = Record<MappableSystemFieldKey, string>;
export function getDefaultFieldMapping(): FieldMapping {
  return { children: "children", parents: "parents", define: "define", title: "title", type: "type" };
}
export function sanitizeFieldMapping(_input: unknown): FieldMapping { return getDefaultFieldMapping(); }
export function getDisplayFieldName(fieldName: string, _mapping: FieldMapping): string { return fieldName; }
export function getMappedFieldName(_mapping: FieldMapping, fieldName: MappableSystemFieldKey): string { return fieldName; }
export function getSemanticFieldName(fieldName: string, _mapping: FieldMapping): MappableSystemFieldKey|null {
  return isMappableSystemFieldKey(fieldName) ? fieldName : null;
}
export function formatMappedFieldLabel(fieldName: string, _mapping: FieldMapping): string { return fieldName; }
function isMappableSystemFieldKey(fieldName: string): fieldName is MappableSystemFieldKey { return (MAPPABLE_SYSTEM_FIELD_KEYS as readonly string[]).includes(fieldName); }
