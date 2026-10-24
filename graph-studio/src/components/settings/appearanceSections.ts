import { DEFAULT_GRAPH_APPEARANCE, type GraphAppearance } from "../../graph/appearance";
import type { AppearanceGroup } from "./settingsCatalog";
import { getDefaultChartStyle, type ChartStyle } from "../../state/chartStyles";
import { getAppearanceSchema } from "../../schema/appearanceSchema";
import { APPEARANCE_DEFINITION } from "../../schema/appearanceDefinition";
import type { AppearanceFieldDefinition } from "../../schema/definition";
import type { GraphChartType } from "../../graph/types";

export function resetChartStyleSection(
  style: ChartStyle,
  chartType: GraphChartType,
  group: AppearanceGroup | "layout",
): ChartStyle {
  const next = structuredClone(style);
  const schema = getAppearanceSchema(chartType, next),
    defaults = getAppearanceSchema(chartType, getDefaultChartStyle(chartType));
  for (const [path, entry] of schema.entries) {
    if (!entry.editable || entry.definition.group !== group) continue;
    let target = { style: next } as unknown as Record<string, unknown>;
    for (const key of entry.keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
    const value = defaults.entries.get(path)?.value;
    if (value === undefined) delete target[entry.keys.at(-1)!];
    else target[entry.keys.at(-1)!] = structuredClone(value);
  }
  return next;
}
export function resetAppearanceSection(
  appearance: GraphAppearance,
  group: AppearanceGroup | "layout",
  defaults = DEFAULT_GRAPH_APPEARANCE,
): GraphAppearance {
  const next = structuredClone(appearance);
  function visit(
    field: AppearanceFieldDefinition,
    target: Record<string, unknown>,
    original: Record<string, unknown>,
    inherited?: string,
  ) {
    for (const [key, child] of Object.entries(field.properties ?? {})) {
      const section = child.group ?? inherited;
      if (child.kind === "object" || child.kind === "map")
        visit(child, target[key] as Record<string, unknown>, original[key] as Record<string, unknown>, section);
      else if (section === group) target[key] = structuredClone(original[key]);
    }
  }
  visit(
    APPEARANCE_DEFINITION,
    next as unknown as Record<string, unknown>,
    defaults as unknown as Record<string, unknown>,
  );
  return next;
}
