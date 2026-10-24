import type { ChartStyle, ChartStyles } from "../schema/appearanceModel";
export type { ChartStyle, ChartStyles, ChartDisplayOptions } from "../schema/appearanceModel";
import { sanitizeGraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { NODE_LINK_DEFAULT_APPEARANCE, NODE_LINK_DEFAULT_DISPLAY } from "../graph/nodeLinkAppearance";
import type { GraphChartType } from "../graph/types";
import { sanitizeTimelineSettings } from "../graph/timelineSettings";

/** Imported JSON can use a different property order without changing the style. */
export function chartStylesEqual(left: ChartStyle, right: ChartStyle): boolean {
  const stable = (value: ChartStyle) =>
    JSON.stringify(value, (_key, entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
        : entry,
    );
  return stable(left) === stable(right);
}

export function mapChartTypes<T>(create: (type: GraphChartType) => T): Record<GraphChartType, T> {
  return {
    "node-link": create("node-link"),
    sankey: create("sankey"),
    compound: create("compound"),
    timeline: create("timeline"),
    spatial: create("spatial"),
  };
}

function createBaseChartStyle(input: Partial<ChartStyle> = {}): ChartStyle {
  return {
    ...(input.timeline ? { timeline: sanitizeTimelineSettings(input.timeline) } : {}),
    appearance: sanitizeGraphAppearance(input.appearance),
    showNodeDetail: input.showNodeDetail ?? true,
    hideNodeBorders: input.hideNodeBorders ?? true,
    alignNodeWidthsToMax: input.alignNodeWidthsToMax ?? false,
  };
}

export function createChartStyles(): ChartStyles {
  return mapChartTypes(getDefaultChartStyle);
}

export function getDefaultChartStyle(type: GraphChartType): ChartStyle {
  if (type === "node-link")
    return { appearance: structuredClone(NODE_LINK_DEFAULT_APPEARANCE), ...NODE_LINK_DEFAULT_DISPLAY };
  if (type === "spatial") {
    const style = createBaseChartStyle({ showNodeDetail: false });
    style.appearance.cssVars["--dag-title-font-size"] = "12px";
    return style;
  }
  if (type === "compound") {
    const style = getCompoundPreset2Style();
    style.appearance.layout.nodeHeight = 100;
    style.appearance.layout.minNodeWidth = 200;
    style.appearance.layout.maxNodeWidth = 200;
    Object.assign(style.appearance.display, {
      titleAlign: "center",
      titleWrap: true,
      showNodeDots: false,
      nodeCornerRadius: 20,
    });
    Object.assign(style.appearance.cssVars, {
      "--dag-title-font-size": "22px",
      "--dag-title-font-family": '"Times New Roman", serif',
      "--dag-edge-active": "#cc0000",
      "--dag-edge": "#cccccc",
    });
    return style;
  }
  return createBaseChartStyle(
    type === "timeline" ? { showNodeDetail: false, timeline: sanitizeTimelineSettings(null) } : {},
  );
}

/** The saved horizontal timeline style. Category names and document pins are not part of a preset. */
export function getTimelinePreset2Style(): ChartStyle {
  const style = getDefaultChartStyle("timeline");
  style.appearance = structuredClone(style.appearance);
  Object.assign(style.appearance.cssVars, {
    "--dag-title-font-family": '"Times New Roman", serif',
    "--dag-title-font-style": "italic",
  });
  style.timeline = sanitizeTimelineSettings({
    orientation: "horizontal",
    edgeRouting: "direct",
    colorBy: "type",
    intervalWidth: 24,
    intervalTitle: "inside",
    intervalBorder: "solid",
    intervalBorderWidth: 1,
    intervalRadius: 0,
    intervalTextColorMode: "event",
    anchorMarker: { visible: false },
    axis: "linear",
    tickStep: 1,
    nodeGap: 0,
    horizontalSpread: 0,
  });
  return style;
}

export function getCompoundPreset2Style(): ChartStyle {
  return {
    appearance: sanitizeGraphAppearance({
      ...DEFAULT_GRAPH_APPEARANCE,
      layout: { ...DEFAULT_GRAPH_APPEARANCE.layout, columnGap: 24, rowGap: 24, nodeHeight: 48, maxNodeWidth: 240 },
      display: {
        ...DEFAULT_GRAPH_APPEARANCE.display,
        nodeCornerRadius: 16,
        showGroupStats: false,
        showGroupBorders: false,
        showEdgeLabels: false,
        edgeArrowStyle: "open",
      },
      cssVars: { ...DEFAULT_GRAPH_APPEARANCE.cssVars, "--dag-edge": "#e1e3e6", "--dag-edge-active": "#8b1e2d" },
      css: `${DEFAULT_GRAPH_APPEARANCE.css}\n.dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }`,
    }),
    showNodeDetail: false,
    hideNodeBorders: true,
    alignNodeWidthsToMax: true,
  };
}
