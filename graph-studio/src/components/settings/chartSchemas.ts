import type { GraphChartType, GraphDocument } from "../../graph/types";
import { TIMELINE_SCHEMA_FIELDS } from "./timelineSchemaFields";

export interface SchemaField {
  group?: string;
  path: string;
  type: string;
  requirement: string;
  description: string;
  defaultValue?: string;
}
interface ChartSchema {
  fields: SchemaField[];
  example: GraphDocument;
}
const commonFields: SchemaField[] = [
  { path: "format", type: '"graph-studio"', requirement: "Required", description: "Document format." },
  { path: "version", type: "3", requirement: "Required", description: "Protocol version." },
  {
    path: "metadata.style",
    type: "string",
    requirement: "Optional",
    description:
      "Relative path to a separate graph-studio-style JSON file, resolved from this graph inside the opened workspace. Store appearance and layout settings in the style file.",
  },
  { path: "nodes", type: "{ [id]: node }", requirement: "Required", description: "Unique IDs map to node objects." },
  {
    path: "nodes[id].title",
    type: "string",
    requirement: "Optional",
    description: "Display title. Node IDs remain stable identifiers; custom node fields are allowed.",
  },
  {
    path: "nodes[id].define",
    type: "string",
    requirement: "Optional",
    description: "Markdown description shown in node details.",
  },
  {
    path: "nodes[id].type",
    type: "string",
    requirement: "Optional",
    description: "Category used for Type filtering and coloring.",
  },
  { path: "edges", type: "edge[]", requirement: "Required", description: "Relationships; an empty array is valid." },
  {
    path: "edges[].id",
    type: "string",
    requirement: "Required",
    description: "Non-empty identifier, unique across all edges.",
  },
  {
    path: "edges[].source",
    type: "string",
    requirement: "Required",
    description: "Existing source node ID. Must differ from target.",
  },
  {
    path: "edges[].target",
    type: "string",
    requirement: "Required",
    description: "Existing target node ID. Directed source/target pairs must be unique.",
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
    fields: [...commonFields, valueField, ...TIMELINE_SCHEMA_FIELDS],
    example: {
      format: "graph-studio",
      version: 3,
      metadata: {
        style: "timeline.style.json",
        timeline: {
          version: 1,
          timeZone: "UTC",
        },
      },
      nodes: {
        kickoff: { title: "Kickoff", type: "Milestone", time: { at: "2026-05-01" }, track: "Delivery" },
        build: { title: "Build", type: "Phase", time: { start: "2026-05-02", end: "2026-05-10" }, track: "Delivery" },
      },
      edges: [{ id: "kickoff-build", source: "kickoff", target: "build", value: "starts" }],
    },
  },
};
