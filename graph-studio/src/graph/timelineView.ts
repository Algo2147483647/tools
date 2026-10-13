import { normalizeDagInput } from "./normalize";
import { serializeDag } from "./serialize";
import type { NormalizedDag } from "./types";

/** Timeline is a view over v3 graph data; it does not change edge semantics. */
export function isTimelineDocument(dag: Pick<NormalizedDag, "metadata">): boolean {
  const timeline = dag.metadata?.timeline;
  return Boolean(
    timeline &&
    typeof timeline === "object" &&
    !Array.isArray(timeline) &&
    (timeline as Record<string, unknown>).version === 1,
  );
}

export function getTimelineTrackOptions(dag: NormalizedDag): string[] {
  return [...new Set(Object.values(dag.nodes).map((node) => timelineTrack(node.track)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function projectGraphByTimelineTrack(dag: NormalizedDag, track: string): NormalizedDag {
  if (!track) return dag;
  const document = serializeDag(dag);
  delete document.hierarchy;
  document.nodes = Object.fromEntries(
    Object.entries(document.nodes).filter(([, node]) => timelineTrack(node.track) === track),
  );
  const visible = new Set(Object.keys(document.nodes));
  document.edges = document.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target));
  return normalizeDagInput(document);
}

function timelineTrack(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Events";
}
