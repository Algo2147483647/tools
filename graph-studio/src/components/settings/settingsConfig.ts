import type { IconName } from "../ui/Icon";

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
