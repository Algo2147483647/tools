import { getAppearanceSchema } from "../../schema/appearance/schema";
import { updateAppearanceSchemaValues } from "../../schema/styleProtocol";
import type { ChartStyle } from "../../schema/appearance/types";
import type { GraphChartType } from "../../graph/types";

export function createAppearanceUIModel(chart: GraphChartType, style: ChartStyle) {
  const schema = getAppearanceSchema(chart, style);
  const defaults = getAppearanceSchema(chart);
  function bind(path: string) {
    const entry = schema.entries.get(path);
    if (!entry) throw new Error(`Unknown Appearance UI binding: ${path}`);
    return {
      path,
      definition: entry.definition,
      value: entry.value,
      defaultValue: defaults.entries.get(path)?.value,
      supported: entry.supported,
      visible:
        !entry.definition.visibleWhen ||
        schema.entries.get(entry.definition.visibleWhen.path)?.value === entry.definition.visibleWhen.equals,
      child: (key: string) => bind(entry.definition.kind === "map" ? `${path}[${key}]` : `${path}.${key}`),
      set: (value: unknown) => updateAppearanceSchemaValues(chart, style, [{ path, value }]),
      reset: () => updateAppearanceSchemaValues(chart, style, [{ path, value: defaults.entries.get(path)?.value }]),
    };
  }
  return {
    chart,
    style,
    schema,
    bind,
    change: (changes: readonly { path: string; value: unknown }[]) =>
      updateAppearanceSchemaValues(chart, style, changes),
  };
}
export type AppearanceUIModel = ReturnType<typeof createAppearanceUIModel>;
export type AppearanceBinding = ReturnType<AppearanceUIModel["bind"]>;
