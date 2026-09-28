import type { NodeKey, RelationField, RelationValue } from "./types";
import { DEFAULT_RELATION_VALUE } from "./types";

export function uniqueKeys(keys: Iterable<unknown>): NodeKey[] {
  return [...new Set([...keys].map(item => String(item ?? "").trim()).filter(Boolean))];
}
export function getRelationKeys(value: unknown): NodeKey[] {
  return Array.isArray(value) ? uniqueKeys(value) : value && typeof value === "object" ? Object.keys(value) : [];
}
export function coerceRelationValue(value: unknown): RelationValue {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Edge values must be JSON scalars.");
}
export function toRelationMap(value: unknown, defaultValue: RelationValue = DEFAULT_RELATION_VALUE): Record<NodeKey, RelationValue> {
  if (Array.isArray(value)) return Object.fromEntries(uniqueKeys(value).map(key => [key, defaultValue]));
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, coerceRelationValue(item)])) : {};
}
export function normalizeRelationField(value: unknown): RelationField {
  return toRelationMap(value);
}

export function parseRelationValue(rawValue: string): RelationValue {
  const text = rawValue.trim();
  if (!text) return DEFAULT_RELATION_VALUE;
  try { return coerceRelationValue(JSON.parse(text)); }
  catch { return rawValue; }
}

export function formatRelationValue(value: RelationValue): string {
  return JSON.stringify(value);
}
