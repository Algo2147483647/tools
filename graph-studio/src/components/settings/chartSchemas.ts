import type { GraphChartType, GraphDocument } from "../../graph/types";

interface SchemaField {
  path: string;
  type: string;
  requirement: string;
  description: string;
}
interface ChartSchema {
  fields: SchemaField[];
  example: GraphDocument;
}
const commonFields: SchemaField[] = [
  { path: "format", type: '"graph-studio"', requirement: "Required", description: "Document format." },
  { path: "version", type: "3", requirement: "Required", description: "Protocol version." },
  { path: "nodes", type: "{ [id]: node }", requirement: "Required", description: "Unique IDs map to node objects." },
  {
    path: "nodes[id].title / define / type",
    type: "string",
    requirement: "Optional",
    description: "Title, Markdown description and category. Custom node fields are also supported.",
  },
  { path: "edges", type: "edge[]", requirement: "Required", description: "Relationships; an empty array is valid." },
  {
    path: "edges[].id / source / target",
    type: "string",
    requirement: "Required",
    description: "Unique edge ID and two existing node IDs. No self-loops or duplicate endpoint pairs.",
  },
];
const example: GraphDocument = {
  format: "graph-studio",
  version: 3,
  nodes: {
    request: { title: "Request", define: "Receive input", type: "Input" },
    validate: { title: "Validate", define: "Check required fields", type: "Process" },
  },
  edges: [{ id: "request-validate", source: "request", target: "validate", value: "submit" }],
};
const valueField: SchemaField = {
  path: "edges[].value",
  type: "string | number | boolean | null",
  requirement: "Optional",
  description: "Relationship label. Directed cycles are supported.",
};

export const CHART_SCHEMAS: Record<GraphChartType, ChartSchema> = {
  "node-link": { fields: [...commonFields, valueField], example },
  compound: {
    fields: [
      ...commonFields,
      valueField,
      {
        path: "hierarchy_edges[]",
        type: "{ id, source, target }",
        requirement: "For grouping",
        description:
          "Parent node → child node. One parent per child, no cycles. All groups are ordinary nodes and can be endpoints in edges.",
      },
    ],
    example: {
      ...example,
      hierarchy_edges: Object.entries({ request: "api", validate: "api" }).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
      nodes: { ...example.nodes, ...{ api: { title: "API service" } } },
    },
  },
  sankey: {
    fields: [
      ...commonFields,
      {
        path: "diagram",
        type: '"sankey"',
        requirement: "View hint",
        description: "Open this document as a Sankey diagram by default.",
      },
      {
        path: "edges[].value",
        type: "number ≥ 0",
        requirement: "Required for Sankey",
        description: "Finite flow quantity. Numeric strings are invalid; cycles render as return flows.",
      },
      {
        path: "nodes[id].color",
        type: '"#RRGGBB"',
        requirement: "Optional",
        description: "Node and outgoing flow color.",
      },
    ],
    example: {
      format: "graph-studio",
      version: 3,
      diagram: "sankey",
      nodes: { supply: { title: "Supply" }, use: { title: "Use" }, loss: { title: "Losses" } },
      edges: [
        { id: "supply-use", source: "supply", target: "use", value: 80 },
        { id: "supply-loss", source: "supply", target: "loss", value: 20 },
      ],
    },
  },
  timeline: {
    fields: [
      ...commonFields,
      valueField,
      {
        path: "metadata.timeline",
        type: "{ version: 1, clock?, view? }",
        requirement: "View hint",
        description: "Open in Timeline. The document remains protocol v3; diagram stays dag or is omitted.",
      },
      {
        path: "nodes[id].time",
        type: "{ at } | { start, end }",
        requirement: "For placement",
        description:
          "Calendar: ISO date strings. Relative: finite numeric values in the declared unit, including zero, negative and fractional values. Missing or invalid times stay unplaced.",
      },
      {
        path: "metadata.timeline.clock",
        type: "{ mode, unit, origin, format, precision }",
        requirement: "Relative time",
        description:
          "mode: relative. unit: unit (schematic), second, minute, hour, day, week or cycle. Numeric values never become dates.",
      },
      {
        path: "metadata.timeline.view",
        type: "object",
        requirement: "Optional",
        description:
          "orientation: horizontal or vertical; intervalTitle: inside, outside or hidden; intervalAlign: start, center or end; relativeTickStep controls numeric tick spacing.",
      },
      {
        path: "nodes[id].status",
        type: "string",
        requirement: "Optional",
        description: "Status coloring recognizes planned, active, completed and blocked.",
      },
      { path: "nodes[id].track", type: "string", requirement: "Optional", description: "Timeline track name." },
      {
        path: "metadata.timeline.asOf",
        type: "date string",
        requirement: "Optional",
        description: "Snapshot date for ongoing intervals.",
      },
    ],
    example: {
      format: "graph-studio",
      version: 3,
      metadata: { timeline: { version: 1, timeZone: "UTC" } },
      nodes: {
        kickoff: { title: "Kickoff", time: { at: "2026-05-01" }, track: "Delivery" },
        build: { title: "Build", time: { start: "2026-05-02", end: "2026-05-10" }, track: "Delivery" },
      },
      edges: [{ id: "kickoff-build", source: "kickoff", target: "build", value: "starts" }],
    },
  },
};
