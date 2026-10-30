import type { GraphChartType } from "../../graph/types";
import type { StageData } from "./types";
import { parseLayoutResult, createLayoutResult, type LayoutResultDocument } from "../../schema/layoutResult";
import { validateTimelineArrangement } from "../timeline/layout-quality";
import { roundedTimelinePath } from "../timeline/routing";

export function applyLayoutResult(
  value: LayoutResultDocument,
  base: StageData,
  pins: Record<string, unknown> = {},
): StageData {
  const chart = ["compound", "timeline", "sankey", "spatial"].includes(base.layoutMode)
    ? (base.layoutMode as GraphChartType)
    : "node-link";
  if (chart === "compound") throw new Error("Nested results must be accepted against a prepared compound problem.");
  const result = parseLayoutResult(value, chart),
    g = result.geometry;
  const membership = (actual: { id: string }[], expected: string[], name: string) => {
    const ids = new Set(actual.map((v) => v.id));
    if (actual.length !== expected.length || ids.size !== actual.length || expected.some((id) => !ids.has(id)))
      throw new Error(`Layout ${name} must match the complete current scope exactly.`);
  };
  membership(
    g.nodes,
    base.nodes.map((n) => n.key),
    "nodes",
  );
  membership(
    g.edges,
    base.edges.map((e) => e.id),
    "edges",
  );
  membership(g.groups ?? [], base.groups?.map((n) => n.id) ?? [], "groups");
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(base.edges.map((e) => [e.id, e]));
  const groupMap = new Map(base.groups?.map((v) => [v.id, v]));
  const stage: StageData = {
    ...base,
    stageWidth: g.size[0],
    stageHeight: g.size[1],
    nodes: base.nodes.map((old) => {
      const n = nodes.get(old.key)!;
      return {
        ...old,
        x: n.position[0],
        y: n.position[1],
        ...(old.timeline ? { timeline: { ...old.timeline, labelX: n.label![0], labelY: n.label![1] } } : {}),
        ...(old.flow ? { flow: { ...old.flow, labelY: old.flow.labelY + n.position[1] - old.y } } : {}),
      };
    }),
    edges: g.edges.map((e) => {
      const old = edgeMap.get(e.id)!;
      const points = e.points?.map(([x, y], order) => ({ x, y, layer: old.points?.[order]?.layer ?? 0, order }));
      return {
        ...old,
        points,
        path: e.path ?? roundedTimelinePath(points!),
        labelPosition: { x: e.label[0], y: e.label[1] },
      };
    }),
    groups: g.groups?.map((g) => ({
      ...groupMap.get(g.id)!,
      x: g.position[0],
      y: g.position[1],
      width: g.size[0],
      height: g.size[1],
    })),
  };
  stage.nodeMap = { ...base.nodeMap, ...Object.fromEntries(stage.nodes.map((n) => [n.key, n])) };
  for (const group of stage.groups ?? [])
    if (stage.nodeMap[group.id])
      stage.nodeMap[group.id] = {
        ...stage.nodeMap[group.id],
        x: group.x + group.width / 2,
        y: group.y + group.height / 2,
        width: group.width,
        height: group.height,
      };
  if (base.timeline) {
    const horizontal = base.timeline.orientation === "horizontal";
    for (const n of g.nodes) {
      const old = base.nodeMap[n.id],
        timeIndex = horizontal ? 0 : 1,
        crossIndex = 1 - timeIndex;
      if (Math.abs(n.position[timeIndex] - (horizontal ? old.x : old.y)) > 0.01)
        throw new Error(`Preserve the time coordinate of ${n.id}.`);
      if (pins[n.id] !== undefined && Math.abs(n.position[crossIndex] - (horizontal ? old.y : old.x)) > 0.01)
        throw new Error(`Event is pinned: ${n.id}.`);
    }
    for (const e of g.edges) {
      const old = edgeMap.get(e.id)!;
      for (const end of [0, 1]) {
        const id = end ? old.target : old.source,
          n = nodes.get(id)!,
          original = base.nodeMap[id];
        const p = old.points?.[end ? old.points.length - 1 : 0],
          next = e.points![end ? e.points!.length - 1 : 0];
        if (
          !p ||
          Math.hypot(next[0] - p.x - n.position[0] + original.x, next[1] - p.y - n.position[1] + original.y) > 0.01
        )
          throw new Error(`Route ${e.id} must attach to its event time anchors.`);
      }
    }
    stage.timeline = { ...base.timeline };
    if (horizontal && base.timeline.canonicalStage) {
      const canonical = createLayoutResult(base.timeline.canonicalStage, "timeline");
      canonical.geometry = {
        size: [g.size[1], g.size[0]],
        nodes: g.nodes.map((n) => ({
          id: n.id,
          position: [n.position[1], n.position[0]],
          label: [n.label![1], n.label![0]],
        })),
        edges: g.edges.map((e) => ({
          id: e.id,
          points: e.points!.map((p) => [p[1], p[0]]),
          label: [e.label[1], e.label[0]],
        })),
      };
      stage.timeline.canonicalStage = applyLayoutResult(canonical, base.timeline.canonicalStage, pins);
    }
    const extents = new Map<string, { left: number; right: number }>();
    for (const node of stage.nodes) {
      const cross = horizontal ? node.y : node.x,
        label = horizontal ? node.timeline!.labelY : node.timeline!.labelX;
      const old = extents.get(node.timeline!.track);
      extents.set(node.timeline!.track, {
        left: Math.min(old?.left ?? Infinity, cross - 24),
        right: Math.max(old?.right ?? -Infinity, cross + 24, label + node.width + 24),
      });
    }
    stage.timeline.tracks = base.timeline.tracks.map((track) => {
      const extent = extents.get(track.id);
      return extent ? { ...track, x: extent.left, width: extent.right - extent.left } : track;
    });
    stage.lanes = stage.timeline.tracks.map((t, layer) => ({
      layer,
      label: t.label,
      x: t.x + t.width / 2,
      width: t.width,
    }));
  }
  const errors = base.timeline ? validateTimelineArrangement(base, stage) : [];
  if (errors.length) throw new Error(errors.join(" "));
  return stage;
}
