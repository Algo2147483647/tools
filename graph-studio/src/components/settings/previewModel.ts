import type { GraphAppearance } from "../../schema/appearance/defaults";
import { normalizeDagInput } from "../../graph/normalize";
import { sanitizeTimelineClock, type TimelineClock } from "../../graph/timeline/clock";
import { resolveTimeline as sanitizeTimelineSettings } from "../../schema/appearance/contract";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { CompoundView, GraphChartType, GraphLayoutMode } from "../../graph/types";
import { buildStageData } from "../../layout/node-link/layout";
import { getStageAppearance } from "../../layout/shared/appearance";
import { prepareSpatialModel } from "../../layout/spatial/model";
import { projectSpatialModel } from "../../layout/spatial/project";
import { defaultSpaceView, getSpaceMetadata } from "../../graph/space";
import { buildTimelineStage } from "../../layout/timeline/layout";
import previewGraphs from "./previewGraphs.json" with { type: "json" };

/** Dedicated, deterministic coverage fixtures; never derive these from the open document. */
export const PREVIEW_GRAPHS = {
  "node-link": normalizeDagInput(previewGraphs["node-link"]),
  compound: normalizeDagInput(previewGraphs.compound),
  sankey: normalizeDagInput(previewGraphs.sankey),
  timeline: normalizeDagInput(previewGraphs.timeline),
  spatial: normalizeDagInput(previewGraphs.spatial),
};

export const INITIAL_PREVIEW_VIEW: CompoundView = { collapsedGroupIds: ["storage"], focusGroupId: null };

export function previewGeometry(input: {
  chartType: GraphChartType;
  layoutMode: GraphLayoutMode;
  appearance: GraphAppearance;
  fontMetricsKey?: string;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
  view: CompoundView;
  timelineSettings?: TimelineViewSettings;
  timelineClock?: TimelineClock;
}) {
  return {
    chartType: input.chartType,
    layoutMode: input.chartType === "node-link" ? input.layoutMode : input.chartType,
    appearance: getStageAppearance(input.appearance, input.chartType, input.fontMetricsKey),
    showNodeDetail: input.showNodeDetail,
    alignNodeWidthsToMax: input.alignNodeWidthsToMax,
    showEdgeLabels: input.chartType === "compound" && input.appearance.display.showEdgeLabels,
    view: input.view,
    // Sample IDs never use the current document's pinned positions.
    timelineClock: sanitizeTimelineClock(input.timelineClock),
    timelineSettings: sanitizeTimelineSettings({ ...input.timelineSettings, pins: {} }),
  };
}

export type PreviewGeometry = ReturnType<typeof previewGeometry>;

export function compoundPreviewInput(input: PreviewGeometry) {
  return { ...input, dag: PREVIEW_GRAPHS.compound };
}

export function buildFlatPreviewStage(input: PreviewGeometry) {
  if (input.chartType === "compound") return null;
  const shared = {
    ...input,
    dag: input.chartType === "timeline" ? timelinePreviewGraph(input.timelineClock) : PREVIEW_GRAPHS[input.chartType],
    selection: { type: "full" as const },
  };
  if (input.chartType === "spatial")
    return projectSpatialModel(
      prepareSpatialModel(shared.dag, defaultSpaceView(getSpaceMetadata(shared.dag)).axes),
      shared,
    );
  return input.chartType === "timeline"
    ? buildTimelineStage(shared)
    : buildStageData({
        ...shared,
        layoutMode: input.chartType === "sankey" ? "sankey" : (input.layoutMode as GraphLayoutMode),
      });
}

export function timelinePreviewGraph(clock: TimelineClock) {
  if (clock.mode !== "relative") return PREVIEW_GRAPHS.timeline;
  const sample = previewGraphs.timeline;
  const offset = (date: string) => (Date.parse(date) - Date.parse("2026-05-01")) / 86400000;
  return normalizeDagInput({
    ...sample,
    metadata: { timeline: { clock } },
    nodes: Object.fromEntries(
      Object.entries(sample.nodes).map(([key, node]) => [
        key,
        {
          ...node,
          time: Object.fromEntries(Object.entries(node.time).map(([field, date]) => [field, offset(date)])),
        },
      ]),
    ),
  });
}
