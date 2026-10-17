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
        path: "hierarchy.id",
        type: "string",
        requirement: "For grouping",
        description: "Containment hierarchy identifier.",
      },
      {
        path: "hierarchy.groups",
        type: "{ [id]: { title } }",
        requirement: "For grouping",
        description: "Group IDs must be distinct from node IDs.",
      },
      {
        path: "hierarchy.parentById",
        type: "{ [childId]: groupId }",
        requirement: "For grouping",
        description: "One parent per node or group; no containment cycles. Edges remain independent of membership.",
      },
    ],
    example: {
      ...example,
      hierarchy: {
        id: "services",
        groups: { api: { title: "API service" } },
        parentById: { request: "api", validate: "api" },
      },
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
        type: "{ version: 1, timeZone?: 'UTC' }",
        requirement: "View hint",
        description: "Open in Timeline. The document remains protocol v3; diagram stays dag or is omitted.",
      },
      {
        path: "nodes[id].time",
        type: "{ at } | { start, end }",
        requirement: "For placement",
        description: "Date strings for an event or interval. Missing or invalid dates appear in the unplaced region.",
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
