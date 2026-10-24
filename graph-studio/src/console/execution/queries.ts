import {
getCustomFieldNames,
getNodeChildren,
getNodeDefine,
getNodeParents,
getNodeTitle,
getNodeType,
} from "../../graph/accessors";
import { getRelationKeys } from "../../graph/relations";
import type { NodeKey,NormalizedDag } from "../../graph/types";


import { formatKeySample,formatRelationPreview,formatScalarPreview } from "./formatting";
export function buildKeyList(dag: NormalizedDag): string {
  const keys = Object.keys(dag.nodes).sort((left, right) => left.localeCompare(right));
  if (!keys.length) {
    return "Keys (0)";
  }
  return [`Keys (${keys.length}):`, ...keys].join("\n");
}

export function buildGraphStats(dag: NormalizedDag): string {
  const keys = Object.keys(dag.nodes).sort((left, right) => left.localeCompare(right));
  const edgeCount = keys.reduce((count, key) => count + getRelationKeys(getNodeChildren(dag.nodes[key])).length, 0);
  const roots = keys.filter((key) => getRelationKeys(getNodeParents(dag.nodes[key])).length === 0);
  const leaves = keys.filter((key) => getRelationKeys(getNodeChildren(dag.nodes[key])).length === 0);
  const typeCounts = keys.reduce<Record<string, number>>((counts, key) => {
    const type = getNodeType(dag.nodes[key]) || "(empty)";
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  const typeLines = Object.entries(typeCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([type, count]) => `- ${type}: ${count}`);

  return [
    `Graph: ${keys.length} nodes, ${edgeCount} directed edges.`,
    `Roots (${roots.length}): ${formatKeySample(roots)}`,
    `Leaves (${leaves.length}): ${formatKeySample(leaves)}`,
    "Types:",
    ...(typeLines.length ? typeLines : ["- (none)"]),
  ].join("\n");
}

export function buildFindResults(dag: NormalizedDag, query: string): string {
  const needle = normalizeSearchText(query);
  const matches = Object.keys(dag.nodes)
    .map((key) => ({ key, score: scoreNodeMatch(key, dag.nodes[key], needle) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));

  if (!matches.length) {
    return `No matches for "${query}".`;
  }

  const shown = matches.slice(0, 20);
  return [
    `Matches (${shown.length}${matches.length > shown.length ? ` of ${matches.length}` : ""}) for "${query}":`,
    ...shown.map(({ key }) => {
      const node = dag.nodes[key];
      return `- ${key} | title: ${formatScalarPreview(getNodeTitle(node))} | type: ${formatScalarPreview(getNodeType(node))} | define: ${formatScalarPreview(getNodeDefine(node))}`;
    }),
  ].join("\n");
}

export function buildNeighborSummary(nodeKey: NodeKey, dag: NormalizedDag, depth: number): string {
  const visited = new Set<NodeKey>([nodeKey]);
  let frontier = [nodeKey];
  const layers: Array<{ depth: number; parents: NodeKey[]; children: NodeKey[] }> = [];

  for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
    const parents = new Set<NodeKey>();
    const children = new Set<NodeKey>();
    frontier.forEach((key) => {
      getRelationKeys(getNodeParents(dag.nodes[key])).forEach((parentKey) => {
        if (!visited.has(parentKey) && dag.nodes[parentKey]) {
          parents.add(parentKey);
        }
      });
      getRelationKeys(getNodeChildren(dag.nodes[key])).forEach((childKey) => {
        if (!visited.has(childKey) && dag.nodes[childKey]) {
          children.add(childKey);
        }
      });
    });

    const nextKeys = [...parents, ...children].sort((left, right) => left.localeCompare(right));
    if (!nextKeys.length) {
      break;
    }
    nextKeys.forEach((key) => visited.add(key));
    layers.push({
      depth: currentDepth,
      parents: Array.from(parents).sort((left, right) => left.localeCompare(right)),
      children: Array.from(children).sort((left, right) => left.localeCompare(right)),
    });
    frontier = nextKeys;
  }

  const node = dag.nodes[nodeKey];
  return [
    buildNodeSummary(nodeKey, dag),
    `Neighbors up to depth ${depth}:`,
    ...(layers.length
      ? layers.flatMap((layer) => [
          `depth ${layer.depth} parents: ${formatKeySample(layer.parents)}`,
          `depth ${layer.depth} children: ${formatKeySample(layer.children)}`,
        ])
      : ["(none)"]),
    `Definition: ${formatScalarPreview(getNodeDefine(node))}`,
  ].join("\n");
}

export function buildDirectedPathSummary(fromKey: NodeKey, toKey: NodeKey, dag: NormalizedDag): string {
  if (fromKey === toKey) {
    return `Path: ${fromKey}`;
  }

  const queue: NodeKey[] = [fromKey];
  const visited = new Set<NodeKey>([fromKey]);
  const previous = new Map<NodeKey, NodeKey>();

  for (let head = 0; head < queue.length; head++) {
    const currentKey = queue[head];
    const children = getRelationKeys(getNodeChildren(dag.nodes[currentKey])).filter((key) => dag.nodes[key]);
    for (const childKey of children) {
      if (visited.has(childKey)) {
        continue;
      }
      visited.add(childKey);
      previous.set(childKey, currentKey);
      if (childKey === toKey) {
        const path = [toKey];
        let cursor = toKey;
        while (previous.has(cursor)) {
          cursor = previous.get(cursor) as NodeKey;
          path.push(cursor);
        }
        return `Path (${path.length - 1} edges): ${path.reverse().join(" -> ")}`;
      }
      queue.push(childKey);
    }
  }

  return `No directed path from "${fromKey}" to "${toKey}".`;
}

export function buildNodeSummary(nodeKey: NodeKey, dag: NormalizedDag): string {
  const node = dag.nodes[nodeKey];
  const lines = [
    `Node: ${nodeKey}`,
    `title: ${formatScalarPreview(getNodeTitle(node))}`,
    `type: ${formatScalarPreview(getNodeType(node))}`,
    `define: ${formatScalarPreview(getNodeDefine(node))}`,
    `parents: ${formatRelationPreview(getNodeParents(node))}`,
    `children: ${formatRelationPreview(getNodeChildren(node))}`,
  ];

  const customFieldNames = getCustomFieldNames(node);
  if (customFieldNames.length) {
    lines.push(`custom: ${customFieldNames.join(", ")}`);
  }

  return lines.join("\n");
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

export function scoreNodeMatch(nodeKey: NodeKey, node: Record<string, unknown>, needle: string): number {
  if (!needle) {
    return 0;
  }

  const key = normalizeSearchText(nodeKey);
  const title = normalizeSearchText(getNodeTitle(node));
  const type = normalizeSearchText(getNodeType(node));
  const define = normalizeSearchText(getNodeDefine(node));
  const custom = getCustomFieldNames(node)
    .map((fieldName) => normalizeSearchText(node[fieldName]))
    .join(" ");

  if (key === needle || title === needle) {
    return 100;
  }
  if (key.startsWith(needle) || title.startsWith(needle)) {
    return 80;
  }
  if (key.includes(needle) || title.includes(needle)) {
    return 60;
  }
  if (type.includes(needle)) {
    return 40;
  }
  if (define.includes(needle)) {
    return 25;
  }
  if (custom.includes(needle)) {
    return 15;
  }
  return 0;
}
