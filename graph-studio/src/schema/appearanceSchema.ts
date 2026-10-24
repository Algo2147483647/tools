import type { ChartStyle } from "./appearanceModel";
import type { GraphChartType } from "../graph/types";
import { documentDefinition, defaultChartStyle } from "./appearanceContract";
import { definitionType, type AppearanceFieldDefinition } from "./definition";
import { orderSchemaFields, schemaField, type SchemaField } from "./fields";

export function getAppearanceSchema(chartType: GraphChartType, currentStyle?: ChartStyle) {
  const definition = documentDefinition(chartType);
  const example = {
    format: "graph-studio-style",
    version: 1,
    chartType,
    style: currentStyle ?? defaultChartStyle(chartType),
  };
  const fields: SchemaField[] = [];
  const entries = new Map<
    string,
    { value: unknown; keys: string[]; editable: boolean; definition: AppearanceFieldDefinition; supported: boolean }
  >();
  function visit(
    field: AppearanceFieldDefinition,
    value: unknown,
    path: string,
    keys: string[],
    parentGroup?: AppearanceFieldDefinition["group"],
    supported = true,
  ) {
    const group = field.groups?.[chartType] ?? field.group ?? parentGroup;
    supported = supported && (!field.charts || field.charts.includes(chartType));
    const metadata = { ...field, group };
    const structural = field.kind === "object";
    const description = field.description ?? keys.at(-1)!.replace(/([A-Z])/g, " $1");
    fields.push({
      ...schemaField(
        path,
        definitionType(field),
        field.required ? "Required" : "Optional",
        supported ? description : `${description} Not used by ${chartType}.`,
        structural ? undefined : JSON.stringify(value),
      ),
      definition: metadata,
      supported,
    });
    entries.set(path, {
      value,
      keys,
      definition: metadata,
      supported,
      editable: supported && path.startsWith("style.") && path !== "style.appearance.version" && !structural,
    });
    if (field.kind === "object")
      for (const [key, child] of Object.entries(field.properties ?? {}))
        visit(child, (value as Record<string, unknown>)?.[key], `${path}.${key}`, [...keys, key], group, supported);
    if (field.kind === "map") {
      for (const [key, entry] of Object.entries((value ?? {}) as Record<string, unknown>))
        visit(field.properties?.[key] ?? field.items!, entry, `${path}[${key}]`, [...keys, key], group, supported);
      const key = path.endsWith("cssVars") ? "--dag-*" : path.endsWith("pins") ? "id" : "type";
      const wildcard = `${path}[${key}]`;
      if (!entries.has(wildcard))
        fields.push({
          ...schemaField(wildcard, definitionType(field.items!), "Optional", "Additional map entry."),
          definition: field.items,
          supported,
        });
    }
  }
  for (const [key, field] of Object.entries(definition.properties!))
    visit(field, example[key as keyof typeof example], key, [key]);
  return { fields: orderSchemaFields(fields), example, entries };
}
