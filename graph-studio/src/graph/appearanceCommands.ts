import { type GraphAppearance, type GraphLayoutAppearance, sanitizeGraphAppearance } from "./appearance";
import type { GraphChartType } from "./types";
import { getDefaultChartStyle } from "../state/chartStyles";

export type AppearanceCommand =
  | { type: "setLayout"; key: keyof GraphLayoutAppearance; value: number }
  | { type: "setCssVar"; key: string; value: string }
  | { type: "unsetCssVar"; key: string }
  | { type: "replaceCss"; css: string }
  | { type: "appendCss"; css: string }
  | { type: "resetAppearance" }
  | { type: "applyPreset"; presetId: GraphAppearancePresetId };

export type GraphAppearancePresetId = "default";

interface GraphAppearancePreset {
  id: GraphAppearancePresetId;
  label: string;
  appearance: GraphAppearance;
}

export interface AppearanceCommandResult {
  appearance: GraphAppearance;
  message: string;
  diff: string[];
}

export function getGraphAppearancePresets(chartType?: GraphChartType): GraphAppearancePreset[] {
  return [{ id: "default", label: "Default", appearance: getDefaultChartStyle(chartType ?? "compound").appearance }];
}

export function applyAppearanceCommand(
  source: GraphAppearance,
  command: AppearanceCommand,
  chartType?: GraphChartType,
): AppearanceCommandResult {
  const before = sanitizeGraphAppearance(source);
  const after = sanitizeGraphAppearance(applyRawAppearanceCommand(before, command, chartType));
  return {
    appearance: after,
    message: buildAppearanceCommandMessage(command),
    diff: buildAppearanceDiff(before, after),
  };
}

export function buildAppearanceMutationLabel(count: number, fallbackMessage: string | undefined): string {
  if (count <= 1) {
    return fallbackMessage || "Updated graph appearance.";
  }
  return `Updated graph appearance with ${count} commands.`;
}

function applyRawAppearanceCommand(
  source: GraphAppearance,
  command: AppearanceCommand,
  chartType?: GraphChartType,
): GraphAppearance {
  switch (command.type) {
    case "setLayout":
      return {
        ...source,
        layout: {
          ...source.layout,
          [command.key]: command.value,
        },
      };
    case "setCssVar":
      return {
        ...source,
        cssVars: {
          ...source.cssVars,
          [command.key]: command.value,
        },
      };
    case "unsetCssVar": {
      const nextVars = { ...source.cssVars };
      delete nextVars[command.key];
      return { ...source, cssVars: nextVars };
    }
    case "replaceCss":
      return { ...source, css: command.css };
    case "appendCss":
      return { ...source, css: [source.css.trim(), command.css.trim()].filter(Boolean).join("\n\n") };
    case "resetAppearance":
      return getDefaultChartStyle(chartType ?? "compound").appearance;
    case "applyPreset": {
      const preset = getGraphAppearancePresets(chartType).find((preset) => preset.id === command.presetId);
      if (!preset) throw new Error(`Preset ${command.presetId} is not available for ${chartType}.`);
      return preset.appearance;
    }
  }
}

function buildAppearanceCommandMessage(command: AppearanceCommand): string {
  switch (command.type) {
    case "setLayout":
      return `Set layout ${command.key} to ${command.value}.`;
    case "setCssVar":
      return `Set ${command.key}.`;
    case "unsetCssVar":
      return `Removed ${command.key}.`;
    case "replaceCss":
      return "Replaced graph CSS.";
    case "appendCss":
      return "Appended graph CSS.";
    case "resetAppearance":
      return "Reset graph appearance.";
    case "applyPreset":
      return `Applied ${command.presetId} appearance preset.`;
  }
}

function buildAppearanceDiff(before: GraphAppearance, after: GraphAppearance): string[] {
  const lines: string[] = [];
  (Object.keys(after.layout) as Array<keyof GraphLayoutAppearance>).forEach((key) => {
    if (before.layout[key] !== after.layout[key]) {
      lines.push(`~ layout.${key}: ${before.layout[key]} -> ${after.layout[key]}`);
    }
  });
  (Object.keys(after.display) as Array<keyof GraphAppearance["display"]>).forEach((key) => {
    if (before.display[key] !== after.display[key]) {
      lines.push(`~ display.${key}: ${before.display[key]} -> ${after.display[key]}`);
    }
  });
  const cssVarKeys = Array.from(new Set([...Object.keys(before.cssVars), ...Object.keys(after.cssVars)])).sort();
  cssVarKeys.forEach((key) => {
    if (before.cssVars[key] !== after.cssVars[key]) {
      lines.push(`~ cssVars.${key}`);
    }
  });
  if (before.css !== after.css) {
    lines.push("~ css");
  }
  return lines.length ? lines : ["No appearance changes expected."];
}
