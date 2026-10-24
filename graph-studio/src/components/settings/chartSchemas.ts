import type { GraphChartType, GraphDocument } from "../../graph/types";
import { TIMELINE_SCHEMA_FIELDS } from "./timelineSchemaFields";
import { CHART_EXAMPLES } from "./chartSchemaExamples";
import { schemaField as f, orderSchemaFields, type SchemaField } from "./schemaModel";

export type { SchemaField } from "./schemaModel";
interface ChartSchema {
  fields: SchemaField[];
  example: GraphDocument;
}
const commonFields: SchemaField[] = [
  f("format", '"graph-studio"', "Required", "Graph document format."),
  f("version", "3", "Required", "Graph data protocol version."),
  f("diagram", "dag | sankey", "Optional", "Data semantics; chart selection does not rewrite this value.", '"dag"'),
  f("id", "string", "Optional", "Document identifier."),
  f("title", "string", "Optional", "Document title."),
  f("metadata", "object", "Optional", "Document extensions; unknown top-level fields are rejected."),
  f(
    "metadata.style",
    "string",
    "Optional",
    "Relative graph-studio-style JSON path, resolved inside the opened workspace.",
  ),
  f("nodes", "object", "Required", "Map of unique node IDs to node objects; may be empty."),
  f(
    "nodes[id]",
    "object",
    "Required",
    "Node record; custom JSON fields are allowed, except key, parents and children.",
  ),
  f("nodes[id].title", "string", "Optional", "Visible title; the map key remains the stable node ID."),
  f("nodes[id].define", "string", "Optional", "Markdown description displayed in node details."),
  f("nodes[id].type", "string", "Optional", "Category used for Type filtering and coloring."),
  f("edges", "array", "Required", "Ordinary directed relationships; may be empty."),
  f("edges[]", "object", "Required", "One relationship; directed endpoint pairs must be unique."),
  f("edges[].id", "string", "Required", "Nonempty identifier unique within the edge collection."),
  f("edges[].source", "string", "Required", "Existing source node ID; must differ from target."),
  f("edges[].target", "string", "Required", "Existing target node ID."),
  f(
    "edges[].value",
    "string | number | boolean | null",
    "Optional",
    "Relationship label; directed cycles are supported.",
    '"related_to" (display only)',
  ),
  f("edges[].metadata", "object", "Optional", "Edge extensions; other edge fields are rejected."),
];
const compoundFields: SchemaField[] = [
  f(
    "hierarchy_edges",
    "array",
    "Optional",
    "Parent-to-child containment; nonempty membership selects Nested node-link.",
  ),
  f(
    "hierarchy_edges[]",
    "object",
    "Required",
    "One membership; each child has at most one parent and containment is acyclic.",
  ),
  f("hierarchy_edges[].id", "string", "Required", "Identifier unique within the membership collection."),
  f("hierarchy_edges[].source", "string", "Required", "Existing parent node ID; groups are ordinary nodes."),
  f("hierarchy_edges[].target", "string", "Required", "Existing direct child node ID; cannot equal its parent."),
];
const spatialFields: SchemaField[] = [
  f("metadata.space", "object", "Required", "Declares coordinates and selects Spatial on open."),
  f(
    "metadata.space.dimensions",
    "integer ≥ 0",
    "Required",
    "Exact coordinate count; supports zero and higher dimensions.",
  ),
  f(
    "metadata.space.coordinateSystem",
    "cartesian | polar | spherical | cylindrical | geographic",
    "Required",
    "Coordinate order: Cartesian xyz; polar r/azimuth; spherical r/azimuth/elevation; geographic lon/lat/alt.",
  ),
  f(
    "metadata.space.angleUnit",
    "degrees | radians",
    "Optional",
    "Angular coordinate units; latitude/elevation is bounded by ±90° or ±π/2.",
    '"degrees"',
  ),
  f("metadata.space.axes", "string[]", "Optional", "Exactly one axis label per input dimension."),
  f("metadata.space.unit", "string", "Optional", "Linear coordinate unit label."),
  f(
    "metadata.space.radius",
    "number > 0",
    "Optional",
    "Geographic reference sphere radius in the same unit as altitude.",
    "6371",
  ),
  f("metadata.space.typeField", "string", "Optional", "Node field containing multiple category names, such as lines."),
  f(
    "metadata.space.edgeTypeField",
    "string",
    "Optional",
    "Edge metadata field used for category filtering, such as line.",
  ),
  f("metadata.spatialLegend", "object", "Optional", "Descriptive legend; does not calculate point styles."),
  f("metadata.spatialLegend.title", "string", "Required", "Legend heading."),
  f("metadata.spatialLegend.description", "string", "Optional", "Legend explanation."),
  f("metadata.spatialLegend.items", "array", "Required", "Legend entries."),
  f("metadata.spatialLegend.items[]", "object", "Required", "One illustrative point style."),
  f("metadata.spatialLegend.items[].label", "string", "Required", "Legend item label."),
  f("metadata.spatialLegend.items[].radius", "number, 1–12", "Required", "Point radius; finite values are clamped."),
  f("metadata.spatialLegend.items[].opacity", "number, 0.1–1", "Optional", "Point opacity.", "1"),
  f("metadata.spatialLegend.items[].hollow", "boolean", "Optional", "Draw an outline instead of a fill.", "false"),
  f(
    "nodes[id].space",
    "number[]",
    "Optional",
    "Exactly dimensions finite coordinates; missing positions remain in the unpositioned tray.",
  ),
  f("nodes[id].spatialStyle", "object", "Optional", "Per-point visual data, saved with the graph."),
  f("nodes[id].spatialStyle.color", '"#RRGGBB"', "Optional", "Overrides the category color."),
  f(
    "nodes[id].spatialStyle.radius",
    "number, 1–12",
    "Optional",
    "Point radius; finite values are clamped.",
    "Automatic",
  ),
  f("nodes[id].spatialStyle.opacity", "number, 0.1–1", "Optional", "Base opacity, further modulated by depth.", "1"),
  f("nodes[id].spatialStyle.hollow", "boolean", "Optional", "Draw an outline instead of a fill.", "false"),
  f(
    "nodes[id].spatialStyle.label",
    "boolean",
    "Optional",
    "Requests labels in dense views, subject to visibility and collision handling.",
    "false",
  ),
  f(
    "nodes[id].spatialStyle.labelPriority",
    "number",
    "Optional",
    "Higher values receive earlier label placement.",
    "0",
  ),
  f("edges[].metadata.spatialStyle", "object", "Optional", "Per-edge visual data, saved with the graph."),
  f("edges[].metadata.spatialStyle.color", '"#RRGGBB"', "Optional", "Explicit edge color."),
  f(
    "edges[].metadata.spatialStyle.width",
    "number, 0.5–8",
    "Optional",
    "Stroke width; finite values are clamped.",
    "1",
  ),
  f("edges[].metadata.spatialStyle.dashed", "boolean", "Optional", "Dashed edge stroke.", "false"),
  f(
    "edges[].metadata.spatialStyle.directed",
    "boolean",
    "Optional",
    "Shows an arrow; hiding it does not change edge direction.",
    "false",
  ),
];
function chart(type: GraphChartType, extra: SchemaField[] = []): ChartSchema {
  const fields = commonFields.map((field) => {
    if (type === "sankey" && field.path === "diagram")
      return f("diagram", '"sankey"', "Optional", "Declares flow semantics and selects Sankey on open.");
    if (type === "sankey" && field.path === "edges[].value")
      return f(
        "edges[].value",
        "number ≥ 0",
        "Required",
        "Finite flow quantity; numeric strings and overflowing totals are invalid.",
      );
    return field;
  });
  return { fields: orderSchemaFields([...fields, ...extra]), example: CHART_EXAMPLES[type] };
}
export const CHART_SCHEMAS: Record<GraphChartType, ChartSchema> = {
  "node-link": chart("node-link"),
  compound: chart("compound", compoundFields),
  sankey: chart("sankey", [
    f("nodes[id].color", '"#RRGGBB"', "Optional", "Bar and outgoing-flow color."),
    f("edges[].metadata.label", "string", "Optional", "Text accompanying the displayed flow quantity."),
    f("edges[].metadata.feedback", "boolean", "Optional", "Explicitly routes this edge as a return flow.", "false"),
  ]),
  timeline: chart("timeline", TIMELINE_SCHEMA_FIELDS),
  spatial: chart("spatial", spatialFields),
};
