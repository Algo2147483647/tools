/** Relative values stay in the declared unit. Schematic units never acquire a duration. */
export type RelativeTimeUnit = "unit" | "second" | "minute" | "hour" | "day" | "week" | "cycle";
export interface TimelineClock {
  mode: "calendar" | "relative";
  unit: RelativeTimeUnit;
  origin: string;
  format: "offset" | "elapsed";
  precision: number;
}
export const RELATIVE_UNITS: Record<RelativeTimeUnit, string> = {
  unit: "示意单位",
  second: "秒",
  minute: "分钟",
  hour: "小时",
  day: "天",
  week: "周",
  cycle: "周期",
};
export function sanitizeTimelineClock(value: unknown): TimelineClock {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    mode: v.mode === "relative" ? "relative" : "calendar",
    unit: Object.prototype.hasOwnProperty.call(RELATIVE_UNITS, String(v.unit)) ? (v.unit as RelativeTimeUnit) : "unit",
    origin: typeof v.origin === "string" && v.origin.trim() ? v.origin.trim() : "T0",
    format: v.format === "elapsed" ? "elapsed" : "offset",
    precision:
      typeof v.precision === "number" && Number.isFinite(v.precision)
        ? Math.min(12, Math.max(0, Math.round(v.precision)))
        : 2,
  };
}
export function getTimelineClock(metadata?: Record<string, unknown>): TimelineClock {
  const timeline = metadata?.timeline;
  return sanitizeTimelineClock(
    timeline && typeof timeline === "object" ? (timeline as Record<string, unknown>).clock : undefined,
  );
}
export function formatRelativeTime(value: number, clock: TimelineClock): string {
  const rounded = Number(value.toFixed(clock.precision));
  const magnitude = String(Math.abs(rounded));
  if (rounded === 0) return clock.origin;
  if (clock.format === "elapsed")
    return `${clock.origin}${rounded < 0 ? "前" : "后"} ${magnitude} ${RELATIVE_UNITS[clock.unit]}`;
  return `${clock.origin === "T0" ? "T" : clock.origin}${rounded < 0 ? "−" : "+"}${magnitude}`;
}
export function timelineClockCaption(clock: TimelineClock): string {
  return clock.mode === "relative" ? `${clock.origin} · ${RELATIVE_UNITS[clock.unit]}` : "UTC";
}
