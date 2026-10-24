import { APPEARANCE_DEFINITION, TIMELINE_DEFINITION, STYLE_OPTIONS_DEFINITION } from "./appearanceDefinition";
import { resolveDefinition, type AppearanceFieldDefinition } from "./definition";
import { CHART_DEFAULTS } from "./chartDefaults";
import type { GraphChartType } from "../graph/types";
import type { ChartStyle, GraphAppearance, TimelineViewSettings, TimelineMarkerSettings } from "./appearanceModel";

export function mergeDefinitionValues(base: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return structuredClone(patch);
  const result = structuredClone(base ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) result[key] = mergeDefinitionValues(result[key], value);
  return result;
}

export function styleDefinition(chart: GraphChartType): AppearanceFieldDefinition {
  const root: AppearanceFieldDefinition = {
    kind: "object",
    properties: {
      ...STYLE_OPTIONS_DEFINITION.properties,
      appearance: APPEARANCE_DEFINITION,
      ...(chart === "timeline" ? { timeline: TIMELINE_DEFINITION } : {}),
    },
  };
  const defaults = mergeDefinitionValues(resolveDefinition(root, undefined, "style", true), CHART_DEFAULTS[chart]);
  const result = structuredClone(root);
  const apply = (field: AppearanceFieldDefinition, value: unknown) => {
    if (field.kind === "object")
      for (const [key, child] of Object.entries(field.properties ?? {}))
        apply(child, (value as Record<string, unknown>)[key]);
    else field.default = value;
  };
  apply(result, defaults);
  return result;
}

export function defaultChartStyle(chart: GraphChartType): ChartStyle {
  return resolveDefinition(styleDefinition(chart), undefined, "style", true) as ChartStyle;
}
export function resolveAppearance(value: unknown): GraphAppearance {
  return resolveDefinition(APPEARANCE_DEFINITION, value, "style.appearance", true) as GraphAppearance;
}
export function resolveTimeline(value: unknown): TimelineViewSettings {
  return resolveDefinition(TIMELINE_DEFINITION, value ?? undefined, "style.timeline", true) as TimelineViewSettings;
}
export function resolveMarker(value: unknown, anchor: boolean): TimelineMarkerSettings {
  return resolveDefinition(
    TIMELINE_DEFINITION.properties![anchor ? "anchorMarker" : "pointMarker"],
    value,
    "marker",
    true,
  ) as TimelineMarkerSettings;
}
export function documentDefinition(chart: GraphChartType): AppearanceFieldDefinition {
  return {
    kind: "object",
    properties: {
      format: {
        kind: "string",
        enum: ["graph-studio-style"],
        default: "graph-studio-style",
        required: true,
        description: "Style document format.",
      },
      version: { kind: "number", enum: [1], default: 1, required: true, description: "Style protocol version." },
      chartType: { kind: "string", enum: [chart], default: chart, required: true, description: "Chart renderer." },
      style: { ...styleDefinition(chart), required: true, description: "Complete chart style." },
    },
  };
}
