import type { TimelineViewSettings, TimelineMarkerSettings, TimelineTickUnit } from "../schema/appearanceModel";
export type { TimelineViewSettings, TimelineMarkerSettings, TimelineTickUnit } from "../schema/appearanceModel";
export function sanitizeTimelineSettings(value: unknown): TimelineViewSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const unit = input.tickUnit;
  const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const pins = Object.fromEntries(
    Object.entries(input.pins && typeof input.pins === "object" && !Array.isArray(input.pins) ? input.pins : {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
  return {
    layout: input.layout === "flow" ? "flow" : "tracks",
    orientation: input.orientation === "horizontal" ? "horizontal" : "vertical",
    edgeRouting: input.edgeRouting === "direct" ? "direct" : "avoid",
    colorBy: input.colorBy === "type" ? "type" : "track",
    typeColors: Object.fromEntries(
      Object.entries(
        input.typeColors && typeof input.typeColors === "object" && !Array.isArray(input.typeColors)
          ? input.typeColors
          : {},
      ).flatMap(([key, value]) => (color(value) ? [[key, color(value)]] : [])),
    ),
    intervalWidth: finite(input.intervalWidth, 12),
    intervalTitle:
      input.intervalTitle === "inside" || input.intervalTitle === "hidden" ? input.intervalTitle : "outside",
    intervalAlign: input.intervalAlign === "start" || input.intervalAlign === "end" ? input.intervalAlign : "center",
    intervalStyle: input.intervalStyle === "solid" || input.intervalStyle === "outline" ? input.intervalStyle : "soft",
    intervalBorder:
      input.intervalBorder === "none" || input.intervalBorder === "solid" || input.intervalBorder === "dashed"
        ? input.intervalBorder
        : "auto",
    intervalBorderWidth: Math.max(0, Math.min(20, finite(input.intervalBorderWidth, 1.5))),
    intervalBorderColor: color(input.intervalBorderColor),
    intervalRadius: Math.max(0, Math.min(120, finite(input.intervalRadius, 4))),
    intervalTextColor: color(input.intervalTextColor),
    intervalTextColorMode:
      input.intervalTextColorMode === "event" ? "event" : input.intervalTextColorMode === "custom" ? "custom" : "theme",
    pointMarker: sanitizeTimelineMarker(input.pointMarker, false),
    anchorMarker: sanitizeTimelineMarker(input.anchorMarker, true),
    pointTextColor: color(input.pointTextColor),
    pointDateVisible: input.pointDateVisible !== false,
    pointDateColor: color(input.pointDateColor),
    leaderStyle: input.leaderStyle === "none" || input.leaderStyle === "dashed" ? input.leaderStyle : "solid",
    leaderColor: color(input.leaderColor),
    leaderWidth: Math.max(0, Math.min(20, finite(input.leaderWidth, 0.7))),
    relativeTickStep: finite(input.relativeTickStep, 1),
    axis: input.axis === "linear" ? "linear" : "adaptive",
    tickStep: finite(input.tickStep, 10),
    tickUnit: ["second", "minute", "hour", "day", "week", "month", "year"].includes(String(unit))
      ? (unit as TimelineTickUnit)
      : "auto",
    nodeGap: finite(input.nodeGap, 24),
    horizontalSpread: finite(input.horizontalSpread, 1),
    compactness: finite(input.compactness, 0.5),
    locked: input.locked === true,
    pins,
  };
}

function color(value: unknown): string {
  return typeof value === "string" &&
    /^(#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|rgba?\([\d.,%\s+-]+\))$/i.test(value.trim())
    ? value.trim()
    : "";
}

export function sanitizeTimelineMarker(value: unknown, anchor: boolean): TimelineMarkerSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const number = (value: unknown, fallback: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
  return {
    visible: input.visible !== false,
    shape:
      input.shape === "circle" || input.shape === "square" || input.shape === "diamond"
        ? input.shape
        : anchor
          ? "auto"
          : "circle",
    size: number(input.size, anchor ? 8 : 12, 120),
    fill: color(input.fill),
    borderColor: color(input.borderColor),
    borderWidth: number(input.borderWidth, 1.5, 20),
  };
}
