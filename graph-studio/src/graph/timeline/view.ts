import { projectGraphDocument } from "../serialize";
import type { NormalizedDag } from "../types";

/** Timeline is a view over v3 graph data; it does not change edge semantics. */
export function isTimelineDocument(dag: Pick<NormalizedDag, "metadata">): boolean {
  const timeline = dag.metadata?.timeline;
  return Boolean(timeline && typeof timeline === "object" && !Array.isArray(timeline));
}

export function getTimelineTrackOptions(dag: NormalizedDag): string[] {
  return [...new Set(Object.values(dag.nodes).map((node) => timelineTrack(node.track)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function projectGraphByTimelineTrack(dag: NormalizedDag, track: string): NormalizedDag {
  if (!track) return dag;
  const visible = new Set(Object.keys(dag.nodes).filter((key) => timelineTrack(dag.nodes[key].track) === track));
  return projectGraphDocument(dag, visible);
}

function timelineTrack(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Events";
}
