import type { GraphChartType } from "../../graph/types";

/** Presentation only. Values, defaults, valid enums and constraints belong to Schema. */
export interface AppearanceUINode {
  id: string;
  path?: string;
  renderer?: string;
  label?: string;
  labelBy?: { path: string; values: Record<string, string> };
  charts?: readonly GraphChartType[];
  options?: {
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    scale?: number;
    invert?: boolean;
    labels?: string[];
  };
  children?: readonly AppearanceUINode[];
}
const field = (
  id: string,
  path: string,
  renderer?: string,
  options?: AppearanceUINode["options"],
  label?: string,
): AppearanceUINode => ({ id, path, renderer, options, label });
const display = (id: string, renderer?: string, options?: AppearanceUINode["options"], label?: string) =>
  field(id, `style.appearance.display.${id}`, renderer, options, label);
const color = (name: string) => field(name, `style.appearance.cssVars[${name}]`, "color");

export const APPEARANCE_UI: Record<string, AppearanceUINode> = {
  timelineLayout: {
    id: "timeline-layout",
    path: "style.timeline",
    renderer: "timeline-layout",
    charts: ["timeline"],
    children: [
      { id: "timeline-arrangement", path: "orientation", label: "Timeline arrangement" },
      { id: "timeline-axis", path: "axis", label: "Time axis" },
      { id: "timeline-routing", path: "edgeRouting", label: "Connections" },
    ],
  },
  nodes: {
    id: "nodes",
    path: "style.appearance",
    renderer: "panel",
    children: [
      {
        id: "node-sizes",
        path: "style.appearance.nodes",
        renderer: "grid",
        children: [
          field(
            "widths",
            "widths",
            "tuple",
            { max: 480, step: 4, labels: ["Minimum width", "Maximum width"] },
            "Node widths",
          ),
          field("height", "height", "number", { max: 160, step: 2, unit: "px" }, "Node height"),
          field("width", "width", "number", { max: 48, unit: "px" }, "Flow node width"),
          field("column", "spacing.column", "number", { max: 260, step: 2, unit: "px" }, "Column spacing"),
          field("row", "spacing.row", "number", { max: 140, step: 2, unit: "px" }, "Row spacing"),
          field("channel", "spacing.channel", "number", { max: 140, step: 2, unit: "px" }, "Timeline channel spacing"),
          {
            ...field(
              "spread",
              "spread",
              "number",
              { max: 300, step: 10, unit: "%", scale: 100 },
              "Timeline horizontal spread",
            ),
            charts: ["timeline"],
            labelBy: {
              path: "style.timeline.orientation",
              values: { horizontal: "Timeline vertical spread", vertical: "Timeline horizontal spread" },
            },
          },
        ],
      },
      { id: "timeline-colors", path: "style.timeline", renderer: "timeline-colors", charts: ["timeline"] },
      {
        id: "timeline-points",
        path: "style.timeline",
        renderer: "timeline-points",
        charts: ["timeline"],
        children: [{ id: "point-marker", path: "pointMarker", renderer: "timeline-marker" }],
      },
      { id: "timeline-intervals", path: "style.timeline", renderer: "timeline-intervals", charts: ["timeline"] },
      display("nodeCornerRadius", "number", { max: 80, unit: "px" }),
      color("--dag-node-fill"),
      color("--dag-node-border"),
      color("--dag-node-border-strong"),
      display("nodeShadow", "toggle"),
      display("shadowBlur", "number", { max: 32 }),
      display("shadowOffset", "number", { max: 16 }),
      display("shadowOpacity", "number", { max: 40, unit: "%" }),
      display("showNodeDots", "toggle"),
      display("showGroupStats", "toggle"),
      display("showGroupBorders", "toggle"),
      field("hideNodeBorders", "style.hideNodeBorders", "toggle", { invert: true }, "Node borders"),
      {
        ...field("showNodeDetail", "style.showNodeDetail", "toggle", undefined, "Node descriptions"),
        charts: ["node-link", "compound"],
      },
      field("alignNodeWidthsToMax", "style.alignNodeWidthsToMax", "toggle", undefined, "Equal node widths"),
      {
        id: "node-text",
        path: "style.appearance",
        renderer: "section",
        label: "Node text",
        children: [
          { id: "timeline-point-text", path: "style.timeline", renderer: "timeline-point-text", charts: ["timeline"] },
          {
            id: "timeline-interval-text",
            path: "style.timeline",
            renderer: "timeline-interval-text",
            charts: ["timeline"],
          },
          {
            ...field("showNodeDetail", "style.showNodeDetail", "toggle", undefined, "Node descriptions"),
            charts: ["timeline"],
          },
          color("--dag-text-strong"),
          color("--dag-text-soft"),
          {
            id: "title-format",
            renderer: "title-format",
            children: [
              display("titleAlign"),
              display("titleOverflow"),
              field("fontWeight", "style.appearance.cssVars[--dag-title-font-weight]"),
              field("fontStyle", "style.appearance.cssVars[--dag-title-font-style]"),
            ],
          },
          display("titleWrap", "toggle", undefined, "Two-line title"),
          field("fontFamily", "style.appearance.cssVars[--dag-title-font-family]", "font", undefined, "Title font"),
          field(
            "fontSize",
            "style.appearance.cssVars[--dag-title-font-size]",
            "number",
            { max: 28, unit: "px" },
            "Title size",
          ),
        ],
      },
      {
        id: "detail-typography",
        charts: ["node-link", "compound", "timeline", "sankey"],
        label: "Node descriptions",
        renderer: "section",
        children: [
          field("detail-font-family", "style.appearance.cssVars[--dag-detail-font-family]", "font", undefined, "Font"),
          field(
            "detail-font-size",
            "style.appearance.cssVars[--dag-detail-font-size]",
            "number",
            { max: 28, unit: "px" },
            "Size",
          ),
          field(
            "detail-font-weight",
            "style.appearance.cssVars[--dag-detail-font-weight]",
            "field",
            undefined,
            "Weight",
          ),
          field("detail-font-style", "style.appearance.cssVars[--dag-detail-font-style]", "field", undefined, "Style"),
        ],
      },
      {
        id: "date-typography",
        charts: ["timeline"],
        label: "Event dates",
        renderer: "section",
        children: [
          field("date-font-family", "style.appearance.cssVars[--dag-date-font-family]", "font", undefined, "Font"),
          field(
            "date-font-size",
            "style.appearance.cssVars[--dag-date-font-size]",
            "number",
            { max: 28, unit: "px" },
            "Size",
          ),
          field("date-font-weight", "style.appearance.cssVars[--dag-date-font-weight]", "field", undefined, "Weight"),
          field("date-font-style", "style.appearance.cssVars[--dag-date-font-style]", "field", undefined, "Style"),
        ],
      },
    ],
  },
  edges: {
    id: "edges",
    path: "style.appearance",
    renderer: "panel",
    children: [
      field(
        "edge-spacing",
        "style.appearance.edges.spacing",
        "number",
        { max: 96, step: 2, unit: "px" },
        "Edge lane spacing",
      ),
      {
        id: "timeline-anchors",
        path: "style.timeline",
        renderer: "timeline-anchors",
        charts: ["timeline"],
        children: [{ id: "anchor-marker", path: "anchorMarker", renderer: "timeline-marker" }],
      },
      color("--dag-edge"),
      color("--dag-edge-active"),
      display("sankeyLinkOpacity", "number", { max: 90, unit: "%" }),
      {
        id: "edge-text",
        label: "Edge text",
        renderer: "section",
        children: [display("showEdgeLabels", "toggle"), color("--dag-edge-label-color")],
      },
    ],
  },
  canvas: {
    id: "canvas",
    path: "style.appearance.canvas",
    renderer: "panel",
    children: [
      field(
        "padding",
        "padding",
        "tuple",
        { max: 300, step: 2, labels: ["Horizontal padding", "Vertical padding"] },
        "Canvas padding",
      ),
      field(
        "minSize",
        "minSize",
        "tuple",
        { max: 2400, step: 20, labels: ["Minimum canvas width", "Minimum canvas height"] },
        "Minimum canvas size",
      ),
      {
        id: "axis-typography",
        charts: ["timeline"],
        label: "Time axis text",
        renderer: "section",
        children: [
          field("axis-font-family", "style.appearance.cssVars[--dag-axis-font-family]", "font", undefined, "Font"),
          field(
            "axis-font-size",
            "style.appearance.cssVars[--dag-axis-font-size]",
            "number",
            { max: 28, unit: "px" },
            "Size",
          ),
          field("axis-font-weight", "style.appearance.cssVars[--dag-axis-font-weight]", "field", undefined, "Weight"),
          field("axis-font-style", "style.appearance.cssVars[--dag-axis-font-style]", "field", undefined, "Style"),
        ],
      },
      {
        id: "track-typography",
        charts: ["timeline"],
        label: "Track text",
        renderer: "section",
        children: [
          field("track-font-family", "style.appearance.cssVars[--dag-track-font-family]", "font", undefined, "Font"),
          field(
            "track-font-size",
            "style.appearance.cssVars[--dag-track-font-size]",
            "number",
            { max: 28, unit: "px" },
            "Size",
          ),
          field("track-font-weight", "style.appearance.cssVars[--dag-track-font-weight]", "field", undefined, "Weight"),
          field("track-font-style", "style.appearance.cssVars[--dag-track-font-style]", "field", undefined, "Style"),
        ],
      },
    ],
  },
};

export function resolveUIPath(parent: string | undefined, path: string | undefined) {
  if (!path) return parent;
  return path.startsWith("style.") || path === "style" ? path : parent ? `${parent}.${path}` : path;
}
