import { compoundModeSettings, type CompoundLayoutData } from "../graph/compound/layoutData";
import { finalizeCompoundStage } from "../layout/compound/finalizeStage";
import { formatTimelineDate } from "../graph/timeline/time";
import { formatRelativeTime } from "../graph/timeline/clock";
import type { CompoundView, GraphChartType, GraphDocument, GraphSelection } from "../graph/types";
import type { SpaceView } from "../graph/space";
import type { TimelineTimeRange } from "../graph/timeline/range";
import type { TimelineViewSettings } from "./appearance/types";
import type { StageData } from "../layout/shared/types";
import { isRecord } from "../shared/json";

export interface LayoutScope {
  selection: GraphSelection | null;
  compound: CompoundView;
  activeType: string;
  activeTrack: string;
  timelineRange: TimelineTimeRange | null;
  spatial: SpaceView;
}
export type LayoutPoint = [number, number];
export type LayoutRect = [number, number, number, number];
export interface LayoutNodeGeometry {
  id: string;
  position: LayoutPoint;
  size: LayoutPoint;
  text?: { title?: LayoutPoint; content?: LayoutRect };
  timeline?: {
    anchors: [number, number, number];
    label: LayoutPoint;
    lane: number;
    ports?: LayoutPoint[];
    labelMetrics?: LayoutRect;
  };
  flow?: { labelY: number; labelSide: "left" | "right" };
  spatial?: { depth: number; showLabel: boolean; labelSide: "left" | "right" };
}
export interface LayoutEdgeGeometry {
  id: string;
  path: string;
  points?: LayoutPoint[];
  label: LayoutPoint;
  flow?: { width: number; feedback?: boolean; directionPath?: string };
}
/** Independent geometry protocol. No graph text, Appearance values, lookup indexes or diagnostics. */
export interface LayoutGeometryData {
  generator?: StageData["layoutProvenance"];
  size: LayoutPoint;
  nodes: LayoutNodeGeometry[];
  edges: LayoutEdgeGeometry[];
  groups?: { id: string; position: LayoutPoint; size: LayoutPoint }[];
  lanes: { layer: number; extent: LayoutPoint }[];
  timeline?: {
    axis: LayoutPoint;
    range: [number | null, number | null];
    pixelsPerUnit: number;
    undated: number | null;
    map?: { mode: "linear" | "adaptive"; range: LayoutPoint; extent: LayoutPoint; knots: LayoutPoint[] };
    ticks: LayoutPoint[];
    tracks: { id: string; extent: LayoutPoint }[];
    canonical?: LayoutGeometryData;
  };
  spatial?: {
    guides: { path: string; labelPosition?: LayoutPoint }[];
    bounds?: LayoutRect;
    unitScale: number;
    pixelsPerUnit: number;
  };
}
export const TIMELINE_LAYOUT_KEYS = [
  "layout",
  "orientation",
  "edgeRouting",
  "axis",
  "relativeTickStep",
  "tickStep",
  "tickUnit",
  "compactness",
  "locked",
  "pins",
] as const;
export function timelineLayoutSettings(settings: Partial<TimelineViewSettings>) {
  return Object.fromEntries(
    TIMELINE_LAYOUT_KEYS.filter((key) => settings[key] !== undefined).map((key) => [key, settings[key]]),
  ) as Partial<Pick<TimelineViewSettings, (typeof TIMELINE_LAYOUT_KEYS)[number]>>;
}
export interface LayoutRendering {
  compoundDesign?: import("../layout/compound/ai/design").CompoundDesign;
  graphFingerprint: string;
  settingsFingerprint: string;
  scope: LayoutScope;
  timelineSettings: TimelineViewSettings;
  geometry: LayoutGeometryData;
}

