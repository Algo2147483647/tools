import { getDefaultChartStyle } from "../../state/chartStyles";
import { serializeChartStyle } from "../../state/chartStyleFile";
import type { GraphChartType } from "../../graph/types";
import { orderSchemaFields, schemaField, type SchemaField } from "./schemaModel";

const descriptions: Record<string, string> = {
  format: "Portable style document format.",
  version: "Style file protocol version.",
  chartType: "Must match the chart selected when importing.",
  style: "Complete chart profile; graph data is stored separately.",
  showNodeDetail: "Shows card descriptions or Timeline label details where supported.",
  hideNodeBorders: "Hides ordinary card borders when true; data-colored bars and points use their own paint.",
  alignNodeWidthsToMax: "Aligns ordinary card widths; used by Node-link and Nested node-link.",
  appearance: "Shared appearance object; includes stored fields unused by some charts.",
  "appearance.version": "Nested appearance protocol version.",
  layout: "Stored geometry values; renderer support varies by chart.",
  display: "Display flags and visual dimensions; unsupported fields remain stored.",
  cssVars: "SVG root CSS variables; only --dag- names with string values are accepted.",
  css: "Saved CSS, capped at 50,000 characters; @import is removed; built-in effects may take precedence.",
  stagePaddingX: "Horizontal stage padding in logical pixels.",
  stagePaddingY: "Vertical stage padding in logical pixels.",
  columnGap: "Layer separation in logical pixels.",
  rowGap: "Node or label separation in logical pixels.",
  edgeLaneGap: "Ordinary Node-link edge-lane separation in logical pixels.",
  nodeHeight: "Base card height or chart-specific vertical-space input.",
  minNodeWidth: "Minimum ordinary card width in logical pixels.",
  maxNodeWidth: "Maximum card or label width in logical pixels.",
  stageMinWidth: "Minimum stage width where supported.",
  stageMinHeight: "Minimum stage height where supported.",
  titleAlign: "Nested node-link card-title alignment.",
  titleOverflow: "Nested node-link title overflow treatment.",
  titleWrap: "Enables two-line titles in Nested node-link.",
  edgeArrowStyle: "Shape of the shared ordinary-edge arrowhead.",
  showNodeDots: "Card dots and corresponding content offset.",
  showEdgeLabels: "Enables relation-label geometry; Timeline reveals labels on active edges.",
  showGroupStats: "Nested node-link group statistics.",
  showGroupBorders: "Expanded Nested node-link container borders.",
  nodeCornerRadius: "Ordinary/collapsed card radius, capped at half the smaller rendered dimension.",
  nodeShadow: "Shared node-shape shadows; dense scenes suppress them.",
  shadowBlur: "Shadow softness in logical pixels.",
  shadowOffset: "Vertical shadow distance in logical pixels.",
  shadowOpacity: "Shadow opacity as a percentage, not a 0–1 fraction.",
  sankeyNodeWidth: "Sankey bar width in logical pixels; exposed under Layout.",
  sankeyLinkOpacity: "Sankey normal-band opacity as a percentage; interaction has separate opacity rules.",
  "--dag-node-fill": "Card/background fill; does not replace Sankey or Spatial data colors.",
  "--dag-node-border": "Ordinary card outline; per-node category tokens can override it.",
  "--dag-node-border-strong": "Emphasized/root card outline.",
  "--dag-edge": "Default ordinary-edge or axis/grid color where consumed.",
  "--dag-edge-active": "Active ordinary-edge color; explicit data strokes can take precedence.",
  "--dag-text-strong": "Primary text color.",
  "--dag-text-soft": "Secondary text color.",
  "--dag-title-font-family": "Title font stack; installed fonts determine rendering.",
  "--dag-title-font-size": "CSS length for titles; Timeline has a fixed base title size instead.",
  "--dag-title-font-weight": "Title font weight as a CSS string.",
  "--dag-title-font-style": "Title font style as a CSS string.",
  timeline: "Timeline-specific geometry, event colors, markers and text settings.",
  "timeline.layout": "Tracks groups by track; Flow arranges connected event chains.",
  orientation: "Direction of increasing time; text remains upright.",
  edgeRouting: "Routes between time anchors directly or around obstacles.",
  colorBy: "Uses Track or Type categories for event color.",
  typeColors: "Type-name color overrides, used only when colorBy is type.",
  intervalWidth: "Interval thickness across the time axis; never changes its duration.",
  intervalTitle: "Outside shows title/time; inside clips the title to the true interval; hidden omits it.",
  intervalAlign: "Inside-title alignment along the interval.",
  intervalStyle: "Interval fill treatment.",
  intervalBorder: "Interval outline treatment; auto follows fill style.",
  intervalBorderWidth: "Interval stroke width, clamped to 0–20 px.",
  intervalBorderColor: "Interval border override; empty uses the renderer fallback.",
  intervalRadius: "Interval corner radius, clamped to 0–120 px.",
  intervalTextColor: "Custom interval title color; empty uses the fallback.",
  intervalTextColorMode: "Selects theme, event color or explicit custom text color.",
  pointMarker: "Marker for an instant event.",
  anchorMarker: "Markers for interval boundaries and interior attachments.",
  visible: "Marker visibility; hiding a marker does not remove its time anchor.",
  shape: "Marker shape; auto resolves contextually for anchors and to circle for points.",
  size: "Marker size, clamped to 0–120 logical pixels.",
  fill: "Marker fill override; empty follows contextual color.",
  borderColor: "Marker border override; empty uses the fallback.",
  borderWidth: "Marker border width, clamped to 0–20 px.",
  pointTextColor: "Point-title color override; empty follows theme.",
  pointDateVisible: "Shows the point's date/time text.",
  pointDateColor: "Point date/time color override.",
  leaderStyle: "Label-to-time leader line, independent of graph relationships.",
  leaderColor: "Leader line color override.",
  leaderWidth: "Leader stroke width, clamped to 0–20 px.",
  relativeTickStep: "Positive tick step in the relative clock's native units.",
  axis: "Linear preserves elapsed-time scale; adaptive compresses sparse periods.",
  tickStep: "Positive calendar tick interval; fixed intervals use integer steps.",
  tickUnit: "Calendar tick unit; auto chooses a suitable unit.",
  nodeGap: "Channel spacing input in logical pixels.",
  horizontalSpread: "Cross-time-axis spread multiplier, interpreted for the selected orientation.",
  compactness: "Timeline layout compactness input.",
  locked: "Retains the current time-axis mapping where supported.",
  pins: "Node-to-position map; clear temporary pins before publishing a reusable style.",
};
const enums: Record<string, string> = {
  titleAlign: "left | center",
  titleOverflow: "ellipsis | clip | visible",
  edgeArrowStyle: "filled | open",
  "timeline.layout": "tracks | flow",
  orientation: "vertical | horizontal",
  edgeRouting: "avoid | direct",
  colorBy: "track | type",
  intervalTitle: "outside | inside | hidden",
  intervalAlign: "start | center | end",
  intervalStyle: "soft | solid | outline",
  intervalBorder: "auto | none | solid | dashed",
  intervalTextColorMode: "theme | event | custom",
  shape: "auto | circle | square | diamond",
  leaderStyle: "none | solid | dashed",
  axis: "linear | adaptive",
  tickUnit: "auto | second | minute | hour | day | week | month | year",
};
const required = new Set([
  "format",
  "version",
  "chartType",
  "style",
  "style.showNodeDetail",
  "style.hideNodeBorders",
  "style.alignNodeWidthsToMax",
  "style.appearance",
  "style.appearance.version",
  "style.appearance.layout",
  "style.appearance.display",
  "style.appearance.cssVars",
  "style.appearance.css",
]);

