import type { GraphDocument, GraphEdge } from "./types";

/** Validate without coercion: a relationship label must never become a flow of 1. */
export function getSankeyError(_nodes: GraphDocument["nodes"], edges: GraphEdge[]): string | null {
  const totals = new Map<string, number>();
  for (const edge of edges) {
    if (typeof edge.value !== "number" || !Number.isFinite(edge.value) || edge.value < 0) {
      return `Sankey edge "${edge.id}" requires a finite, non-negative numeric value.`;
    }
    for (const key of [`out:${edge.source}`, `in:${edge.target}`]) {
      const total = (totals.get(key) ?? 0) + edge.value;
      if (!Number.isFinite(total)) return "Sankey flow totals exceed the supported numeric range. Use smaller units.";
      totals.set(key, total);
    }
  }
  return null;
}

/** Only remove feedback links from the positioning graph, never from the document.
 * Iterative DFS also handles long chains and source-free cyclic components.
 */
export function findFeedbackEdges(keys: Iterable<string>, edges: GraphEdge[]): Set<string> {
  const nodeKeys = [...keys].sort();
  const feedback = new Set(edges.filter((edge) => edge.metadata?.feedback === true).map((edge) => edge.id));
  const outgoing = new Map(nodeKeys.map((key) => [key, [] as GraphEdge[]]));
  const incoming = new Map(nodeKeys.map((key) => [key, 0]));
  for (const edge of edges) {
    if (feedback.has(edge.id)) continue;
    outgoing.get(edge.source)!.push(edge);
    incoming.set(edge.target, incoming.get(edge.target)! + 1);
  }
  outgoing.forEach((list) => list.sort((a, b) => a.target.localeCompare(b.target) || a.id.localeCompare(b.id)));
  const state = new Map<string, number>();
  for (const key of [...nodeKeys.filter((key) => incoming.get(key) === 0), ...nodeKeys]) {
    if (state.has(key)) continue;
    state.set(key, 1);
    const stack = [{ key, index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edge = outgoing.get(frame.key)![frame.index++];
      if (!edge) {
        state.set(frame.key, 2);
        stack.pop();
        continue;
      }
      if (state.get(edge.target) === 1) feedback.add(edge.id);
      else if (!state.has(edge.target)) {
        state.set(edge.target, 1);
        stack.push({ key: edge.target, index: 0 });
      }
    }
  }
  return feedback;
}

export function formatFlow(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 5,
    notation: value >= 1e9 || (value > 0 && value < 0.001) ? "scientific" : "standard",
  }).format(value);
}
