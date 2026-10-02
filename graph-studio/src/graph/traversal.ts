import { getNodeChildKeys } from "./accessors";
import type { DagNode, NodeKey } from "./types";

/** Includes the roots, preserves depth-first order, and visits cycles only once. */
export function collectDescendantKeys(
  nodes: Readonly<Record<NodeKey, DagNode | undefined>>,
  roots: readonly NodeKey[],
): NodeKey[] {
  const visited = new Set<NodeKey>();
  const stack = [...roots];
  while (stack.length) {
    const key = stack.pop()!;
    if (visited.has(key) || !Object.prototype.hasOwnProperty.call(nodes, key)) continue;
    const node = nodes[key];
    if (!node) continue;
    visited.add(key);
    stack.push(...getNodeChildKeys(node));
  }
  return [...visited];
}
