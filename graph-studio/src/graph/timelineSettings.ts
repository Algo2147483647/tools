export type TimelineTickUnit = "auto" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

export interface TimelineViewSettings {
  layout: "tracks" | "flow";
  orientation: "vertical" | "horizontal";
  intervalWidth: number;
  intervalTitle: "outside" | "inside" | "hidden";
  intervalAlign: "start" | "center" | "end";
  intervalStyle: "soft" | "solid" | "outline";
  intervalColor: "category" | "status";
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
    intervalWidth: finite(input.intervalWidth, 36),
    intervalTitle:
      input.intervalTitle === "inside" || input.intervalTitle === "hidden" ? input.intervalTitle : "outside",
    intervalAlign: input.intervalAlign === "start" || input.intervalAlign === "end" ? input.intervalAlign : "center",
    intervalStyle: input.intervalStyle === "solid" || input.intervalStyle === "outline" ? input.intervalStyle : "soft",
    intervalColor: input.intervalColor === "status" ? "status" : "category",
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

export function getDocumentTimelineSettings(
  metadata: Record<string, unknown> | undefined,
): Partial<TimelineViewSettings> {
  const timeline = metadata?.timeline;
  if (!timeline || typeof timeline !== "object" || Array.isArray(timeline)) return {};
  const view = (timeline as Record<string, unknown>).view;
  return view && typeof view === "object" && !Array.isArray(view) ? (view as Partial<TimelineViewSettings>) : {};
}
