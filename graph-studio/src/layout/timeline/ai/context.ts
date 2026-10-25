import { measureTimelineLayout } from "../layout-quality";
import { timelineLabelBox } from "../labels";
import { getNodeTitle } from "../../../graph/accessors";
import { getTimelineClock } from "../../../graph/timeline/clock";
import { resolveTimeline as sanitizeTimelineSettings } from "../../../schema/appearance/contract";
import type { StageData } from "../../shared/types";
import type { TimelineLayoutInput } from "../layout-candidate";

export function timelineLayoutContext(input: TimelineLayoutInput, stage: StageData, focus?: string | null) {
  const saved = { mode: input.arrangement ? "ai" : "algorithm", plan: input.arrangement };
  const currentPlan =
    input.arrangement === undefined ? (saved.mode === "ai" ? saved.plan : undefined) : input.arrangement;
  const currentSettings = sanitizeTimelineSettings({
    ...input.timelineSettings,
    ...(currentPlan?.edgeRouting ? { edgeRouting: currentPlan.edgeRouting } : {}),
  });
  const nodes = [...stage.nodes].sort(
    (a, b) => Number(b.key === focus) - Number(a.key === focus) || a.key.localeCompare(b.key),
  );
  const selected = nodes;
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
    settings: currentSettings,
    currentPlan,
    geometry: {
      width: stage.stageWidth,
      height: stage.stageHeight,
      axis: stage.timeline?.axisMap,
      tracks: stage.timeline?.tracks,
    },
    quality: measureTimelineLayout(stage),
    currentTrackOrder: stage.timeline!.tracks.map((track) => track.id),
    totalEvents: nodes.length,
    totalRelationships: stage.edges.length,
    sampledEvents: selected.length,
    truncated: false,
    tracks: [...tracks.values()],
    trackConnections: [...connections.values()].sort((a, b) => b.count - a.count),
    events: selected.map((node) => ({
      id: node.key,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      label: { x: node.timeline!.labelX, y: node.timeline!.labelY, bounds: timelineLabelBox(node) },
      timeAnchors: { start: node.timeline!.startY, end: node.timeline!.endY, ports: node.timeline!.ports },
      title: getNodeTitle(input.dag.nodes[node.key]),
      track: node.timeline!.track,
      start: node.timeline!.start,
      end: node.timeline!.end,
      status: node.timeline!.status,
      space: node.timeline!.space,
      pinned: Object.prototype.hasOwnProperty.call(input.timelineSettings?.pins ?? {}, node.key),
    })),
    relationships: stage.edges
      .filter((edge) => ids.has(edge.source) || ids.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationship: edge.timeline,
        points: edge.points,
        label: edge.labelPosition,
      })),
  };
}
