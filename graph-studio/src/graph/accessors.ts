import { SYSTEM_FIELD_KEYS } from "./fieldRoles";
import { getRelationKeys, toRelationMap } from "./relations";
import type { NodeKey, RelationField } from "./types";
export function getNodeTitle(node: Record<string, unknown>): string {
  return typeof node.title === "string" ? node.title : "";
}
export function getNodeDefine(node: Record<string, unknown>): string {
  return typeof node.define === "string" ? node.define : "";
}
export function getNodeType(node: Record<string, unknown>): string {
  return typeof node.type === "string" ? node.type : "";
}
export function getNodeParents(node: Record<string, unknown>): RelationField {
  return toRelationMap(node.parents);
}
export function getNodeChildren(node: Record<string, unknown>): RelationField {
  return toRelationMap(node.children);
}
export function getNodeParentKeys(node: Record<string, unknown>): NodeKey[] {
  return getRelationKeys(getNodeParents(node));
}
export function getNodeChildKeys(node: Record<string, unknown>): NodeKey[] {
  return getRelationKeys(getNodeChildren(node));
}
export function getCustomFieldNames(node: Record<string, unknown>): string[] {
  return Object.keys(node).filter((key) => key !== "key" && !(SYSTEM_FIELD_KEYS as readonly string[]).includes(key));
}