export function getAppearanceSchema(chartType: GraphChartType) {
  // Export the real Default preset so examples cannot drift from the accepted style envelope.
  const defaults = getDefaultChartStyle(chartType);
  const example = JSON.parse(
    serializeChartStyle(chartType, {
      showNodeDetail: defaults.showNodeDetail,
      hideNodeBorders: defaults.hideNodeBorders,
      alignNodeWidthsToMax: defaults.alignNodeWidthsToMax,
      appearance: defaults.appearance,
      ...(defaults.timeline ? { timeline: defaults.timeline } : {}),
    }),
  );
  const fields: SchemaField[] = [];
  function visit(value: unknown, path: string, key: string) {
    const object = value !== null && typeof value === "object" && !Array.isArray(value);
    const relative = path.replace(/^style\./, "");
    let description = descriptions[relative] ?? descriptions[key] ?? "Additional --dag- CSS token.";
    if (chartType === "spatial" && path.startsWith("style.appearance.layout."))
      description = "Stored for compatibility; Spatial geometry comes from coordinates and session projection.";
    if (chartType === "sankey" && key === "nodeHeight")
      description = "Available vertical room per node; bar height remains quantity-derived.";
    if (chartType === "timeline" && key === "maxNodeWidth") description = "Event label width in logical pixels.";
    if (chartType === "sankey" && key === "maxNodeWidth") description = "Label room in logical pixels.";
    const type =
      path === "format"
        ? '"graph-studio-style"'
        : path === "chartType"
          ? JSON.stringify(chartType)
          : path === "version" || path === "style.appearance.version"
            ? "1"
            : (enums[relative] ?? enums[key] ?? (object ? "object" : typeof value));
    const defaultValue = key === "css" ? "Built-in stylesheet" : object ? undefined : JSON.stringify(value);
    fields.push(schemaField(path, type, required.has(path) ? "Required" : "Optional", description, defaultValue));
    if (object)
      for (const [child, entry] of Object.entries(value as Record<string, unknown>))
        visit(entry, path === "style.appearance.cssVars" ? `${path}[${child}]` : `${path}.${child}`, child);
  }
  for (const [key, value] of Object.entries(example)) visit(value, key, key);
  fields.push(
    schemaField(
      "style.appearance.cssVars[--dag-*]",
      "string",
      "Optional",
      "Additional renderer variables; names must start with --dag-; values are limited to 500 characters.",
    ),
  );
  if (chartType === "timeline")
    fields.push(
      schemaField(
        "style.timeline.typeColors[type]",
        "color string",
        "Optional",
        "Type override; accepts hex or numeric rgb/rgba; empty uses the category palette.",
      ),
      schemaField(
        "style.timeline.pins[id]",
        "number",
        "Optional",
        "Finite cross-axis position for a node; explicit graph space indices take precedence.",
      ),
    );
  return { fields: orderSchemaFields(fields), example };
}
