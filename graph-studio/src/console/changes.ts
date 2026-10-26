import type { NormalizedDag } from "../graph/types";
import { serializeDag } from "../graph/serialize";
import { isRecord } from "../shared/json";

export function diffValues(before: unknown, after: unknown, path: string, lines: string[] = []): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return lines;
  if (isRecord(before) && isRecord(after)) {
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort())
      diffValues(before[key], after[key], `${path}.${key}`, lines);
  } else {
    const preview = (value: unknown) => {
      const text = value === undefined ? "(unset)" : JSON.stringify(value);
      return text.length > 240 ? text.slice(0, 240) + "…" : text;
    };
    lines.push(`${path}: ${preview(before)} → ${preview(after)}`);
  }
  return lines;
}

export function buildGraphDiff(before: NormalizedDag, after: NormalizedDag): string[] {
  const a = serializeDag(before),
    b = serializeDag(after);
  const keyed = (edges: typeof a.edges) => Object.fromEntries(edges.map((e) => [e.id, e]));
  return [
    ...diffValues(a.nodes, b.nodes, "nodes"),
    ...diffValues(keyed(a.edges), keyed(b.edges), "edges"),
    ...diffValues(keyed(a.hierarchy_edges ?? []), keyed(b.hierarchy_edges ?? []), "hierarchy"),
    ...diffValues(a.metadata, b.metadata, "metadata"),
    ...diffValues(a.diagram, b.diagram, "diagram"),
  ];
}

export function limitDiff(lines: string[], limit = 80) {
  return lines.length > limit ? [...lines.slice(0, limit), `… ${lines.length - limit} additional changes.`] : lines;
}
