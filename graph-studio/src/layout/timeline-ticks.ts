import { formatRelativeTime, type TimelineClock } from "../graph/timelineClock";
import { formatTimelineDate, formatTimelineYear } from "../graph/timeline";
import { createTimelineAxis, timelineTimeToY, timelineYToTime, type TimelineAxisMap } from "./timeline-axis";

const DAY = 86_400_000;
const YEAR = 365.2425 * DAY;

export type TimelineTickUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
export interface TimelineTickInterval {
  step: number;
  unit: TimelineTickUnit;
}
export interface TimelineTick {
  time: number;
  y: number;
  label: string;
}

const UNIT_MS: Record<TimelineTickUnit, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  year: YEAR,
};

/** Shared by the live ruler, grid and SVG export. Fixed intervals remain calendar-aligned
 * when zoomed out; labels may omit intervening base ticks to stay readable.
 */
export function getTimelineAxisTicks(
  map: TimelineAxisMap,
  top: number,
  bottom: number,
  scale: number,
  interval?: TimelineTickInterval,
  clock?: TimelineClock,
  relativeStep = 1,
): TimelineTick[] {
  if (clock?.mode === "relative") return getRelativeTicks(map, top, bottom, scale, clock, relativeStep);
  if (![top, bottom, scale].every(Number.isFinite) || bottom <= top || scale <= 0) return [];
  if (interval && (!Number.isSafeInteger(interval.step) || interval.step <= 0 || !(interval.unit in UNIT_MS)))
    return [];
  if (map.start === map.end)
    return map.originY >= top && map.originY <= bottom
      ? [{ time: map.start, y: map.originY, label: formatTimelineDate(map.start) }]
      : [];
  const first = Math.max(map.start, timelineYToTime(map, top));
  const last = Math.min(map.end, timelineYToTime(map, bottom));
  if (first > last) return [];
  const candidates = new Map<number, TimelineTick>();
  for (let index = 0; index < map.knots.length - 1; index++) {
    const left = map.knots[index],
      right = map.knots[index + 1];
    if (right.time < first || left.time > last) continue;
    const segmentFirst = Math.max(first, left.time),
      segmentLast = Math.min(last, right.time);
    const pixelsPerMs = (right.y - left.y) / (right.time - left.time);
    const minimumStep = 72 / (pixelsPerMs * scale);
    const base = interval || automaticInterval(minimumStep);
    const approxStep = base.step * UNIT_MS[base.unit];
    // Jump by whole base intervals instead of enumerating millions of hidden seconds.
    const stride = Math.max(
      1,
      Math.floor(minimumStep / approxStep),
      Math.ceil((segmentLast - segmentFirst) / approxStep / 1200),
    );
    const visible = { ...base, step: base.step * stride };
    let time = alignedAtOrBefore(segmentFirst, visible);
    if (time < segmentFirst) time = advance(time, visible);
    for (let count = 0; Number.isFinite(time) && time <= segmentLast && count < 1200; count++) {
      candidates.set(time, {
        time,
        y: timelineTimeToY(map, time),
        label: formatTimelineTick(time, UNIT_MS[visible.unit] * visible.step),
      });
      const next = advance(time, visible);
      if (!(next > time)) break;
      time = next;
    }
  }
  const result: TimelineTick[] = [];
  for (const tick of [...candidates.values()].sort((a, b) => a.time - b.time)) {
    if (!result.length || (tick.y - result[result.length - 1].y) * scale >= 56) result.push(tick);
  }
  if (!result.length && !interval)
    result.push({ time: first, y: timelineTimeToY(map, first), label: formatTimelineTick(first, last - first || DAY) });
  return result;
}

/** Compatibility wrapper for callers that still supply a linear pixels-per-ms scale. */
export function getVisibleTimeTicks(
  start: number | null,
  end: number | null,
  pixelsPerMs: number,
  originY: number,
  top: number,
  bottom: number,
  scale: number,
): TimelineTick[] {
  if (
    start === null ||
    end === null ||
    ![start, end, pixelsPerMs, originY].every(Number.isFinite) ||
    pixelsPerMs <= 0 ||
    start > end
  )
    return [];
  const map = createTimelineAxis({
    start,
    end,
    originY,
    height: Math.max(1, (end - start) * pixelsPerMs),
    mode: "linear",
    timestamps: [],
  });
  return getTimelineAxisTicks(map, top, bottom, scale);
}

