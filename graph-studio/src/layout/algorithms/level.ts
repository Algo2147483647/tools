import { getNodeChildKeys } from "../../graph/accessors";
import type { DagNode, NodeKey } from "../../graph/types";
import type { LayoutResult } from "../types";
import { getExistingRoots } from "./shared";

export function buildLevelLayout(dag: Record<NodeKey, DagNode | undefined>, roots: NodeKey[]): LayoutResult {
  const coordinates: LayoutResult["coordinates"] = new Map();
  const queue = getExistingRoots(dag, roots);
  const visited = new Set(queue);
  let level = -1;
  let head = 0;

  while (head < queue.length) {
    const levelCount = queue.length - head;
    level += 1;
    for (let index = 0; index < levelCount; index += 1) {
      const key = queue[head++];
      const node = dag[key];
      if (!node) {
        continue;
      }
      coordinates.set(key, [level, index]);
      getNodeChildKeys(node).forEach((childKey) => {
        if (dag[childKey] && !visited.has(childKey)) {
          visited.add(childKey);
          queue.push(childKey);
        }
      });
    }
  }

  return { coordinates, warnings: [] };
}
