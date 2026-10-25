import { defaultSpaceView } from "../graph/space";
import {
  graphLayoutIdentity,
  layoutScopeForChart,
  validateLayoutScope,
  validateLayoutGeometryData,
  type LayoutRendering,
} from "./layoutGeometry";
import { resolveTimeline } from "./appearance/contract";
import { isRecord } from "../shared/json";
import { emptyLayoutData, parseCompoundLayout, type CompoundLayoutData } from "../graph/compound/layoutData";
import { parseTimelineLayoutPlan, timelineTrack, type TimelineLayoutData } from "../graph/timeline/layoutData";
import type { GraphDocument, GraphLayoutMode, GraphChartType } from "../graph/types";

/** Internal session state. Persist only createChartLayoutDocument(), the chart-specific file protocol below. */
export interface LayoutDocument {
  format: "graph-studio-layout";
  version: 2;
  activeChart?: GraphChartType;
  timelineView?: import("./appearance/types").TimelineViewSettings;
  renderings?: Partial<Record<GraphChartType, LayoutRendering>>;
  charts: {
    compound: CompoundLayoutData;
    timeline: TimelineLayoutData;
    "node-link": { method: GraphLayoutMode };
  };
}

export function defaultLayoutDocument(): LayoutDocument {
  return {
    format: "graph-studio-layout",
    version: 2,
    charts: {
      compound: emptyLayoutData(),
      timeline: { version: 1, mode: "algorithm" },
      "node-link": { method: "sugiyama" },
    },
  };
}

