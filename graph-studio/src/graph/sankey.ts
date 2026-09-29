import type { GraphDocument, GraphEdge } from "./types";

/** Validate without coercion: a relationship label must never become a flow of 1. */
export function getSankeyError(nodes: GraphDocument["nodes"], edges: GraphEdge[]): string | null {
  const incoming = new Map(Object.keys(nodes).map(key => [key, 0]));
  const outgoing = new Map<string, string[]>();
  const totals = new Map<string, number>();
  for (const edge of edges) {
    if (typeof edge.value !== "number" || !Number.isFinite(edge.value) || edge.value < 0) {
      return `Sankey edge "${edge.id}" requires a finite, non-negative numeric value.`;
    }
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
    for (const key of [`out:${edge.source}`, `in:${edge.target}`]) {
      const total = (totals.get(key) ?? 0) + edge.value;
      if (!Number.isFinite(total)) return "Sankey flow totals exceed the supported numeric range. Use smaller units.";
      totals.set(key, total);
    }
  }
  const queue = [...incoming.keys()].filter(key => incoming.get(key) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const target of outgoing.get(queue[i]) ?? []) {
      const degree = incoming.get(target)! - 1;
      incoming.set(target, degree);
      if (degree === 0) queue.push(target);
    }
  }
  return queue.length === incoming.size ? null : "Sankey requires an acyclic graph. Remove the circular flow before using Sankey.";
}

export function formatFlow(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5, notation: value >= 1e9 || value > 0 && value < 0.001 ? "scientific" : "standard" }).format(value);
}