export function validateLayoutScope(scope: unknown): asserts scope is LayoutScope {
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const strings = (v: unknown) => Array.isArray(v) && v.every((id) => typeof id === "string");
  const fail = () => {
    throw new Error("Invalid Layout scope.");
  };
  if (!isRecord(scope)) return fail();
  const { selection, compound, spatial, timelineRange } = scope;
  if (
    selection !== null &&
    (!isRecord(selection) ||
      !(
        selection.type === "full" ||
        (selection.type === "node" && typeof selection.key === "string") ||
        (selection.type === "forest" && strings(selection.keys) && typeof selection.label === "string")
      ))
  )
    fail();
  if (
    !isRecord(compound) ||
    !(compound.focusGroupId === null || typeof compound.focusGroupId === "string") ||
    !strings(compound.collapsedGroupIds)
  )
    fail();
  if (typeof scope.activeType !== "string" || typeof scope.activeTrack !== "string") fail();
  if (
    timelineRange !== null &&
    (!isRecord(timelineRange) ||
      (timelineRange.start !== undefined && !finite(timelineRange.start)) ||
      (timelineRange.end !== undefined && !finite(timelineRange.end)) ||
      (typeof timelineRange.start === "number" &&
        typeof timelineRange.end === "number" &&
        timelineRange.start > timelineRange.end))
  )
    fail();
  if (
    !isRecord(spatial) ||
    !Array.isArray(spatial.axes) ||
    spatial.axes.length !== 3 ||
    !spatial.axes.every(finite) ||
    !["orthographic", "perspective", "map"].includes(String(spatial.projection)) ||
    !finite(spatial.yaw) ||
    !finite(spatial.pitch) ||
    [spatial.labels, spatial.grid, spatial.hideBackPoints].some((v) => typeof v !== "boolean") ||
    (spatial.unitScale !== undefined && (!finite(spatial.unitScale) || Number(spatial.unitScale) <= 0))
  )
    fail();
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
/** Stable non-security cache identity; associations themselves do not change geometry. */
export function layoutIdentity(value: unknown): string {
  const text = canonical(value);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
export function graphLayoutIdentity(graph: GraphDocument): string {
  const metadata = { ...graph.metadata };
  delete metadata.layout;
  delete metadata.style;
  return layoutIdentity({ ...graph, metadata });
}
export function captureLayoutGeometry(stage: StageData): LayoutGeometryData {
  const t = stage.timeline,
    sp = stage.spatial;
  return {
    ...(stage.layoutProvenance ? { generator: structuredClone(stage.layoutProvenance) } : {}),
    size: [stage.stageWidth, stage.stageHeight],
    nodes: stage.nodes.map((n) => ({
      id: n.key,
      position: [n.x, n.y],
      size: [n.width, n.height],
      ...(n.titleLayout || n.contentLayout
        ? {
            text: {
              ...(n.titleLayout ? { title: [n.titleLayout.x, n.titleLayout.lineHeight] as LayoutPoint } : {}),
              ...(n.contentLayout
                ? {
                    content: [
                      n.contentLayout.titleY,
                      n.contentLayout.detailY,
                      n.contentLayout.detailLineHeight,
                      n.contentLayout.badgeY,
                    ] as LayoutRect,
                  }
                : {}),
            },
          }
        : {}),
      ...(n.timeline
        ? {
            timeline: {
              anchors: [n.timeline.startY, n.timeline.endY, n.timeline.anchorY] as [number, number, number],
              label: [n.timeline.labelX, n.timeline.labelY] as LayoutPoint,
              lane: n.timeline.lane,
              ...(n.timeline.ports ? { ports: n.timeline.ports.map((p) => [p.time, p.y] as LayoutPoint) } : {}),
              ...(n.timeline.labelMetrics
                ? {
                    labelMetrics: [
                      n.timeline.labelMetrics.top,
                      n.timeline.labelMetrics.bottom,
                      n.timeline.labelMetrics.dateOffset,
                      n.timeline.labelMetrics.detailOffset,
                    ] as LayoutRect,
                  }
                : {}),
            },
          }
        : {}),
      ...(n.flow ? { flow: { labelY: n.flow.labelY, labelSide: n.flow.labelSide } } : {}),
      ...(n.spatial
        ? { spatial: { depth: n.spatial.depth, showLabel: n.spatial.showLabel, labelSide: n.spatial.labelSide } }
        : {}),
    })),
    edges: stage.edges.map((e) => ({
      id: e.id,
      path: e.path,
      label: [e.labelPosition.x, e.labelPosition.y],
      ...(e.points ? { points: e.points.map((p) => [p.x, p.y] as LayoutPoint) } : {}),
      ...(e.flow
        ? {
            flow: {
              width: e.flow.width,
              ...(e.flow.feedback !== undefined ? { feedback: e.flow.feedback } : {}),
              ...(e.flow.directionPath !== undefined ? { directionPath: e.flow.directionPath } : {}),
            },
          }
        : {}),
    })),
    ...(stage.groups?.length
      ? {
          groups: stage.groups.map((g) => ({
            id: g.id,
            position: [g.x, g.y] as LayoutPoint,
            size: [g.width, g.height] as LayoutPoint,
          })),
        }
      : {}),
    lanes: stage.lanes.map((l) => ({ layer: l.layer, extent: [l.x, l.width] })),
    ...(t
      ? {
          timeline: {
            axis: [t.axisX, t.originY] as LayoutPoint,
            range: [t.start, t.end] as [number | null, number | null],
            pixelsPerUnit: t.pixelsPerUnit,
            undated: t.undatedY,
            ...(t.axisMap
              ? {
                  map: {
                    mode: t.axisMap.mode,
                    range: [t.axisMap.start, t.axisMap.end] as LayoutPoint,
                    extent: [t.axisMap.originY, t.axisMap.height] as LayoutPoint,
                    knots: t.axisMap.knots.map((k) => [k.time, k.y] as LayoutPoint),
                  },
                }
              : {}),
            ticks: t.ticks.map((k) => [k.time, k.y] as LayoutPoint),
            tracks: t.tracks.map((track) => ({ id: track.id, extent: [track.x, track.width] as LayoutPoint })),
            ...(t.canonicalStage ? { canonical: captureLayoutGeometry(t.canonicalStage) } : {}),
          },
        }
      : {}),
    ...(sp
      ? {
          spatial: {
            guides: sp.guides.map((g) => ({
              path: g.path,
              ...(g.x !== undefined && g.y !== undefined ? { labelPosition: [g.x, g.y] as LayoutPoint } : {}),
            })),
            ...(sp.fitBounds
              ? { bounds: [sp.fitBounds.x, sp.fitBounds.y, sp.fitBounds.width, sp.fitBounds.height] as LayoutRect }
              : {}),
            unitScale: sp.unitScale,
            pixelsPerUnit: sp.pixelsPerUnit,
          },
        }
      : {}),
  };
}

export function restoreLayoutGeometry(data: LayoutGeometryData, base: StageData): StageData {
  const nodes = data.nodes.map((n) => {
    const original = base.nodeMap[n.id];
    if (!original) throw new Error(`Layout node is outside the current graph: ${n.id}.`);
    return {
      ...original,
      x: n.position[0],
      y: n.position[1],
      width: n.size[0],
      height: n.size[1],
      ...(n.text?.title && original.titleLayout
        ? { titleLayout: { ...original.titleLayout, x: n.text.title[0], lineHeight: n.text.title[1] } }
        : {}),
      ...(n.text?.content
        ? {
            contentLayout: {
              titleY: n.text.content[0],
              detailY: n.text.content[1],
              detailLineHeight: n.text.content[2],
              badgeY: n.text.content[3],
            },
          }
        : {}),
      ...(n.timeline && original.timeline
        ? {
            timeline: {
              ...original.timeline,
              startY: n.timeline.anchors[0],
              endY: n.timeline.anchors[1],
              anchorY: n.timeline.anchors[2],
              labelX: n.timeline.label[0],
              labelY: n.timeline.label[1],
              lane: n.timeline.lane,
              ports: n.timeline.ports?.map(([time, y]) => ({ time, y })),
              ...(n.timeline.labelMetrics
                ? {
                    labelMetrics: {
                      top: n.timeline.labelMetrics[0],
                      bottom: n.timeline.labelMetrics[1],
                      dateOffset: n.timeline.labelMetrics[2],
                      detailOffset: n.timeline.labelMetrics[3],
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(n.flow && original.flow ? { flow: { ...original.flow, ...n.flow } } : {}),
      ...(n.spatial && original.spatial ? { spatial: { ...original.spatial, ...n.spatial } } : {}),
    };
  });
  const edgeMap = new Map(base.edges.map((e) => [e.id, e]));
  const edges = data.edges.map((e) => {
    const original = edgeMap.get(e.id);
    if (!original) throw new Error(`Layout edge is outside the current graph: ${e.id}.`);
    return {
      ...original,
      path: e.path,
      points: e.points?.map(([x, y], order) => ({
        x,
        y,
        layer: original.points?.[order]?.layer ?? 0,
        order: original.points?.[order]?.order ?? order,
      })),
      labelPosition: { x: e.label[0], y: e.label[1] },
      ...(e.flow && original.flow ? { flow: { ...original.flow, ...e.flow } } : {}),
    };
  });
  const groupMap = new Map(base.groups?.map((g) => [g.id, g]));
  const groups = data.groups?.map((g) => {
    const original = groupMap.get(g.id);
    if (!original) throw new Error(`Layout group is outside the current graph: ${g.id}.`);
    return { ...original, x: g.position[0], y: g.position[1], width: g.size[0], height: g.size[1] };
  });
  const nodeMap = { ...base.nodeMap, ...Object.fromEntries(nodes.map((n) => [n.key, n])) };
  for (const group of groups ?? [])
    if (nodeMap[group.id])
      nodeMap[group.id] = {
        ...nodeMap[group.id],
        x: group.x + group.width / 2,
        y: group.y + group.height / 2,
        width: group.width,
        height: group.height,
      };
  const laneMap = new Map(base.lanes.map((l) => [l.layer, l]));
  const result: StageData = {
    ...base,
    layoutProvenance: data.generator,
    nodes,
    edges,
    nodeMap,
    groups,
    stageWidth: data.size[0],
    stageHeight: data.size[1],
    lanes: data.lanes.map((l) => ({
      layer: l.layer,
      label: laneMap.get(l.layer)?.label ?? "",
      x: l.extent[0],
      width: l.extent[1],
    })),
  };
  if (data.timeline && base.timeline) {
    const t = data.timeline,
      tracks = new Map(base.timeline.tracks.map((track) => [track.id, track]));
    result.timeline = {
      ...base.timeline,
      axisX: t.axis[0],
      originY: t.axis[1],
      start: t.range[0],
      end: t.range[1],
      pixelsPerUnit: t.pixelsPerUnit,
      undatedY: t.undated,
      axisMap: t.map
        ? {
            mode: t.map.mode,
            start: t.map.range[0],
            end: t.map.range[1],
            originY: t.map.extent[0],
            height: t.map.extent[1],
            knots: t.map.knots.map(([time, y]) => ({ time, y })),
          }
        : undefined,
      ticks: t.ticks.map(([time, y]) => ({
        time,
        y,
        label: base.timeline!.ticks.find((tick) => tick.time === time)?.label ?? formatSavedTick(time, base.timeline!),
      })),
      tracks: t.tracks.map((track) => ({
        ...tracks.get(track.id)!,
        id: track.id,
        x: track.extent[0],
        width: track.extent[1],
      })),
      canonicalStage: t.canonical
        ? restoreLayoutGeometry(t.canonical, base.timeline.canonicalStage ?? base)
        : undefined,
    };
  }
  if (data.spatial && base.spatial) {
    const sp = data.spatial;
    result.spatial = {
      ...base.spatial,
      unitScale: sp.unitScale,
      pixelsPerUnit: sp.pixelsPerUnit,
      guides: sp.guides.map((g, i) => ({
        ...base.spatial!.guides[i],
        path: g.path,
        ...(g.labelPosition ? { x: g.labelPosition[0], y: g.labelPosition[1] } : {}),
      })),
      fitBounds: sp.bounds
        ? { x: sp.bounds[0], y: sp.bounds[1], width: sp.bounds[2], height: sp.bounds[3] }
        : undefined,
    };
  }
  finalizeCompoundStage(result, base.compoundLayout);
  return result;
}

function formatSavedTick(time: number, timeline: NonNullable<StageData["timeline"]>) {
  return timeline.clock?.mode === "relative" ? formatRelativeTime(time, timeline.clock) : formatTimelineDate(time);
}

export function validateLayoutGeometryData(
  value: unknown,
  chart?: GraphChartType,
): asserts value is LayoutGeometryData {
  const fail = (path: string): never => {
    throw new Error(`Invalid Layout geometry at ${path}.`);
  };
  const obj = (v: unknown, allowed: string[], path: string): Record<string, any> => {
    if (!isRecord(v) || Object.keys(v).some((k) => !allowed.includes(k))) return fail(path);
    return v;
  };
  const number = (v: unknown, path: string) => {
    if (typeof v !== "number" || !Number.isFinite(v)) fail(path);
  };
  const tuple = (v: unknown, length: number, path: string): number[] => {
    if (!Array.isArray(v) || v.length !== length) return fail(path);
    v.forEach((n, i) => number(n, `${path}[${i}]`));
    return v;
  };
  const positiveSize = (v: unknown, path: string) => {
    const a = tuple(v, 2, path);
    if (a[0] <= 0 || a[1] < 0) fail(path);
  };
  const array = (v: unknown, path: string): any[] => (Array.isArray(v) ? v : fail(path));
  const id = (v: unknown, path: string) => {
    if (typeof v !== "string" || !v) fail(path);
  };
  const ids = (v: any[], path: string) => {
    const set = new Set<string>();
    v.forEach((item) => {
      id(item.id, path);
      if (set.has(item.id)) fail(path);
      set.add(item.id);
    });
  };
  const bool = (v: unknown, path: string) => {
    if (typeof v !== "boolean") fail(path);
  };
  const side = (v: unknown, path: string) => {
    if (v !== "left" && v !== "right") fail(path);
  };
  const g = obj(value, ["size", "nodes", "edges", "groups", "lanes", "timeline", "spatial", "generator"], "geometry");
  if (g.generator !== undefined) {
    const generator = obj(g.generator, ["method", "engine", "parameters"], "generator");
    if (!["automatic", "ai", "fcose"].includes(String(generator.method)) || typeof generator.engine !== "string")
      fail("generator");
    if (generator.parameters !== undefined && !isRecord(generator.parameters)) fail("generator.parameters");
  }
  positiveSize(g.size, "size");
  if (g.size[1] <= 0) fail("size");
  const nodes = array(g.nodes, "nodes"),
    edges = array(g.edges, "edges"),
    groups = g.groups === undefined ? [] : array(g.groups, "groups");
  ids(nodes, "nodes[].id");
  ids(edges, "edges[].id");
  ids(groups, "groups[].id");
  for (const n of nodes) {
    obj(n, ["id", "position", "size", "text", "timeline", "flow", "spatial"], "nodes[]");
    tuple(n.position, 2, "nodes[].position");
    positiveSize(n.size, "nodes[].size");
    if (n.text !== undefined) {
      const t = obj(n.text, ["title", "content"], "nodes[].text");
      if (t.title !== undefined) tuple(t.title, 2, "text.title");
      if (t.content !== undefined) tuple(t.content, 4, "text.content");
    }
    if (n.timeline !== undefined) {
      if (chart && chart !== "timeline") fail("nodes[].timeline");
      const t = obj(n.timeline, ["anchors", "label", "lane", "ports", "labelMetrics"], "nodes[].timeline");
      tuple(t.anchors, 3, "timeline.anchors");
      tuple(t.label, 2, "timeline.label");
      number(t.lane, "timeline.lane");
      if (t.ports !== undefined) array(t.ports, "timeline.ports").forEach((p) => tuple(p, 2, "timeline.ports[]"));
      if (t.labelMetrics !== undefined) tuple(t.labelMetrics, 4, "timeline.labelMetrics");
    } else if (chart === "timeline") fail("nodes[].timeline");
    if (n.flow !== undefined) {
      if (chart && chart !== "sankey") fail("nodes[].flow");
      const f = obj(n.flow, ["labelY", "labelSide"], "nodes[].flow");
      number(f.labelY, "flow.labelY");
      side(f.labelSide, "flow.labelSide");
    }
    if (n.spatial !== undefined) {
      if (chart && chart !== "spatial") fail("nodes[].spatial");
      const s = obj(n.spatial, ["depth", "showLabel", "labelSide"], "nodes[].spatial");
      number(s.depth, "spatial.depth");
      bool(s.showLabel, "spatial.showLabel");
      side(s.labelSide, "spatial.labelSide");
    }
  }
  for (const e of edges) {
    obj(e, ["id", "path", "points", "label", "flow"], "edges[]");
    if (typeof e.path !== "string") fail("edges[].path");
    tuple(e.label, 2, "edges[].label");
    if (e.points !== undefined) array(e.points, "edges[].points").forEach((p) => tuple(p, 2, "edges[].points[]"));
    if (e.flow !== undefined) {
      if (chart && chart !== "sankey") fail("edges[].flow");
      const f = obj(e.flow, ["width", "feedback", "directionPath"], "edges[].flow");
      number(f.width, "flow.width");
      if (f.feedback !== undefined) bool(f.feedback, "flow.feedback");
      if (f.directionPath !== undefined && typeof f.directionPath !== "string") fail("flow.directionPath");
    }
  }
  for (const group of groups) {
    if (chart && chart !== "compound") fail("groups");
    obj(group, ["id", "position", "size"], "groups[]");
    tuple(group.position, 2, "groups[].position");
    positiveSize(group.size, "groups[].size");
  }
  for (const lane of array(g.lanes, "lanes")) {
    obj(lane, ["layer", "extent"], "lanes[]");
    number(lane.layer, "lanes[].layer");
    tuple(lane.extent, 2, "lanes[].extent");
  }
  if (g.timeline !== undefined) {
    if (chart && chart !== "timeline") fail("timeline");
    const t = obj(
      g.timeline,
      ["axis", "range", "pixelsPerUnit", "undated", "map", "ticks", "tracks", "canonical"],
      "timeline",
    );
    tuple(t.axis, 2, "timeline.axis");
    const range = array(t.range, "timeline.range");
    if (range.length !== 2) fail("timeline.range");
    range.forEach((v) => {
      if (v !== null) number(v, "timeline.range");
    });
    number(t.pixelsPerUnit, "timeline.pixelsPerUnit");
    if (t.undated !== null) number(t.undated, "timeline.undated");
    if (t.map !== undefined) {
      const m = obj(t.map, ["mode", "range", "extent", "knots"], "timeline.map");
      if (!["linear", "adaptive"].includes(m.mode)) fail("timeline.map.mode");
      tuple(m.range, 2, "timeline.map.range");
      tuple(m.extent, 2, "timeline.map.extent");
      array(m.knots, "timeline.map.knots").forEach((p) => tuple(p, 2, "timeline.map.knots[]"));
    }
    array(t.ticks, "timeline.ticks").forEach((p) => tuple(p, 2, "timeline.ticks[]"));
    const tracks = array(t.tracks, "timeline.tracks");
    ids(tracks, "timeline.tracks[].id");
    for (const track of tracks) {
      obj(track, ["id", "extent"], "timeline.tracks[]");
      tuple(track.extent, 2, "timeline.tracks[].extent");
    }
    if (t.canonical !== undefined) {
      validateLayoutGeometryData(t.canonical, "timeline");
      if (t.canonical.timeline?.canonical) fail("timeline.canonical");
    }
  } else if (chart === "timeline") fail("timeline");
  if (g.spatial !== undefined) {
    if (chart && chart !== "spatial") fail("spatial");
    const s = obj(g.spatial, ["guides", "bounds", "unitScale", "pixelsPerUnit"], "spatial");
    number(s.unitScale, "spatial.unitScale");
    number(s.pixelsPerUnit, "spatial.pixelsPerUnit");
    if (s.bounds !== undefined) tuple(s.bounds, 4, "spatial.bounds");
    for (const guide of array(s.guides, "spatial.guides")) {
      obj(guide, ["path", "labelPosition"], "spatial.guides[]");
      if (typeof guide.path !== "string") fail("spatial.guides[].path");
      if (guide.labelPosition !== undefined) tuple(guide.labelPosition, 2, "spatial.guides[].labelPosition");
    }
  }
}

export function renderingMatches(
  rendering: LayoutRendering,
  graph: GraphDocument,
  settings: unknown,
  stage: StageData,
) {
  const sameIds = (saved: string[], current: string[]) =>
    layoutIdentity(saved.sort()) === layoutIdentity(current.sort());
  return (
    (stage.layoutProvenance?.method !== "fcose" ||
      (rendering.geometry.generator?.method === "fcose" &&
        rendering.geometry.generator.engine === stage.layoutProvenance.engine &&
        layoutIdentity(rendering.geometry.generator.parameters) === layoutIdentity(stage.layoutProvenance.parameters))) &&
    rendering.graphFingerprint === graphLayoutIdentity(graph) &&
    rendering.settingsFingerprint === layoutIdentity(settings) &&
    sameIds(
      rendering.geometry.nodes.map((n) => n.id),
      stage.nodes.map((n) => n.key),
    ) &&
    sameIds(
      rendering.geometry.edges.map((e) => e.id),
      stage.edges.map((e) => e.id),
    ) &&
    sameIds(
      (rendering.geometry.groups ?? []).map((g) => g.id),
      (stage.groups ?? []).map((g) => g.id),
    ) &&
    (!rendering.geometry.timeline ||
      sameIds(
        rendering.geometry.timeline.tracks.map((t) => t.id),
        stage.timeline?.tracks.map((t) => t.id) ?? [],
      ))
  );
}
export function renderingSettings(
  chart: GraphChartType,
  charts: unknown,
  scope: LayoutScope,
  timeline: TimelineViewSettings,
) {
  const stored = (charts as Record<string, unknown>)[chart];
  const compound = chart === "compound" ? stored as CompoundLayoutData : undefined;
  return {
    chart,
    settings: compound ? { method: compound.method, ...compoundModeSettings(compound) } : stored ?? {},
    scope: layoutScopeForChart(chart, scope),
    ...(chart === "timeline" ? { timeline: timelineLayoutSettings(timeline) } : {}),
  };
}
export function layoutScopeForChart(chart: GraphChartType, scope: LayoutScope): Record<string, unknown> {
  return {
    selection: scope.selection,
    activeType: scope.activeType,
    ...(chart === "compound"
      ? { focusGroupId: scope.compound.focusGroupId, collapsedGroupIds: scope.compound.collapsedGroupIds }
      : {}),
    ...(chart === "timeline" ? { activeTrack: scope.activeTrack, timeRange: scope.timelineRange } : {}),
    ...(chart === "spatial" ? { camera: scope.spatial } : {}),
  };
}
