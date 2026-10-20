import { normalizeDagInput } from "../../graph/normalize";
import type { CompoundView, GraphChartType, GraphLayoutMode } from "../../graph/types";
import { getStageAppearance } from "../../layout/appearance";
import type { GraphAppearance } from "../../graph/appearance";
import { sanitizeTimelineSettings, type TimelineViewSettings } from "../../graph/timelineSettings";
import { buildStageData } from "../../layout/stage-layout";
import { buildTimelineStage } from "../../layout/timeline-layout";

export const PREVIEW_GRAPHS = {
  "node-link": normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: {
      request: { title: "Request", define: "Receive a new request" },
      validate: { title: "Validate", define: "Check required fields" },
      store: { title: "Store", define: "Save the accepted record" },
      reply: { title: "Reply", define: "Return a result to the caller" },
    },
    edges: [
      { id: "request-validate", source: "request", target: "validate", value: "submit" },
      { id: "request-reply", source: "request", target: "reply", value: "cached" },
      { id: "validate-store", source: "validate", target: "store", value: "valid" },
      { id: "store-reply", source: "store", target: "reply", value: "saved" },
      { id: "reply-validate", source: "reply", target: "validate", value: "retry" },
    ],
  }),
  compound: normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: {
      ...{
        web: { title: "Web app", define: "Customer requests" },
        api: { title: "API", define: "Validate and dispatch" },
        cache: { title: "Cache", define: "Frequently used records" },
        database: { title: "Database", define: "Persistent records" },
        partner: { title: "Partner", define: "External notifications" },
      },
      ...{ app: { title: "Application" }, storage: { title: "Storage" } },
    },
    edges: [
      { id: "web-api", source: "web", target: "api", value: "request" },
      { id: "api-cache", source: "api", target: "cache", value: "read" },
      { id: "api-database", source: "api", target: "database", value: "write" },
      { id: "cache-database", source: "cache", target: "database", value: "refresh" },
      { id: "api-partner", source: "api", target: "partner", value: "notify" },
      { id: "partner-api", source: "partner", target: "api", value: "ack" },
    ],
    hierarchy_edges: Object.entries({
      web: "app",
      api: "app",
      storage: "app",
      cache: "storage",
      database: "storage",
    }).map(([target, source]) => ({ id: `hierarchy:${target}`, source, target })),
  }),
  sankey: normalizeDagInput({
    format: "graph-studio",
    version: 3,
    diagram: "sankey",
    nodes: {
      input: { title: "Input" },
      process: { title: "Process" },
      output: { title: "Output" },
      waste: { title: "Losses" },
    },
    edges: [
      { id: "input-process", source: "input", target: "process", value: 80 },
      { id: "input-waste", source: "input", target: "waste", value: 20 },
      { id: "process-output", source: "process", target: "output", value: 80 },
      { id: "output-process", source: "output", target: "process", value: 10 },
      { id: "process-waste", source: "process", target: "waste", value: 10 },
    ],
  }),
  timeline: normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: { asOf: "2026-05-20" } },
    nodes: {
      launch: { title: "Kickoff", define: "Agree on scope", time: { at: "2026-05-01" }, track: "Delivery" },
      build: {
        title: "Build",
        define: "Implement the release",
        time: { start: "2026-05-02", end: "2026-05-10" },
        track: "Delivery",
      },
      review: { title: "Review", define: "Check acceptance criteria", time: { at: "2026-05-06" }, track: "Quality" },
      ship: { title: "Release", define: "Ship the approved result", time: { at: "2026-05-12" }, track: "Delivery" },
    },
    edges: [
      { id: "launch-build", source: "launch", target: "build", value: "starts" },
      { id: "build-review", source: "build", target: "review", value: "review" },
      { id: "review-ship", source: "review", target: "ship", value: "approve" },
    ],
  }),
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
    timelineSettings: sanitizeTimelineSettings({ ...input.timelineSettings, pins: {} }),
  };
}

export type PreviewGeometry = ReturnType<typeof previewGeometry>;

export function compoundPreviewInput(input: PreviewGeometry) {
  return { ...input, dag: PREVIEW_GRAPHS.compound };
}

export function buildFlatPreviewStage(input: PreviewGeometry) {
  if (input.chartType === "compound") return null;
  const shared = { ...input, dag: PREVIEW_GRAPHS[input.chartType], selection: { type: "full" as const } };
  return input.chartType === "timeline"
    ? buildTimelineStage(shared)
    : buildStageData({
        ...shared,
        layoutMode: input.chartType === "sankey" ? "sankey" : (input.layoutMode as GraphLayoutMode),
      });
}
