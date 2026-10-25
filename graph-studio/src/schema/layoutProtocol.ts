import { isRecord } from "../shared/json";
import { emptyLayoutData, parseCompoundLayout, type CompoundLayoutData } from "../graph/compound/layoutData";
import { parseTimelineLayoutPlan, timelineTrack, type TimelineLayoutData } from "../graph/timeline/layoutData";
import type { GraphDocument, GraphLayoutMode } from "../graph/types";

/** Declarative inputs only. Computed geometry never crosses this boundary. */
export interface LayoutDocument {
  format: "graph-studio-layout";
  version: 1;
  charts: {
    compound: CompoundLayoutData;
    timeline: TimelineLayoutData;
    "node-link": { method: GraphLayoutMode };
  };
}

export function defaultLayoutDocument(): LayoutDocument {
  return {
    format: "graph-studio-layout",
    version: 1,
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
  const r = object(value, ["format", "version", "charts"], "layout");
  if (r.format !== "graph-studio-layout" || r.version !== 1) throw new Error("Expected graph-studio-layout version 1.");
  const charts = object(r.charts, ["compound", "timeline", "node-link"], "layout charts");
  const result = defaultLayoutDocument();
  if (charts.compound !== undefined) result.charts.compound = parseCompoundLayout(charts.compound);
  if (charts.timeline !== undefined) {
    const t = object(charts.timeline, ["version", "mode", "plan"], "timeline layout");
    if (t.version !== undefined && t.version !== 1) throw new Error("Unsupported timeline layout version.");
    if (t.mode !== "algorithm" && t.mode !== "ai") throw new Error("Invalid timeline layout mode.");
    result.charts.timeline = {
      version: 1,
      mode: t.mode,
      ...(t.plan === undefined ? {} : { plan: parseTimelineLayoutPlan(t.plan) }),
    };
  }
  if (charts["node-link"] !== undefined) {
    const n = object(charts["node-link"], ["method"], "node-link layout");
    if (!["level", "sugiyama", "dagre"].includes(n.method as string))
      throw new Error("Invalid node-link layout method.");
    result.charts["node-link"] = { method: n.method as GraphLayoutMode };
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
  return JSON.stringify(data) === JSON.stringify(layout) ? layout : data;
}
