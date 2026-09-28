import {
  DEFAULT_GRAPH_APPEARANCE,
  sanitizeGraphAppearance,
  type GraphAppearance,
  type GraphLayoutAppearance,
} from "./appearance";

export type AppearanceCommand =
  | { type: "setLayout"; key: keyof GraphLayoutAppearance; value: number }
  | { type: "setCssVar"; key: string; value: string }
  | { type: "unsetCssVar"; key: string }
  | { type: "replaceCss"; css: string }
  | { type: "appendCss"; css: string }
  | { type: "resetAppearance" }
  | { type: "applyPreset"; presetId: GraphAppearancePresetId };

export type GraphAppearancePresetId = "simple" | "compact" | "default" | "slate" | "blueprint" | "contrast" | "presentation";

export interface GraphAppearancePreset {
  id: GraphAppearancePresetId;
  label: string;
  appearance: GraphAppearance;
}

export interface AppearanceCommandResult {
  appearance: GraphAppearance;
  message: string;
  diff: string[];
}

export const GRAPH_APPEARANCE_PRESETS: GraphAppearancePreset[] = [
  {
    id: "simple",
    label: "Simple",
    appearance: sanitizeGraphAppearance({
      ...DEFAULT_GRAPH_APPEARANCE,
      layout: {
        ...DEFAULT_GRAPH_APPEARANCE.layout,
        columnGap: 60,
        rowGap: 20,
        edgeLaneGap: 10,
        nodeHeight: 48,
        maxNodeWidth: 240,
      },
      display: {
        ...DEFAULT_GRAPH_APPEARANCE.display,
        showEdgeLabels: false,
      },
      cssVars: {
        ...DEFAULT_GRAPH_APPEARANCE.cssVars,
        "--dag-title-font-size": "16px",
      },
      css: `${DEFAULT_GRAPH_APPEARANCE.css}

.dag-edge__path { stroke-width: 1px; }

.dag-node__shape { box-shadow: none !important; filter: none !important; }

.dag-node__pin { display: none; }

.dag-node__title { alignment-baseline: central; dominant-baseline: central; }`,
    }),
  },
  {
    id: "compact",
    label: "Compact",
    appearance: sanitizeGraphAppearance({
      ...DEFAULT_GRAPH_APPEARANCE,
      layout: {
        ...DEFAULT_GRAPH_APPEARANCE.layout,
        columnGap: 60,
        rowGap: 20,
        edgeLaneGap: 10,
        nodeHeight: 48,
        maxNodeWidth: 240,
      },
      display: {
        ...DEFAULT_GRAPH_APPEARANCE.display,
        showEdgeLabels: false,
      },
      css: `${DEFAULT_GRAPH_APPEARANCE.css}\n\n.dag-edge__path { stroke-width: 1px; }`,
    }),
  },
  { id: "default", label: "Default", appearance: DEFAULT_GRAPH_APPEARANCE },
  {
    id: "slate",
    label: "Slate",
    appearance: createPreset({
      "--dag-text-strong": "#e5eefc",
      "--dag-text-soft": "#9aa8bd",
      "--dag-edge": "rgba(148, 163, 184, 0.34)",
      "--dag-edge-active": "rgba(125, 211, 252, 0.78)",
      "--dag-node-fill": "rgba(18, 24, 38, 0.94)",
      "--dag-node-border": "rgba(125, 211, 252, 0.26)",
      "--dag-node-border-strong": "rgba(125, 211, 252, 0.52)",
    }, `
.dag-stage__halo {
  fill: rgba(15, 23, 42, 0.82);
}

.dag-node__shape {
  filter: drop-shadow(0 16px 28px rgba(2, 8, 23, 0.24));
}
`.trim()),
  },
  {
    id: "blueprint",
    label: "Blueprint",
    appearance: createPreset({
      "--dag-text-strong": "#123154",
      "--dag-text-soft": "#53708f",
      "--dag-edge": "rgba(37, 99, 235, 0.32)",
      "--dag-edge-active": "rgba(29, 78, 216, 0.82)",
      "--dag-node-fill": "rgba(239, 246, 255, 0.94)",
      "--dag-node-border": "rgba(59, 130, 246, 0.28)",
      "--dag-node-border-strong": "rgba(37, 99, 235, 0.54)",
    }, `
.dag-stage__halo {
  fill: rgba(239, 246, 255, 0.72);
}
`.trim()),
  },
  {
    id: "contrast",
    label: "High Contrast",
    appearance: createPreset({
      "--dag-text-strong": "#050505",
      "--dag-text-soft": "#333333",
      "--dag-edge": "rgba(0, 0, 0, 0.58)",
      "--dag-edge-active": "#000000",
      "--dag-node-fill": "#ffffff",
      "--dag-node-border": "#111111",
      "--dag-node-border-strong": "#000000",
      "--dag-title-font-style": "normal",
      "--dag-title-font-weight": "700",
    }, `
.dag-node__shape {
  filter: none;
}
`.trim()),
  },
  {
    id: "presentation",
    label: "Presentation",
    appearance: sanitizeGraphAppearance({
      ...DEFAULT_GRAPH_APPEARANCE,
      layout: {
        ...DEFAULT_GRAPH_APPEARANCE.layout,
        columnGap: 144,
        rowGap: 34,
        edgeLaneGap: 34,
        nodeHeight: 86,
        minNodeWidth: 210,
        maxNodeWidth: 340,
      },
      cssVars: {
        ...DEFAULT_GRAPH_APPEARANCE.cssVars,
        "--dag-title-font-size": "17px",
        "--dag-title-font-weight": "700",
      },
    }),
  },
];

export function applyAppearanceCommand(source: GraphAppearance, command: AppearanceCommand): AppearanceCommandResult {
  const before = sanitizeGraphAppearance(source);
  const after = sanitizeGraphAppearance(applyRawAppearanceCommand(before, command));
  return {
    appearance: after,
    message: buildAppearanceCommandMessage(command),
    diff: buildAppearanceDiff(before, after),
  };
}

export function isAppearanceCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized.startsWith("/layout ")
    || normalized.startsWith("/style-var ")
    || normalized.startsWith("/style-css ")
    || normalized === "/style-css"
    || normalized.startsWith("/style-reset")
    || normalized.startsWith("/style-preset ");
}

export function buildAppearanceMutationLabel(count: number, fallbackMessage: string | undefined): string {
  if (count <= 1) {
    return fallbackMessage || "Updated graph appearance.";
  }
  return `Updated graph appearance with ${count} commands.`;
}

function applyRawAppearanceCommand(source: GraphAppearance, command: AppearanceCommand): GraphAppearance {
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
      return DEFAULT_GRAPH_APPEARANCE;
    case "applyPreset":
      return GRAPH_APPEARANCE_PRESETS.find((preset) => preset.id === command.presetId)?.appearance || source;
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

function createPreset(cssVars: Record<string, string>, css: string): GraphAppearance {
  return sanitizeGraphAppearance({
    ...DEFAULT_GRAPH_APPEARANCE,
    cssVars: {
      ...DEFAULT_GRAPH_APPEARANCE.cssVars,
      ...cssVars,
    },
    css: [DEFAULT_GRAPH_APPEARANCE.css, css].filter(Boolean).join("\n\n"),
  });
}
