import type { GraphChartType } from "../graph/types";
import { parseCompoundLayout } from "../graph/compound/layoutData";
import { isRecord } from "../shared/json";

export const LAYOUT_VIEW_CONFIG_KEYS = [
  "layout",
  "orientation",
  "edgeRouting",
  "axis",
  "relativeTickStep",
  "tickStep",
  "tickUnit",
  "compactness",
] as const;
export interface LayoutConfigFile {
  format: "graph-studio-layout-settings";
  version: 1;
  chartType: GraphChartType;
  settings: Record<string, unknown>;
}
export function parseLayoutConfigFile(value: unknown): LayoutConfigFile {
  const object = (v: unknown, keys: readonly string[]) => {
    if (!isRecord(v) || Object.keys(v).some((k) => !keys.includes(k)))
      throw new Error("Layout settings cannot contain geometry, plans or unknown fields.");
    return v;
  };
  const file = object(value, ["format", "version", "chartType", "settings"]);
  if (
    file.format !== "graph-studio-layout-settings" ||
    file.version !== 1 ||
    !["compound", "timeline", "node-link", "sankey", "spatial"].includes(String(file.chartType))
  )
    throw new Error("Invalid Layout settings file.");
  const chart = file.chartType as GraphChartType;
  const settings = object(
    file.settings,
    chart === "compound"
      ? ["method", "direction", "portMode"]
      : chart === "timeline"
        ? ["mode", "view"]
        : chart === "node-link"
          ? ["method"]
          : [],
  );
  if (chart === "compound") parseCompoundLayout(settings);
  if (chart === "node-link" && !["level", "sugiyama", "dagre"].includes(String(settings.method)))
    throw new Error("Invalid node-link method.");
  if (chart === "timeline") {
    if (!["ai", "algorithm"].includes(String(settings.mode))) throw new Error("Invalid timeline mode.");
    if (settings.view !== undefined) {
      const view = object(settings.view, LAYOUT_VIEW_CONFIG_KEYS);
      const enums: Record<string, string[]> = {
        layout: ["tracks", "flow"],
        orientation: ["vertical", "horizontal"],
        edgeRouting: ["avoid", "direct"],
        axis: ["linear", "adaptive"],
        tickUnit: ["auto", "second", "minute", "hour", "day", "week", "month", "year"],
      };
      for (const [key, value] of Object.entries(view)) {
        if (
          enums[key]
            ? !enums[key].includes(String(value))
            : typeof value !== "number" ||
              !Number.isFinite(value) ||
              (key === "compactness" ? value < 0 || value > 1 : value <= 0)
        )
          throw new Error(`Invalid timeline Layout setting: ${key}.`);
      }
    }
  }
  return { format: "graph-studio-layout-settings", version: 1, chartType: chart, settings: structuredClone(settings) };
}

/** Disk projection depends only on settings, never on a stage or rendering snapshot. */
export function createLayoutConfigFile(
  data: Pick<import("./layoutSession").LayoutSessionState, "charts">,
  chart: GraphChartType,
  view?: Partial<import("./appearance/types").TimelineViewSettings>,
): LayoutConfigFile {
  let settings: Record<string, unknown> = {};
  if (chart === "compound") {
    const c = data.charts.compound;
    settings = { method: c.method, direction: c.direction, portMode: c.portMode };
  }
  if (chart === "node-link") settings = { method: data.charts["node-link"].method };
  if (chart === "timeline")
    settings = {
      mode: data.charts.timeline.mode,
      ...(view
        ? {
            view: Object.fromEntries(
              LAYOUT_VIEW_CONFIG_KEYS.filter((k) => view[k] !== undefined).map((k) => [k, view[k]]),
            ),
          }
        : {}),
    };
  return parseLayoutConfigFile({ format: "graph-studio-layout-settings", version: 1, chartType: chart, settings });
}
