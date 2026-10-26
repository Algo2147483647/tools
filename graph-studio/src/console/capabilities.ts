import type { GraphChartType, GraphDocument } from "../graph/types";
import { isSpatialDocument } from "../graph/space";
import { isTimelineDocument } from "../graph/timeline/view";

export interface CapabilityContext {
  chartType: GraphChartType;
  dag: GraphDocument | null;
}
export type Capability = "graph" | "group" | "timeline" | "flow" | "space" | "layout";
export const CAPABILITY_VERSION = 1;

export function hasCapability(context: CapabilityContext, capability: Capability): boolean {
  const { dag, chartType } = context;
  if (!dag) return false;
  switch (capability) {
    case "graph":
      return true;
    case "group":
      return chartType === "compound" || !!dag.hierarchy_edges?.length;
    case "timeline":
      return chartType === "timeline" || isTimelineDocument(dag);
    case "flow":
      return chartType === "sankey" || dag.diagram === "sankey";
    case "space":
      return isSpatialDocument(dag);
    case "layout":
      return chartType !== "spatial";
  }
}

export function describeCapabilities(context: CapabilityContext) {
  return {
    version: CAPABILITY_VERSION,
    chartType: context.chartType,
    document: (["graph", "group", "timeline", "flow", "space"] as const).filter((c) => hasCapability(context, c)),
    layout:
      context.chartType === "compound"
        ? ["inspect", "diagnose", "run", "cancel", "resume"]
        : context.chartType === "timeline"
          ? ["inspect", "diagnose", "run", "cancel"]
          : context.chartType === "node-link"
            ? ["inspect", "diagnose", "run"]
            : ["inspect", "diagnose"],
  };
}
