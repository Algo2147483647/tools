import { MAPPABLE_SYSTEM_FIELD_KEYS, type FieldMapping } from "./fieldMapping";
import { toRelationMap, getRelationKeys } from "./relations";
import { type DagNode, type NodeKey, type RelationField } from "./types";
export function getNodeTitle(node: DagNode | Record<string, unknown>, _mapping: FieldMapping): string { return typeof node.title === "string" ? node.title : ""; }
export function getNodeDefine(node: DagNode | Record<string, unknown>, _mapping: FieldMapping): string { return typeof node.define === "string" ? node.define : ""; }
export function getNodeType(node: DagNode | Record<string, unknown>, _mapping: FieldMapping): string { return typeof node.type === "string" ? node.type : ""; }
export function getNodeParents(node: DagNode | Record<string, unknown>, _mapping: FieldMapping): RelationField { return toRelationMap(node.parents); }
export function getNodeChildren(node: DagNode | Record<string, unknown>, _mapping: FieldMapping): RelationField { return toRelationMap(node.children); }
export function getNodeParentKeys(node: DagNode | Record<string, unknown>, mapping: FieldMapping): NodeKey[] { return getRelationKeys(getNodeParents(node,mapping)); }
export function getNodeChildKeys(node: DagNode | Record<string, unknown>, mapping: FieldMapping): NodeKey[] { return getRelationKeys(getNodeChildren(node,mapping)); }
export function getCustomFieldNames(node: DagNode | Record<string, unknown>, _mapping: FieldMapping): string[] { return Object.keys(node).filter(key=>key!=="key"&&!(MAPPABLE_SYSTEM_FIELD_KEYS as readonly string[]).includes(key)); }
