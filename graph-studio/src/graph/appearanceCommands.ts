import { type GraphAppearance, type GraphLayoutAppearance, sanitizeGraphAppearance } from "./appearance";
import type { GraphChartType } from "./types";
import type { ChartStyleDocument } from "../schema/appearanceModel";
import { createStyleDocument } from "../schema/styleProtocol";
import { getDefaultChartStyle, getManifestPresetStyle, type ChartStyle } from "../state/chartStyles";
import { PRESET_MANIFEST } from "../schema/presetManifest";

export type AppearanceCommand =
  | {
      [K in keyof GraphLayoutAppearance]: { type: "setLayout"; key: K; value: GraphLayoutAppearance[K] };
    }[keyof GraphLayoutAppearance]
  | { type: "setCssVar"; key: string; value: string }
  | { type: "unsetCssVar"; key: string }
  | { type: "replaceCss"; css: string }
  | { type: "appendCss"; css: string }
  | { type: "resetAppearance" }
  | { type: "applyPreset"; presetId: GraphAppearancePresetId };

export type GraphAppearancePresetId = string;

interface GraphAppearancePreset {
  id: GraphAppearancePresetId;
  label: string;
  document: ChartStyleDocument;
}

export interface AppearanceCommandResult {
  appearance: GraphAppearance;
  message: string;
  diff: string[];
}

export function getGraphAppearancePresets(chartType?: GraphChartType): GraphAppearancePreset[] {
  const type = chartType ?? "compound";
  return PRESET_MANIFEST[type].presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    document: createStyleDocument(type, getManifestPresetStyle(type, preset.id)),
  }));
}

export function getGraphPresetStyle(chartType: GraphChartType, presetId: GraphAppearancePresetId): ChartStyle {
  const preset = getGraphAppearancePresets(chartType).find((preset) => preset.id === presetId);
  if (!preset) throw new Error(`Preset ${presetId} is not available for ${chartType}.`);
  return structuredClone(preset.document.style);
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
      return preset.document.style.appearance;
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
    if (JSON.stringify(before.layout[key]) !== JSON.stringify(after.layout[key])) {
      lines.push(`~ layout.${key}: ${JSON.stringify(before.layout[key])} -> ${JSON.stringify(after.layout[key])}`);
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
