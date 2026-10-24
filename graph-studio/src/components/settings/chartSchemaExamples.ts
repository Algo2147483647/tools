import type { GraphChartType, GraphDocument } from "../../graph/types";

const header = (chart: GraphChartType, title: string) => ({
  format: "graph-studio" as const,
  version: 3 as const,
  id: `${chart}-example`,
  title,
  metadata: { style: `${chart}.style.json` },
});

export const CHART_EXAMPLES: Record<GraphChartType, GraphDocument> = {
  "node-link": {
    ...header("node-link", "Request processing"),
    nodes: {
      request: { title: "Request", define: "Receive and parse input.", type: "Input" },
      validate: { title: "Validate", define: "Check required fields.", type: "Process" },
      result: { title: "Result", define: "Return the accepted result.", type: "Output" },
    },
    edges: [
      {
        id: "request-validate",
        source: "request",
        target: "validate",
        value: "submit",
        metadata: { note: "Primary path" },
      },
      { id: "validate-result", source: "validate", target: "result", value: "accept" },
      { id: "validate-request", source: "validate", target: "request", value: "retry" },
    ],
  },
  compound: {
    ...header("compound", "Nested service architecture"),
    nodes: {
      platform: { title: "Platform", type: "System", define: "Contains the API service." },
      api: { title: "API service", type: "Service" },
      request: { title: "Request", type: "Input", define: "Receive input inside the API." },
      validate: { title: "Validate", type: "Process" },
      database: { title: "Database", type: "Storage" },
    },
    edges: [
      { id: "request-validate", source: "request", target: "validate", value: "submit" },
      { id: "validate-database", source: "validate", target: "database", value: "writes" },
      { id: "api-database", source: "api", target: "database", value: "owns access" },
    ],
    hierarchy_edges: [
      { id: "platform-api", source: "platform", target: "api" },
      { id: "api-request", source: "api", target: "request" },
      { id: "api-validate", source: "api", target: "validate" },
    ],
  },
  sankey: {
    format: "graph-studio",
    version: 3,
    diagram: "sankey",
    id: "sankey-example",
    title: "Material flow with recycling",
    metadata: { style: "sankey.style.json", unit: "kg/h" },
    nodes: {
      supply: { title: "Supply", type: "Input", color: "#2563eb" },
      process: { title: "Process", type: "Process", color: "#10b981" },
      product: { title: "Product", type: "Output", color: "#f59e0b" },
      recycle: { title: "Recycle", type: "Return", color: "#8b5cf6" },
      loss: { title: "Loss", type: "Output" },
    },
    edges: [
      { id: "supply-process", source: "supply", target: "process", value: 100 },
      { id: "process-product", source: "process", target: "product", value: 90, metadata: { label: "Product" } },
      { id: "process-recycle", source: "process", target: "recycle", value: 20 },
      {
        id: "recycle-process",
        source: "recycle",
        target: "process",
        value: 20,
        metadata: { label: "Recycled", feedback: true },
      },
      { id: "process-loss", source: "process", target: "loss", value: 10 },
    ],
  },
  timeline: {
    ...header("timeline", "Delivery timeline"),
    metadata: {
      style: "timeline.style.json",
      timeline: { timeZone: "UTC", asOf: "2026-06-01", clock: { mode: "calendar" } },
    },
    nodes: {
      kickoff: {
        title: "Kickoff",
        type: "Milestone",
        define: "Start the delivery.",
        time: { at: "2026-05-01" },
        track: "Delivery",
        space: 1,
      },
      build: {
        title: "Build",
        type: "Phase",
        time: { start: "2026-05-02", end: "2026-05-10" },
        track: "Delivery",
        space: 1,
      },
      review: { title: "Review", type: "Milestone", time: { at: "2026-05-07T10:00:00Z" }, track: "Quality", space: 2 },
      support: {
        title: "Support",
        type: "Phase",
        time: { start: "2026-05-11", end: null },
        track: "Operations",
        space: 3,
      },
    },
    edges: [
      {
        id: "kickoff-build",
        source: "kickoff",
        target: "build",
        value: "starts",
        metadata: { timeline: { kind: "sequence", sourceAnchor: "start", targetAnchor: "start" } },
      },
      {
        id: "build-review",
        source: "build",
        target: "review",
        value: "review at checkpoint",
        metadata: {
          timeline: { kind: "reference", sourceTime: "2026-05-07T10:00:00Z", targetTime: "2026-05-07T10:00:00Z" },
        },
      },
      {
        id: "build-support",
        source: "build",
        target: "support",
        value: "handover",
        metadata: { timeline: { kind: "dependency", sourceAnchor: "end", targetAnchor: "start" } },
      },
    ],
  },
  spatial: {
    ...header("spatial", "Spatial measurements"),
    metadata: {
      style: "spatial.style.json",
      space: { dimensions: 3, coordinateSystem: "cartesian", angleUnit: "degrees", axes: ["X", "Y", "Z"], unit: "m" },
      spatialLegend: {
        title: "Measurements",
        description: "Hollow points indicate a missing reading.",
        items: [
          { label: "Measured", radius: 5, opacity: 0.8, hollow: false },
          { label: "Missing", radius: 3, opacity: 1, hollow: true },
        ],
      },
    },
    nodes: {
      origin: {
        title: "Origin",
        type: "Reference",
        define: "Reference coordinate.",
        space: [0, 0, 0],
        spatialStyle: { color: "#2563eb", radius: 5, opacity: 0.8, hollow: false, label: true, labelPriority: 10 },
      },
      sample: { title: "Sample", type: "Measurement", space: [1, 2, 3], spatialStyle: { radius: 3, hollow: true } },
      pending: { title: "Unpositioned", type: "Measurement" },
    },
    edges: [
      {
        id: "origin-sample",
        source: "origin",
        target: "sample",
        value: "measures",
        metadata: { spatialStyle: { color: "#64748b", width: 2, dashed: true, directed: true } },
      },
    ],
  },
};
