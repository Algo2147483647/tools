export type TimelineTickUnit = "auto" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

export interface TimelineViewSettings {
  layout: "tracks" | "flow";
  orientation: "vertical" | "horizontal";
  colorBy: "track" | "type";
  typeColors: Record<string, string>;
  intervalWidth: number;
  intervalTitle: "outside" | "inside" | "hidden";
  intervalAlign: "start" | "center" | "end";
  intervalStyle: "soft" | "solid" | "outline";
  intervalBorder: "auto" | "none" | "solid" | "dashed";
  intervalBorderWidth: number;
  intervalBorderColor: string;
  intervalRadius: number;
  intervalTextColor: string;
  relativeTickStep: number;
  axis: "linear" | "adaptive";
  tickStep: number;
  tickUnit: TimelineTickUnit;
  nodeGap: number;
  horizontalSpread: number;
  compactness: number;
  locked: boolean;
  pins: Record<string, number>;
}

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
    layout: input.layout === "flow" || input.layout === "cluster" ? "flow" : "tracks",
    orientation: input.orientation === "horizontal" ? "horizontal" : "vertical",
    colorBy: input.colorBy === "type" ? "type" : "track",
    typeColors: Object.fromEntries(
      Object.entries(
        input.typeColors && typeof input.typeColors === "object" && !Array.isArray(input.typeColors)
          ? input.typeColors
          : {},
      ).flatMap(([key, value]) => (color(value) ? [[key, color(value)]] : [])),
    ),
    intervalWidth: finite(input.intervalWidth, 36),
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
    intervalRadius: Math.max(0, Math.min(120, finite(input.intervalRadius, 6))),
    intervalTextColor: color(input.intervalTextColor),
    relativeTickStep: finite(input.relativeTickStep, 1),
    axis: input.axis === "adaptive" ? "adaptive" : "linear",
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

export function getDocumentTimelineSettings(
  metadata: Record<string, unknown> | undefined,
): Partial<TimelineViewSettings> {
  const timeline = metadata?.timeline;
  if (!timeline || typeof timeline !== "object" || Array.isArray(timeline)) return {};
  const view = (timeline as Record<string, unknown>).view;
  return view && typeof view === "object" && !Array.isArray(view) ? (view as Partial<TimelineViewSettings>) : {};
}
