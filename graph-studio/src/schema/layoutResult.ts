import type { GraphChartType } from "../graph/types";
import type { StageData } from "../layout/shared/types";
import type { LayoutPoint } from "./layoutGeometry";
import { LayoutRequestError, layoutObject } from "../layout/shared/ai/request";
import { schemaField, type SchemaField } from "./fields";

/** AI result in physical canvas coordinates. Configuration is a separate file protocol. */
export interface LayoutResultDocument {
  format: "graph-studio-layout";
  version: 4;
  chartType: GraphChartType;
  geometry: {
    size: LayoutPoint;
    nodes: { id: string; position: LayoutPoint; label?: LayoutPoint }[];
    edges: { id: string; points?: LayoutPoint[]; path?: string; label: LayoutPoint }[];
    groups?: { id: string; position: LayoutPoint; size: LayoutPoint }[];
  };
}
type Schema = Record<string, any>;
const point = (description: string): Schema => ({
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
  description,
});
const object = (properties: Schema, required = Object.keys(properties)): Schema => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const list = (items: Schema, description: string): Schema => ({ type: "array", items, description });
export function layoutResultSchema(chart: GraphChartType): Schema {
  const polyline = chart === "compound" || chart === "timeline" || chart === "node-link";
  return object({
    format: { const: "graph-studio-layout", description: "AI layout result; not the metadata.layout settings file." },
    version: { const: 4, description: "Layout result protocol version." },
    chartType: { const: chart, description: "Chart type of the supplied view." },
    geometry: object({
      size: { ...point("Canvas [width, height] in pixels."), items: { type: "number", exclusiveMinimum: 0 } },
      nodes: list(
        object({
          id: { type: "string", description: "Visible node ID from the input; all visible nodes are required." },
          position: point(
            chart === "timeline"
              ? "Event marker [x, y] in canvas pixels. Preserve its time-axis coordinate."
              : "Node center [x, y] in canvas pixels. Measured size comes from Appearance.",
          ),
          ...(chart === "timeline" ? { label: point("Event label anchor [x, y] in canvas pixels.") } : {}),
        }),
        "Complete visible node positions; no graph content or styles.",
      ),
      edges: list(
        object({
          id: {
            type: "string",
            description: "Visible connection ID from currentLayout (including aggregated connections).",
          },
          ...(polyline
            ? {
                points: {
                  ...list(point("Waypoint [x, y]."), "Complete ordered polyline, including both attachment endpoints."),
                  minItems: 2,
                },
              }
            : { path: { type: "string", description: "Complete SVG path in canvas pixels." } }),
          label: point("Connection label anchor [x, y] in canvas pixels."),
        }),
        "Complete visible connections. The renderer does not reroute them.",
      ),
      ...(chart === "compound"
        ? {
            groups: list(
              object({
                id: { type: "string", description: "Expanded group ID. Collapsed groups appear in nodes." },
                position: point("Group top-left [x, y] in canvas pixels."),
                size: {
                  ...point("Group [width, height], containing its children and header."),
                  items: { type: "number", exclusiveMinimum: 0 },
                },
              }),
              "All expanded groups in the current scope.",
            ),
          }
        : {}),
    }),
  });
}
/** Fields, provider JSON Schema and runtime parsing all use this same definition. */
export function layoutResultFields(chart: GraphChartType): SchemaField[] {
  const fields: SchemaField[] = [];
  const walk = (s: Schema, path: string, required: boolean) => {
    if (path)
      fields.push(
        schemaField(
          path,
          s.const !== undefined
            ? JSON.stringify(s.const)
            : s.type === "array" && s.maxItems === 2
              ? "[number, number]"
              : s.type === "array"
                ? s.items.type === "array"
                  ? "[number, number][]"
                  : `${s.items.type}[]`
                : s.type,
          required ? "Required" : "Optional",
          s.description ?? "",
        ),
      );
    if (s.type === "object")
      for (const [key, child] of Object.entries(s.properties))
        walk(child as Schema, path ? `${path}.${key}` : key, s.required.includes(key));
    if (s.type === "array" && s.items.type === "object")
      for (const [key, child] of Object.entries(s.items.properties))
        walk(child as Schema, `${path}[].${key}`, s.items.required.includes(key));
  };
  walk(layoutResultSchema(chart), "", true);
  return fields;
}
function validate(value: unknown, schema: Schema, path: string): void {
  const fail = (message: string): never => {
    throw new LayoutRequestError("schema", message, path);
  };
  if (schema.const !== undefined) {
    if (value !== schema.const) fail(`Expected ${JSON.stringify(schema.const)}.`);
    return;
  }
  if (schema.type === "object") {
    const record = layoutObject(value, Object.keys(schema.properties), path);
    for (const key of schema.required) if (record[key] === undefined) fail(`Missing ${key}.`);
    for (const [key, v] of Object.entries(record)) validate(v, schema.properties[key], `${path}/${key}`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) return fail("Expected an array.");
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
      fail("Invalid array length.");
    value.forEach((v, i) => validate(v, schema.items, `${path}/${i}`));
  } else if (schema.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
    )
      fail("Expected a finite number in the allowed range.");
  } else if (typeof value !== "string" || !value.trim()) fail("Expected a nonempty string.");
}
export function parseLayoutResult(value: unknown, chart: GraphChartType): LayoutResultDocument {
  validate(value, layoutResultSchema(chart), "/layout");
  return structuredClone(value) as LayoutResultDocument;
}
export function createLayoutResult(stage: StageData | null, chart: GraphChartType): LayoutResultDocument {
  const polyline = chart === "compound" || chart === "timeline" || chart === "node-link";
  return {
    format: "graph-studio-layout",
    version: 4,
    chartType: chart,
    geometry: {
      size: stage ? [stage.stageWidth, stage.stageHeight] : [600, 360],
      nodes:
        stage?.nodes.map((n) => ({
          id: n.key,
          position: [n.x, n.y],
          ...(chart === "timeline" && n.timeline
            ? { label: [n.timeline.labelX, n.timeline.labelY] as LayoutPoint }
            : {}),
        })) ?? [],
      edges:
        stage?.edges.map((e) => ({
          id: e.id,
          ...(polyline ? { points: (e.points ?? []).map((p) => [p.x, p.y] as LayoutPoint) } : { path: e.path }),
          label: [e.labelPosition.x, e.labelPosition.y],
        })) ?? [],
      ...(chart === "compound"
        ? {
            groups:
              stage?.groups?.map((g) => ({
                id: g.id,
                position: [g.x, g.y] as LayoutPoint,
                size: [g.width, g.height] as LayoutPoint,
              })) ?? [],
          }
        : {}),
    },
  };
}
