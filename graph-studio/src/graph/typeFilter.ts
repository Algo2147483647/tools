import { getNodeType } from "./accessors";
import { nextEdgeId } from "./edgeIds";
import { indexGraphDocument } from "./graphIndex";
import { projectGraphDocument } from "./projection";
import type { GraphChartType, NormalizedDag } from "./types";

const TYPE_FILTER_SHORTCUT_RELATION = "filtered_path";

export function getGraphTypeOptions(dag: NormalizedDag): string[] {
  return [
    ...new Set(
      Object.values(dag.nodes)
        .map((node) => getNodeType(node))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function projectGraphByType(
  source: NormalizedDag,
  selectedType: string,
  chartType: GraphChartType = "node-link",
): NormalizedDag {
  if (!selectedType) return source;
  const visible = new Set(Object.keys(source.nodes).filter((key) => getNodeType(source.nodes[key]) === selectedType));
  const doc = projectGraphDocument(source, visible);
  // Filtering cannot imply new measured flows or new historical relationships.
  if (source.diagram === "sankey" || chartType === "sankey" || chartType === "timeline") return doc;
  const outgoing = new Map<string, string[]>();
  for (const edge of source.edges) {
    const targets = outgoing.get(edge.source);
    if (targets) targets.push(edge.target);
    else outgoing.set(edge.source, [edge.target]);
  }
  const usedIds = new Set(doc.edges.map((edge) => edge.id));
  for (const sourceKey of visible) {
    const connected = new Set((outgoing.get(sourceKey) ?? []).filter((key) => visible.has(key)));
    const seen = new Set<string>([sourceKey]);
    const stack = [...(outgoing.get(sourceKey) || [])];
    while (stack.length) {
      const key = stack.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      if (visible.has(key)) {
        if (!connected.has(key)) {
          const id = nextEdgeId(usedIds, doc.edges.length + 1);
          usedIds.add(id);
          connected.add(key);
          doc.edges.push({
            id,
            source: sourceKey,
            target: key,
            value: TYPE_FILTER_SHORTCUT_RELATION,
            metadata: { projected: true },
          });
        }
      } else stack.push(...(outgoing.get(key) || []));
    }
  }
  return indexGraphDocument(doc);
}
