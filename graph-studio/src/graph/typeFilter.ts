import { getDefaultFieldMapping, type FieldMapping } from "./fieldMapping";
import { getNodeType } from "./accessors";
import { normalizeDagInput } from "./normalize";
import { serializeDag } from "./serialize";
import { newEdgeId } from "./commands";
import type { GraphChartType, NormalizedDag } from "./types";

export const TYPE_FILTER_SHORTCUT_RELATION = "filtered_path";

export function getGraphTypeOptions(dag: NormalizedDag, mapping: FieldMapping = getDefaultFieldMapping()): string[] {
  return [...new Set(Object.values(dag.nodes).map(node => getNodeType(node, mapping)).filter(Boolean))].sort((a,b) => a.localeCompare(b));
}

export function projectGraphByType(source: NormalizedDag, selectedType: string, mapping: FieldMapping = getDefaultFieldMapping(), chartType: GraphChartType = "node-link"): NormalizedDag {
  if (!selectedType) return source;
  const visible = new Set(Object.keys(source.nodes).filter(key => getNodeType(source.nodes[key], mapping) === selectedType));
  const doc = serializeDag(source);
  doc.nodes = Object.fromEntries(Object.entries(doc.nodes).filter(([key]) => visible.has(key)));
  doc.edges = doc.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target));
  // Hidden flows cannot be safely reconstructed from totals. Keep only measured direct flows.
  if (source.diagram === "sankey" || chartType === "sankey") return normalizeDagInput(doc);
  const outgoing = new Map<string, string[]>();
  source.edges.forEach(edge => outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]));
  for (const sourceKey of visible) {
    const seen = new Set<string>([sourceKey]);
    const stack = [...(outgoing.get(sourceKey) || [])];
    while (stack.length) {
      const key = stack.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      if (visible.has(key)) {
        if (!doc.edges.some(edge => edge.source === sourceKey && edge.target === key)) {
          doc.edges.push({ id: newEdgeId(doc.edges), source: sourceKey, target: key, value: TYPE_FILTER_SHORTCUT_RELATION, metadata: { projected: true } });
        }
      } else stack.push(...(outgoing.get(key) || []));
    }
  }
  return normalizeDagInput(doc);
}