function automaticInterval(minimumStep: number): TimelineTickInterval {
  const choices: [TimelineTickUnit, number[]][] = [
    ["second", [1, 5, 15, 30]],
    ["minute", [1, 5, 15, 30]],
    ["hour", [1, 3, 6, 12]],
    ["day", [1, 2]],
    ["week", [1, 2]],
    ["month", [1, 3, 6]],
  ];
  for (const [unit, steps] of choices)
    for (const step of steps) if (step * UNIT_MS[unit] >= minimumStep) return { unit, step };
  const years = minimumStep / YEAR;
  const power = 10 ** Math.max(0, Math.floor(Math.log10(years)));
  return { unit: "year", step: ([1, 2, 5, 10].find((step) => step * power >= years) ?? 10) * power };
}

function alignedAtOrBefore(time: number, interval: TimelineTickInterval): number {
  const { step, unit } = interval;
  const date = new Date(time);
  if (unit === "month" || unit === "year") {
    const months = unit === "year" ? step * 12 : step;
    const aligned = Math.floor((date.getUTCFullYear() * 12 + date.getUTCMonth()) / months) * months;
    return calendarMonthStart(Math.floor(aligned / 12), aligned - Math.floor(aligned / 12) * 12);
  }
  // ISO weeks start on Monday. Other fixed-size units align with UTC midnight at the epoch.
  const origin = unit === "week" ? -3 * DAY : 0;
  const duration = step * UNIT_MS[unit];
  return origin + Math.floor((time - origin) / duration) * duration;
}

function advance(time: number, { step, unit }: TimelineTickInterval): number {
  if (unit === "month" || unit === "year") {
    const date = new Date(time);
    return calendarMonthStart(date.getUTCFullYear(), date.getUTCMonth() + step * (unit === "year" ? 12 : 1));
  }
  return time + step * UNIT_MS[unit];
}

function calendarMonthStart(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatTimelineTick(time: number, step: number): string {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return "Invalid time";
  if (step >= 365 * DAY) return formatTimelineYear(date.getUTCFullYear());
  if (step >= 28 * DAY) return formatTimelineDate(time, "month");
  if (step >= DAY) return formatTimelineDate(time, "date");
  const iso = date.toISOString();
  const clock = iso.split("T")[1].slice(0, step < 60_000 ? 8 : 5);
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${clock}`;
}

/** Numeric, origin-aligned ticks: no Date objects or duration conversion in this path. */
function getRelativeTicks(
  map: TimelineAxisMap,
  top: number,
  bottom: number,
  scale: number,
  clock: TimelineClock,
  step: number,
): TimelineTick[] {
  if (![top, bottom, scale, step].every(Number.isFinite) || bottom <= top || scale <= 0 || step <= 0) return [];
  const first = Math.max(map.start, timelineYToTime(map, top));
  const last = Math.min(map.end, timelineYToTime(map, bottom));
  if (first > last) return [];
  const candidates = new Map<number, TimelineTick>();
  const quantum = 10 ** -clock.precision;
  const base = Math.max(step, quantum);
  for (let i = 0; i < Math.max(1, map.knots.length - 1); i++) {
    const left = map.knots[i],
      right = map.knots[i + 1] ?? left;
    const lo = Math.max(first, left.time),
      hi = Math.min(last, right.time);
    if (lo > hi) continue;
    const pixels = right.time === left.time ? 1 : ((right.y - left.y) / (right.time - left.time)) * scale;
    const stride = Math.max(1, Math.ceil(88 / (pixels * base)), Math.ceil((hi - lo) / base / 1200));
    const spacing = base * stride;
    if (!Number.isFinite(spacing) || spacing <= 0) continue;
    const startIndex = Math.ceil(lo / spacing - 1e-10);
    for (let n = 0; n < 1200; n++) {
      const value = Number(((startIndex + n) * spacing).toPrecision(14));
      if (value > hi + spacing * 1e-10) break;
      if (value < first || value > last) continue;
      candidates.set(value, { time: value, y: timelineTimeToY(map, value), label: formatRelativeTime(value, clock) });
    }
  }
  const ticks: TimelineTick[] = [];
  for (const tick of [...candidates.values()].sort((a, b) => a.time - b.time)) {
    if (!ticks.length || (tick.y - ticks[ticks.length - 1].y) * scale >= 70) ticks.push(tick);
  }
  return ticks;
}
