import type { IconName } from "../ui/Icon";
import type { GraphLayoutAppearance } from "../../graph/appearance";
import type { GraphChartType } from "../../graph/types";

export type SettingsChapter = "general" | "files" | "chart" | "appearance" | "layout" | "ai";

export const SETTINGS_CHAPTERS: Array<{
  key: SettingsChapter;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    key: "general",
    label: "General",
    description: "Workspace interface & panels",
    icon: "sliders",
  },
  {
    key: "files",
    label: "Files",
    description: "Files, folders & recent locations",
    icon: "folder",
  },
  {
    key: "chart",
    label: "Chart type",
    description: "Node-link, nested subgraphs, Sankey or timeline",
    icon: "graph",
  },
  {
    key: "layout",
    label: "Layout",
    description: "Arrangement & spacing",
    icon: "layout",
  },
  {
    key: "appearance",
    label: "Appearance",
    description: "Appearance is saved independently for each chart type.",
    icon: "palette",
  },
  {
    key: "ai",
    label: "AI assistant",
    description: "Providers & execution",
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
  { key: "columnGap", label: "Layer spacing", min: 48, max: 260, step: 2, unit: "px" },
  { key: "rowGap", label: "Node spacing", min: 4, max: 140, step: 2, unit: "px" },
  { key: "edgeLaneGap", label: "Line spacing", min: 4, max: 96, step: 2, unit: "px" },
  { key: "nodeHeight", label: "Node height", min: 44, max: 160, step: 2, unit: "px" },
  { key: "maxNodeWidth", label: "Node max width", min: 188, max: 480, step: 4, unit: "px" },
];

export function getLayoutControls(chart: GraphChartType): LayoutControlDefinition[] {
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
