import type { CompoundView, GraphChartType, GraphDocument, GraphSelection } from "../graph/types";
import type { SpaceView } from "../graph/space";
import type { TimelineTimeRange } from "../graph/timeline/range";
import type { TimelineViewSettings } from "./appearance/types";
import type { StageData } from "../layout/shared/types";
import type { LayoutGeometry } from "../layout/compound/layout-plan";
import { isRecord } from "../shared/json";

export interface LayoutScope {
  selection: GraphSelection | null;
  compound: CompoundView;
  activeType: string;
  activeTrack: string;
  timelineRange: TimelineTimeRange | null;
  spatial: SpaceView;
}
/** Renderer payload; graph content and runtime lookup indexes stay in the graph/session. */
export type LayoutGeometryData = Omit<
  StageData,
  "dag" | "nodeMap" | "connectedKeysByNode" | "compoundLayout" | "timeline"
> & {
  timeline?: Omit<NonNullable<StageData["timeline"]>, "canonicalStage"> & { canonicalStage?: LayoutGeometryData };
  compoundGeometry?: LayoutGeometry;
};
export interface LayoutRendering {
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
  const {
    dag: _dag,
    nodeMap: _nodeMap,
    connectedKeysByNode: _connected,
    compoundLayout,
    timeline,
    ...geometry
  } = stage;
  const { canonicalStage, ...time } = timeline ?? {};
  return JSON.parse(
    JSON.stringify({
      ...geometry,
      ...(timeline
        ? {
            timeline: { ...time, ...(canonicalStage ? { canonicalStage: captureLayoutGeometry(canonicalStage) } : {}) },
          }
        : {}),
      ...(compoundLayout ? { compoundGeometry: compoundLayout.baseline } : {}),
    }),
  );
}
export function restoreLayoutGeometry(data: LayoutGeometryData, base: StageData): StageData {
  const { timeline, compoundGeometry, ...geometry } = structuredClone(data);
  const { canonicalStage, ...time } = timeline ?? {};
  const nodes = geometry.nodes;
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.key, node]));
  const connectedKeysByNode = new Map(nodes.map((node) => [node.key, new Set([node.key])]));
  for (const edge of geometry.edges) {
    connectedKeysByNode.get(edge.source)!.add(edge.target);
    connectedKeysByNode.get(edge.target)!.add(edge.source);
  }
  return {
    ...base,
    ...geometry,
    nodeMap,
    connectedKeysByNode,
    ...(timeline
      ? {
          timeline: {
            ...time,
            ...(canonicalStage
              ? { canonicalStage: restoreLayoutGeometry(canonicalStage, base.timeline?.canonicalStage ?? base) }
              : {}),
          } as StageData["timeline"],
        }
      : {}),
    ...(compoundGeometry && base.compoundLayout
      ? { compoundLayout: { ...base.compoundLayout, baseline: compoundGeometry } }
      : {}),
  };
}

export function validateLayoutGeometryData(value: unknown): asserts value is LayoutGeometryData {
  const fail = () => {
    throw new Error("Invalid Layout rendering geometry.");
  };
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const point = (v: unknown) => isRecord(v) && finite(v.x) && finite(v.y);
  // No NaN, Infinity, executable values, prototype keys or non-JSON collections cross the file boundary.
  const json = (v: unknown): void => {
    if (typeof v === "number" && !Number.isFinite(v)) fail();
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) return;
    if (Array.isArray(v)) {
      v.forEach(json);
      return;
    }
    if (!isRecord(v)) fail();
    for (const [key, entry] of Object.entries(v as object)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) fail();
      json(entry);
    }
  };
  json(value);
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !finite(value.stageWidth) ||
    !finite(value.stageHeight) ||
    Number(value.stageWidth) <= 0 ||
    Number(value.stageHeight) <= 0 ||
    !Array.isArray(value.lanes) ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.topLevelKeys) ||
    !isRecord(value.selection) ||
    typeof value.layoutMode !== "string"
  )
    fail();
  const data = value as LayoutGeometryData;
  const ids = new Set<string>();
  for (const node of data.nodes) {
    if (
      !point(node) ||
      typeof node.key !== "string" ||
      ids.has(node.key) ||
      !finite(node.width) ||
      node.width <= 0 ||
      !finite(node.height) ||
      node.height < 0 ||
      typeof node.displayTitle !== "string" ||
      !Array.isArray(node.detailLines)
    )
      fail();
    ids.add(node.key);
    if (
      data.layoutMode === "timeline" &&
      (!node.timeline ||
        !finite(node.timeline.startY) ||
        !finite(node.timeline.endY) ||
        !finite(node.timeline.labelX) ||
        !finite(node.timeline.labelY))
    )
      fail();
  }
  const edges = new Set<string>();
  for (const edge of data.edges) {
    if (
      !edge ||
      typeof edge.id !== "string" ||
      edges.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      typeof edge.path !== "string" ||
      !point(edge.labelPosition) ||
      (edge.points !== undefined && (!Array.isArray(edge.points) || edge.points.some((p) => !point(p))))
    )
      fail();
    edges.add(edge.id);
  }
  for (const group of data.groups ?? []) if (!point(group) || !finite(group.width) || !finite(group.height)) fail();
  if (
    data.layoutMode === "timeline" &&
    (!data.timeline || !Array.isArray(data.timeline.tracks) || !Array.isArray(data.timeline.ticks))
  )
    fail();
  if (data.timeline?.canonicalStage) validateLayoutGeometryData(data.timeline.canonicalStage);
}

export function renderingMatches(
  rendering: LayoutRendering,
  graph: GraphDocument,
  settings: unknown,
  stage: StageData,
) {
  return (
    rendering.graphFingerprint === graphLayoutIdentity(graph) &&
    rendering.settingsFingerprint === layoutIdentity(settings) &&
    layoutIdentity(rendering.geometry.nodes.map((n) => n.key).sort()) ===
      layoutIdentity(stage.nodes.map((n) => n.key).sort()) &&
    layoutIdentity(rendering.geometry.edges.map((e) => [e.id, e.source, e.target]).sort()) ===
      layoutIdentity(stage.edges.map((e) => [e.id, e.source, e.target]).sort())
  );
}
export function renderingSettings(
  chart: GraphChartType,
  charts: unknown,
  scope: LayoutScope,
  timeline: TimelineViewSettings,
) {
  return {
    chart,
    settings: (charts as Record<string, unknown>)[chart] ?? {},
    scope: layoutScopeForChart(chart, scope),
    ...(chart === "timeline" ? { timeline } : {}),
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
