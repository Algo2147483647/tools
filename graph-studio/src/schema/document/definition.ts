import definition from "./definition.json" with { type: "json" };
import nodeLink from "./examples/node-link.json" with { type: "json" };
import compound from "./examples/compound.json" with { type: "json" };
import sankey from "./examples/sankey.json" with { type: "json" };
import timeline from "./examples/timeline.json" with { type: "json" };
import spatial from "./examples/spatial.json" with { type: "json" };
import { normalizeDagInput } from "../../graph/normalize";
import type { GraphChartType, GraphDocument } from "../../graph/types";
import { isRecord } from "../../shared/json";
import { orderSchemaFields, type SchemaField } from "../fields";

interface ChartSchema {
  fields: SchemaField[];
  example: GraphDocument;
}
function readField(value: unknown): SchemaField {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !value.path ||
    typeof value.type !== "string" ||
    typeof value.description !== "string" ||
    (value.requirement !== "Required" && value.requirement !== "Optional") ||
    (value.defaultValue !== undefined && typeof value.defaultValue !== "string")
  )
    throw new Error("Invalid graph document field definition.");
  return {
    path: value.path,
    type: value.type,
    description: value.description,
    requirement: value.requirement,
    ...(value.defaultValue === undefined ? {} : { defaultValue: value.defaultValue }),
  };
}
const common = definition.common.map(readField);
function chart(type: GraphChartType, example: unknown): ChartSchema {
  const extension = definition.charts[type];
  const overrides = extension.overrides.map(readField);
  for (const field of overrides)
    if (!common.some((item) => item.path === field.path))
      throw new Error("Unknown graph field override: " + field.path);
  const fields = orderSchemaFields([
    ...common.map((field) => overrides.find((override) => override.path === field.path) ?? field),
    ...extension.fields.map(readField),
  ]);
  // Validate the example at the import boundary and preserve its original document shape.
  normalizeDagInput(example);
  return { fields, example: example as GraphDocument };
}
export const CHART_SCHEMAS: Record<GraphChartType, ChartSchema> = {
  "node-link": chart("node-link", nodeLink),
  compound: chart("compound", compound),
  sankey: chart("sankey", sankey),
  timeline: chart("timeline", timeline),
  spatial: chart("spatial", spatial),
};