function object(value: unknown, allowed: string[], label: string) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}.`);
  return value;
}

export function parseLayoutDocument(value: unknown): LayoutDocument {
  if (isRecord(value) && value.chartType !== undefined) return parseChartLayoutFile(value);
  const r = object(value, ["format", "version", "charts", "activeChart", "renderings", "timelineView"], "layout");
  if (r.format !== "graph-studio-layout" || ![1, 2].includes(r.version as number))
    throw new Error("Expected graph-studio-layout version 1 or 2.");
  const charts = object(r.charts, ["compound", "timeline", "node-link"], "layout charts");
  const result = defaultLayoutDocument();
  if (r.timelineView !== undefined) result.timelineView = resolveTimeline(r.timelineView);
  if (charts.compound !== undefined) result.charts.compound = parseCompoundLayout(charts.compound);
  if (charts.timeline !== undefined) {
    const t = object(charts.timeline, ["version", "mode", "plan", "basis"], "timeline layout");
    if (t.version !== undefined && t.version !== 1) throw new Error("Unsupported timeline layout version.");
    if (t.mode !== "algorithm" && t.mode !== "ai") throw new Error("Invalid timeline layout mode.");
    result.charts.timeline = {
      version: 1,
      mode: t.mode,
      ...(typeof t.basis === "string" ? { basis: t.basis } : {}),
      ...(t.plan === undefined ? {} : { plan: parseTimelineLayoutPlan(t.plan) }),
    };
  }
  if (charts["node-link"] !== undefined) {
    const n = object(charts["node-link"], ["method"], "node-link layout");
    if (!["level", "sugiyama", "dagre"].includes(n.method as string))
      throw new Error("Invalid node-link layout method.");
    result.charts["node-link"] = { method: n.method as GraphLayoutMode };
  }
  const chartTypes = ["compound", "timeline", "node-link", "sankey", "spatial"];
  if (r.activeChart !== undefined) {
    if (!chartTypes.includes(r.activeChart as string)) throw new Error("Invalid active Layout chart.");
    result.activeChart = r.activeChart as GraphChartType;
  }
  if (r.renderings !== undefined) {
    const renderings = object(r.renderings, chartTypes, "renderings");
    result.renderings = {};
    for (const [chart, value] of Object.entries(renderings)) {
      if (value === undefined) continue;
      const rendering = object(
        value,
        ["graphFingerprint", "settingsFingerprint", "scope", "timelineSettings", "geometry"],
        "rendering",
      );
      if (typeof rendering.graphFingerprint !== "string" || typeof rendering.settingsFingerprint !== "string")
        throw new Error("Invalid Layout fingerprint.");
      const scope = object(
        rendering.scope,
        ["selection", "compound", "activeType", "activeTrack", "timelineRange", "spatial"],
        "Layout scope",
      );
      validateLayoutScope(scope);
      const timelineSettings = resolveTimeline(rendering.timelineSettings);
      validateLayoutGeometryData(rendering.geometry);
      if (!(chart === "node-link" ? ["level", "sugiyama", "dagre"] : [chart]).includes(rendering.geometry.layoutMode))
        throw new Error("Layout rendering does not match its chart type.");
      if (
        (chart !== "timeline" && rendering.geometry.timeline) ||
        (chart !== "compound" && (rendering.geometry.compoundGeometry || rendering.geometry.groups?.length)) ||
        (chart !== "spatial" && rendering.geometry.spatial)
      )
        throw new Error("Layout contains geometry for another chart type.");
      result.renderings[chart as GraphChartType] = { ...rendering, timelineSettings } as unknown as LayoutRendering;
    }
  }
  return result;
}

/** IDs are repaired together with graph edits, without modifying graph metadata. */
export function repairLayoutDocument(
  layout: LayoutDocument,
  graph: GraphDocument,
  renames: { from: string; to: string }[] = [],
) {
  const data = structuredClone(layout);
  const remap = (id: string) => renames.reduce((key, r) => (key === r.from ? r.to : key), id);
  const edges = new Set(graph.edges.map((e) => e.id));
  data.charts.compound.constraints = data.charts.compound.constraints.flatMap<
    CompoundLayoutData["constraints"][number]
  >((c) => {
    if (c.type === "direction" || c.type === "flow-order") {
      const scopeId = c.scopeId === null ? null : remap(c.scopeId);
      if (c.type === "flow-order") {
        const parent = new Map((graph.hierarchy_edges ?? []).map((e) => [e.target, e.source]));
        const nodeIds = [...new Set(c.nodeIds.map(remap))].filter(
          (id) => Object.prototype.hasOwnProperty.call(graph.nodes, id) && (parent.get(id) ?? null) === scopeId,
        );
        return nodeIds.length >= 2 ? [{ ...c, scopeId, nodeIds }] : [];
      }
      return scopeId === null || Object.prototype.hasOwnProperty.call(graph.nodes, scopeId) ? [{ ...c, scopeId }] : [];
    }
    return edges.has(c.edgeId) ? [c] : [];
  });
  const plan = data.charts.timeline.plan;
  if (plan) {
    plan.eventOrder = [...new Set(plan.eventOrder.map(remap))].filter((id) =>
      Object.prototype.hasOwnProperty.call(graph.nodes, id),
    );
    const tracks = new Set(Object.values(graph.nodes).flatMap((n) => [timelineTrack(n), timelineTrack(n, true)]));
    plan.trackOrder = plan.trackOrder.filter((track) => tracks.has(track));
  }
  if (plan?.placements)
    plan.placements = plan.placements
      .map((p) => ({ ...p, id: remap(p.id) }))
      .filter((p) => Object.prototype.hasOwnProperty.call(graph.nodes, p.id));
  if (plan?.routes) plan.routes = plan.routes.filter((r) => edges.has(r.id));
  if (data.renderings)
    for (const [chart, rendering] of Object.entries(data.renderings))
      if (!rendering || rendering.graphFingerprint !== graphLayoutIdentity(graph))
        delete data.renderings[chart as GraphChartType];
  return JSON.stringify(data) === JSON.stringify(layout) ? layout : data;
}

/** Public file protocol. One file belongs to exactly one chart type, like Appearance. */
export interface ChartLayoutDocument {
  format: "graph-studio-layout";
  version: 2;
  chartType: GraphChartType;
  layout: {
    settings: Record<string, unknown>;
    scope?: Record<string, unknown>;
    graphFingerprint?: string;
    settingsFingerprint?: string;
    geometry?: import("./layoutGeometry").LayoutGeometryData;
  };
}
export function createChartLayoutDocument(data: LayoutDocument, chartType: GraphChartType): ChartLayoutDocument {
  const rendering = data.renderings?.[chartType];
  const settings = chartType in data.charts ? data.charts[chartType as keyof LayoutDocument["charts"]] : {};
  return {
    format: "graph-studio-layout",
    version: 2,
    chartType,
    layout: {
      settings: {
        ...settings,
        ...(chartType === "timeline" && (rendering || data.timelineView)
          ? { view: rendering?.timelineSettings ?? data.timelineView }
          : {}),
      },
      ...(rendering
        ? {
            scope: layoutScopeForChart(chartType, rendering.scope),
            graphFingerprint: rendering.graphFingerprint,
            settingsFingerprint: rendering.settingsFingerprint,
            geometry: rendering.geometry,
          }
        : {}),
    },
  };
}
function parseChartLayoutFile(value: Record<string, unknown>): LayoutDocument {
  const file = object(value, ["format", "version", "chartType", "layout"], "Layout file");
  if (
    file.format !== "graph-studio-layout" ||
    file.version !== 2 ||
    !["compound", "timeline", "node-link", "sankey", "spatial"].includes(file.chartType as string)
  )
    throw new Error("Expected a version 2 Layout file with chartType.");
  const chart = file.chartType as GraphChartType;
  const layout = object(
    file.layout,
    ["settings", "scope", "graphFingerprint", "settingsFingerprint", "geometry"],
    "chart layout",
  );
  if (!isRecord(layout.settings)) throw new Error("Layout settings must be an object.");
  const { view, ...settings } = layout.settings;
  if (view !== undefined && chart !== "timeline") throw new Error("Only timeline settings contain view.");
  if ((chart === "sankey" || chart === "spatial") && Object.keys(settings).length)
    throw new Error("Unsupported chart layout settings.");
  const data = parseLayoutDocument({
    format: "graph-studio-layout",
    version: 2,
    charts: ["compound", "timeline", "node-link"].includes(chart) ? { [chart]: settings } : {},
  });
  data.activeChart = chart;
  if (layout.geometry !== undefined) {
    const scopeFields = [
      "selection",
      "activeType",
      ...(chart === "compound"
        ? ["focusGroupId", "collapsedGroupIds"]
        : chart === "timeline"
          ? ["activeTrack", "timeRange"]
          : chart === "spatial"
            ? ["camera"]
            : []),
    ];
    const scope = object(layout.scope, scopeFields, "Layout scope");
    const internalScope = {
      selection: scope.selection ?? null,
      activeType: scope.activeType ?? "",
      compound: { focusGroupId: scope.focusGroupId ?? null, collapsedGroupIds: scope.collapsedGroupIds ?? [] },
      activeTrack: scope.activeTrack ?? "",
      timelineRange: scope.timeRange ?? null,
      spatial: scope.camera ?? defaultSpaceView(null),
    };
    data.renderings = {
      [chart]: {
        graphFingerprint: layout.graphFingerprint,
        settingsFingerprint: layout.settingsFingerprint,
        geometry: layout.geometry,
        scope: internalScope,
        timelineSettings: resolveTimeline(view),
      } as LayoutRendering,
    };
    return parseLayoutDocument(data);
  }
  // Configuration-only timeline files still restore their view settings.
  if (view !== undefined) data.timelineView = resolveTimeline(view);
  return data;
}
