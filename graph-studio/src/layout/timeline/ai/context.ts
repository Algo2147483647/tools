import { getNodeTitle } from "../../../graph/accessors";
import { getTimelineClock } from "../../../graph/timeline/clock";
import { readTimelineLayout } from "../../../graph/timeline/layoutData";
import { sanitizeTimelineSettings } from "../../../graph/timeline/settings";
import type { StageData } from "../../shared/types";
import type { TimelineLayoutInput } from "../layout-candidate";

export function timelineLayoutContext(input: TimelineLayoutInput, stage: StageData, focus?: string | null) {
  const saved = readTimelineLayout(input.dag).data;
  const currentPlan =
    input.arrangement === undefined ? (saved.mode === "ai" ? saved.plan : undefined) : input.arrangement;
  const currentSettings = sanitizeTimelineSettings({
    ...input.timelineSettings,
    ...(currentPlan?.edgeRouting ? { edgeRouting: currentPlan.edgeRouting } : {}),
  });
  const nodes = [...stage.nodes].sort(
    (a, b) => Number(b.key === focus) - Number(a.key === focus) || a.key.localeCompare(b.key),
  );
  const selected = nodes.slice(0, 160);
  const ids = new Set(selected.map((node) => node.key));
  const tracks = new Map<string, { name: string; events: number }>();
  for (const node of nodes) {
    const name = node.timeline!.track;
    const track = tracks.get(name) ?? { name, events: 0 };
    track.events++;
    tracks.set(name, track);
  }
  const connections = new Map<string, { source: string; target: string; count: number }>();
  for (const edge of stage.edges) {
    const source = stage.nodeMap[edge.source].timeline!.track,
      target = stage.nodeMap[edge.target].timeline!.track;
    if (source === target) continue;
    const key = JSON.stringify([source, target]);
    const item = connections.get(key) ?? { source, target, count: 0 };
    item.count++;
    connections.set(key, item);
  }
  return {
    clock: getTimelineClock(input.dag.metadata),
    layout: currentSettings.layout,
    orientation: currentSettings.orientation,
    settings: {
      edgeRouting: currentSettings.edgeRouting,
    },
    currentTrackOrder: stage.timeline!.tracks.map((track) => track.id),
    totalEvents: nodes.length,
    totalRelationships: stage.edges.length,
    sampledEvents: selected.length,
    truncated: nodes.length > 160 || stage.edges.length > 240,
    tracks: [...tracks.values()],
    trackConnections: [...connections.values()].sort((a, b) => b.count - a.count).slice(0, 240),
    events: selected.map((node) => ({
      id: node.key,
      title: getNodeTitle(input.dag.nodes[node.key]).slice(0, 180),
      track: node.timeline!.track,
      start: node.timeline!.start,
      end: node.timeline!.end,
      status: node.timeline!.status,
      space: node.timeline!.space,
      pinned: Object.prototype.hasOwnProperty.call(input.timelineSettings?.pins ?? {}, node.key),
    })),
    relationships: stage.edges
      .filter((edge) => ids.has(edge.source) || ids.has(edge.target))
      .slice(0, 240)
      .map((edge) => ({ source: edge.source, target: edge.target, kind: edge.timeline?.kind })),
  };
}
