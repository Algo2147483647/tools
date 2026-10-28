import { parseLayoutConfigFile, type LayoutConfigFile } from "./layoutConfig";
import { designSchema } from "../layout/compound/ai/protocol";
import { validateLayoutSchema } from "./layoutResult";
import {
  graphLayoutIdentity,
  validateLayoutScope,
  validateLayoutGeometryData,
  type LayoutRendering,
} from "./layoutGeometry";
import { resolveTimeline } from "./appearance/contract";
import { isRecord } from "../shared/json";
import { emptyLayoutData, parseCompoundLayout, type CompoundLayoutData } from "../graph/compound/layoutData";
import type { TimelineLayoutData } from "../graph/timeline/layoutData";
import type { GraphDocument, GraphLayoutMode, GraphChartType } from "../graph/types";

/** Internal session state. Persist only createLayoutConfigFile(); renderings are session-only. */
export interface LayoutSessionState {
  activeChart?: GraphChartType;
  timelineView?: import("./appearance/types").TimelineViewSettings;
  renderings?: Partial<Record<GraphChartType, LayoutRendering>>;
  charts: {
    compound: CompoundLayoutData;
    timeline: TimelineLayoutData;
    "node-link": { method: GraphLayoutMode };
  };
}

export function defaultLayoutSession(): LayoutSessionState {
  return {
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

export function parseLayoutSession(value: unknown): LayoutSessionState {
  const r = object(value, ["charts", "activeChart", "renderings", "timelineView"], "Layout session");
  const charts = object(r.charts, ["compound", "timeline", "node-link"], "layout charts");
  const result = defaultLayoutSession();
  if (r.timelineView !== undefined) result.timelineView = resolveTimeline(r.timelineView);
  if (charts.compound !== undefined) result.charts.compound = parseCompoundLayout(charts.compound);
  if (charts.timeline !== undefined) {
    const t = object(charts.timeline, ["version", "mode"], "timeline layout");
    if (t.version !== undefined && t.version !== 1) throw new Error("Unsupported timeline layout version.");
    if (t.mode !== "algorithm" && t.mode !== "ai") throw new Error("Invalid timeline layout mode.");
    result.charts.timeline = {
      version: 1,
      mode: t.mode,
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
        ["graphFingerprint", "settingsFingerprint", "scope", "timelineSettings", "geometry", "compoundDesign"],
        "rendering",
      );
      if (typeof rendering.graphFingerprint !== "string" || typeof rendering.settingsFingerprint !== "string")
        throw new Error("Invalid Layout fingerprint.");
      const scope = object(
        rendering.scope,
        ["selection", "compound", "activeType", "typeFilter", "activeTrack", "timelineRange", "spatial"],
        "Layout scope",
      );
      validateLayoutScope(scope);
      const timelineSettings = resolveTimeline(rendering.timelineSettings);
      const geometry = rendering.geometry;
      validateLayoutGeometryData(geometry, chart as GraphChartType);
      if (rendering.compoundDesign !== undefined) {
        if (chart !== "compound") throw new Error("Compound design belongs to a compound rendering.");
        validateLayoutSchema(rendering.compoundDesign, designSchema, "/compoundDesign");
      }
      result.renderings[chart as GraphChartType] = {
        ...rendering,
        geometry,
        timelineSettings,
      } as unknown as LayoutRendering;
    }
  }
  return result;
}

/** IDs are repaired together with graph edits, without modifying graph metadata. */
export function repairLayoutSession(
  layout: LayoutSessionState,
  graph: GraphDocument,
  renames: { from: string; to: string }[] = [],
) {
  const data = structuredClone(layout);
  const remap = (id: string) => renames.reduce((key, r) => (key === r.from ? r.to : key), id);
  const edges = new Set(graph.edges.map((e) => e.id));
  const parent = new Map((graph.hierarchy_edges ?? []).map((e) => [e.target, e.source]));
  data.charts.compound.constraints = data.charts.compound.constraints.flatMap<
    CompoundLayoutData["constraints"][number]
  >((c) => {
    if (c.type === "direction" || c.type === "flow-order") {
      const scopeId = c.scopeId === null ? null : remap(c.scopeId);
      if (c.type === "flow-order") {
        const nodeIds = [...new Set(c.nodeIds.map(remap))].filter(
          (id) => Object.prototype.hasOwnProperty.call(graph.nodes, id) && (parent.get(id) ?? null) === scopeId,
        );
        return nodeIds.length >= 2 ? [{ ...c, scopeId, nodeIds }] : [];
      }
      return scopeId === null || Object.prototype.hasOwnProperty.call(graph.nodes, scopeId) ? [{ ...c, scopeId }] : [];
    }
    return edges.has(c.edgeId) ? [c] : [];
  });
  const graphFingerprint = graphLayoutIdentity(graph);
  if (data.renderings)
    for (const [chart, rendering] of Object.entries(data.renderings))
      if (!rendering || rendering.graphFingerprint !== graphFingerprint)
        delete data.renderings[chart as GraphChartType];
  return JSON.stringify(data) === JSON.stringify(layout) ? layout : data;
}

/** Configuration is the only external document accepted into a new session. */
export function layoutSessionFromConfig(value: LayoutConfigFile): LayoutSessionState {
  const file = parseLayoutConfigFile(value);
  const data = defaultLayoutSession();
  data.activeChart = file.chartType;
  if (file.chartType === "compound") data.charts.compound = parseCompoundLayout(file.settings);
  if (file.chartType === "timeline") {
    data.charts.timeline = { version: 1, mode: file.settings.mode as "ai" | "algorithm" };
    if (file.settings.view) data.timelineView = resolveTimeline(file.settings.view);
  }
  if (file.chartType === "node-link") data.charts["node-link"] = { method: file.settings.method as GraphLayoutMode };
  return data;
}
