import type { IconName } from "../ui/Icon";
import type { GraphLayoutAppearance } from "../../graph/appearance";
import type { GraphChartType } from "../../graph/types";

export type SettingsChapter = "general" | "files" | "chart" | "appearance" | "layout" | "ai";

export const SETTINGS_CHAPTERS: Array<{
  key: SettingsChapter;
  label: string;
  icon: IconName;
}> = [
  {
    key: "general",
    label: "General",
    icon: "sliders",
  },
  {
    key: "files",
    label: "Files",
    icon: "folder",
  },
  {
    key: "chart",
    label: "Chart type",
    icon: "graph",
  },
  {
    key: "layout",
    label: "Layout",
    icon: "layout",
  },
  {
    key: "appearance",
    label: "Appearance",
    icon: "palette",
  },
  {
    key: "ai",
    label: "AI assistant",
    icon: "ai",
  },
];

type LayoutControlKey = keyof Pick<
  GraphLayoutAppearance,
  "columnGap" | "rowGap" | "edgeLaneGap" | "nodeHeight" | "maxNodeWidth"
>;

export interface LayoutControlDefinition {
  key: LayoutControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export const LAYOUT_CONTROLS: LayoutControlDefinition[] = [
  { key: "columnGap", label: "Layer spacing", min: 0, max: 260, step: 2, unit: "px" },
  { key: "rowGap", label: "Node spacing", min: 0, max: 140, step: 2, unit: "px" },
  { key: "edgeLaneGap", label: "Line spacing", min: 0, max: 96, step: 2, unit: "px" },
  { key: "nodeHeight", label: "Node height", min: 0, max: 160, step: 2, unit: "px" },
  { key: "maxNodeWidth", label: "Node max width", min: 0, max: 480, step: 4, unit: "px" },
];

export function getLayoutControls(chart: GraphChartType): LayoutControlDefinition[] {
  if (chart === "spatial") return [];
  return LAYOUT_CONTROLS.filter((control) =>
    chart === "compound"
      ? control.key !== "edgeLaneGap"
      : chart === "timeline" || chart === "sankey"
        ? ["maxNodeWidth", "nodeHeight", "rowGap"].includes(control.key)
        : true,
  ).map((control) => ({
    ...control,
    label:
      chart === "timeline"
        ? control.key === "maxNodeWidth"
          ? "Event label width"
          : control.key === "nodeHeight"
            ? "Timeline vertical spacing"
            : "Label spacing"
        : chart === "sankey"
          ? control.key === "maxNodeWidth"
            ? "Label room"
            : control.key === "nodeHeight"
              ? "Vertical space per node"
              : control.label
          : control.label,
  }));
}
