import { documentDefinition } from "./appearanceContract";
import { resolveDefinition } from "./definition";
import type { GraphChartType } from "../graph/types";
import type { ChartStyle, ChartStyleDocument } from "./appearanceModel";
import { getAppearanceSchema } from "./appearanceSchema";

/** Every stored style and preset uses this envelope; rendering reads its style member directly. */
export function createStyleDocument(chartType: GraphChartType, style: ChartStyle): ChartStyleDocument {
  return parseStyleDocument({ format: "graph-studio-style", version: 1, chartType, style }, chartType);
}

export function serializeChartStyle(chartType: GraphChartType, style: ChartStyle): string {
  return JSON.stringify(createStyleDocument(chartType, style), null, 2);
}

export function parseChartStyleFile(value: unknown, chartType: GraphChartType): ChartStyle {
  return parseStyleDocument(value, chartType).style;
}

export function parseStyleDocument(value: unknown, chartType: GraphChartType): ChartStyleDocument {
  return resolveDefinition(documentDefinition(chartType), value) as ChartStyleDocument;
}

export function updateAppearanceSchemaValue(
  chartType: GraphChartType,
  style: ChartStyle,
  path: string,
  value: unknown,
): ChartStyle {
  return updateAppearanceSchemaValues(chartType, style, [{ path, value }]);
}

/** Apply an entire control edit atomically, including object controls and dependent resets. */
export function updateAppearanceSchemaValues(
  chartType: GraphChartType,
  style: ChartStyle,
  changes: readonly { path: string; value: unknown }[],
): ChartStyle {
  const schema = getAppearanceSchema(chartType, style);
  const next = structuredClone(schema.example);
  const defaults = getAppearanceSchema(chartType);
  const write = (keys: string[], value: unknown) => {
    let target = next as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
    target[keys.at(-1)!] = structuredClone(value);
  };
  const resetPaths = new Set<string>();
  for (const { path, value } of changes) {
    const entry = schema.entries.get(path);
    if (!entry?.supported || !path.startsWith("style.") || path === "style.appearance.version")
      throw new Error(`${path}: this field is read-only.`);
    write(entry.keys, value);
    // Object renderers must obey the same dependencies as individual field editors.
    for (const [childPath, child] of schema.entries) {
      if (childPath !== path && !childPath.startsWith(`${path}.`) && !childPath.startsWith(`${path}[`)) continue;
      let updated: unknown = next;
      for (const key of child.keys) updated = (updated as Record<string, unknown>)?.[key];
      if (JSON.stringify(updated) !== JSON.stringify(child.value))
        for (const reset of child.definition.resets ?? []) resetPaths.add(reset);
    }
  }
  for (const reset of resetPaths) {
    const entry = defaults.entries.get(reset)!;
    write(entry.keys, entry.value);
  }
  return parseChartStyleFile(next, chartType);
}
