import { getNodeType } from "./accessors";
import { nextEdgeId } from "./relations";
import { indexGraphDocument } from "./graphIndex";
import { projectGraphDocument } from "./serialize";
import type { GraphChartType, NormalizedDag } from "./types";
import { getSpaceMetadata } from "./space";

const TYPE_FILTER_SHORTCUT_RELATION = "filtered_path";

export interface TypeFilter {
  enabled: boolean;
  selection: "single" | "multiple";
  operation: "include" | "exclude";
  values: string[];
}
export const emptyTypeFilter = (): TypeFilter => ({
  enabled: false,
  selection: "single",
  operation: "include",
  values: [],
});
export type TypeSelection = string | TypeFilter;
export function typeFilterActive(filter: TypeSelection) {
  return typeof filter === "string" ? Boolean(filter) : filter.enabled;
}
export function matchesTypes(types: string[], filter: TypeSelection) {
  if (!typeFilterActive(filter)) return true;
  if (typeof filter === "string") return types.includes(filter);
  const selected = filter.values.some((type) => types.includes(type));
  return filter.operation === "include" ? selected : !selected;
}
export function nodeMatchesType(dag: NormalizedDag, key: string, filter: TypeSelection) {
  return matchesTypes(nodeTypes(dag, key), filter);
}

function nodeTypes(dag: NormalizedDag, key: string): string[] {
  const field = getSpaceMetadata(dag)?.typeField;
  const value = field ? dag.nodes[key][field] : getNodeType(dag.nodes[key]);
  return (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === "string" && Boolean(v.trim()),
  );
}

export function getGraphTypeOptions(dag: NormalizedDag): string[] {
  return [
    ...new Set(
      Object.keys(dag.nodes)
        .flatMap((key) => nodeTypes(dag, key))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function projectGraphByType(
  source: NormalizedDag,
  selectedType: TypeSelection,
  chartType: GraphChartType = "node-link",
): NormalizedDag {
  if (!typeFilterActive(selectedType)) return source;
  const visible = new Set(Object.keys(source.nodes).filter((key) => nodeMatchesType(source, key, selectedType)));
  const doc = projectGraphDocument(source, visible);
  const edgeTypeField = chartType === "spatial" ? getSpaceMetadata(source)?.edgeTypeField : undefined;
  if (edgeTypeField) {
    doc.edges = doc.edges.filter((edge) => {
      const value = edge.metadata?.[edgeTypeField];
      return matchesTypes(typeof value === "string" ? [value] : [], selectedType);
    });
    return indexGraphDocument(doc);
  }
  // Filtering cannot imply new measured flows or new historical relationships.
  if (source.diagram === "sankey" || chartType === "sankey" || chartType === "timeline" || chartType === "spatial")
    return doc;
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
