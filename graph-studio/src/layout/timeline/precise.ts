import type { StageData } from "../shared/types";
import type { TimelineLayoutInput } from "./input-types";
import { routeTimelineEdge } from "./edge-routing";
import { timelineLabelBox } from "./labels";
import { roundedTimelinePath } from "./routing";

/** Execute supplied coordinates literally. Only time semantics and route attachment are validated. */
export function applyTimelinePositions(stage: StageData, input: TimelineLayoutInput): StageData {
  const plan = input.arrangement;
  if (!plan?.placements?.length && !plan?.routes?.length) return stage;
  const result = structuredClone(stage);
  const horizontal = result.timeline?.orientation === "horizontal";
  const canonical = result.timeline?.canonicalStage ?? result;
  for (const placement of plan.placements ?? []) {
    const node = result.nodeMap[placement.id],
      base = canonical.nodeMap[placement.id];
    if (!node || !base) throw new Error(`Event outside the layout scope: ${placement.id}.`);
    const axis = horizontal ? "y" : "x";
    const delta = placement.cross - node[axis];
    const pin = input.timelineSettings?.pins?.[placement.id];
    if (pin !== undefined && Math.abs(delta) > 0.01) throw new Error(`Event is pinned: ${placement.id}.`);
    node[axis] = placement.cross;
    node.timeline![horizontal ? "labelY" : "labelX"] += delta;
    base.x = placement.cross;
    if (placement.label) {
      node.timeline!.labelX = placement.label.x;
      node.timeline!.labelY = placement.label.y;
    }
    if (horizontal) {
      base.timeline!.labelX = node.timeline!.labelY;
      base.timeline!.labelY = node.timeline!.labelX;
    }
  }
  const tracks = canonical.timeline!.tracks.map((track) => {
    const members = canonical.nodes.filter((n) => n.timeline!.track === track.id);
    if (!members.length) return track;
    const left = Math.min(...members.map((n) => n.x - 24));
    const right = Math.max(...members.map((n) => n.x + n.width + 24));
    return { ...track, x: left, width: right - left };
  });
  result.timeline!.tracks = canonical.timeline!.tracks = tracks;
  const explicit = new Map((plan.routes ?? []).map((route) => [route.id, route]));
  canonical.edges = canonical.edges.map((edge, index) => {
    const source = input.dag.edges.find((e) => e.id === edge.id)!;
    const auto = routeTimelineEdge(
      source,
      index,
      canonical.nodeMap,
      tracks,
      canonical.timeline!.axisMap,
      [],
      plan.edgeRouting ?? input.timelineSettings?.edgeRouting,
    );
    const provided = explicit.get(edge.id);
    if (!provided) return auto;
    const points = provided.points.map((p, order) => ({ ...(horizontal ? { x: p.y, y: p.x } : p), layer: 0, order }));
    for (const i of [0, points.length - 1]) {
      const expected = auto.points![i === 0 ? 0 : auto.points!.length - 1];
      if (Math.hypot(points[i].x - expected.x, points[i].y - expected.y) > 0.01)
        throw new Error(`Route ${edge.id} must attach to its event time anchors.`);
    }
    return {
      ...auto,
      points,
      path: roundedTimelinePath(points),
      labelPosition: provided.label
        ? horizontal
          ? { x: provided.label.y, y: provided.label.x }
          : provided.label
        : auto.labelPosition,
    };
  });
  for (const id of explicit.keys())
    if (!canonical.edges.some((e) => e.id === id)) throw new Error(`Unknown route: ${id}.`);
  result.edges = horizontal
    ? canonical.edges.map((edge) => {
        const points = edge.points!.map((p) => ({ ...p, x: p.y, y: p.x }));
        return {
          ...edge,
          points,
          path: roundedTimelinePath(points),
          labelPosition: { x: edge.labelPosition.y, y: edge.labelPosition.x },
        };
      })
    : canonical.edges;
  for (const s of new Set([canonical, result])) {
    const labels = s.nodes.map(timelineLabelBox);
    const points = s.edges.flatMap((e) => e.points ?? []);
    s.stageWidth = Math.max(
      600,
      ...s.nodes.map((n) => Math.max(n.x, s.timeline?.orientation === "horizontal" ? n.timeline!.endY : n.x) + 40),
      ...labels.map((b) => b.right + 40),
      ...points.map((p) => p.x + 40),
    );
    s.stageHeight = Math.max(
      360,
      ...s.nodes.map((n) => (s.timeline?.orientation === "horizontal" ? n.y : n.timeline!.endY) + 40),
      ...labels.map((b) => b.bottom + 40),
      ...points.map((p) => p.y + 40),
    );
    s.lanes = tracks.map((t, layer) => ({ layer, label: t.label, x: t.x + t.width / 2, width: t.width }));
  }
  return result;
}
