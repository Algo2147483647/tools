import { parseTimelineDate } from "./timeline";

export interface TimelineTimeRange {
  start?: number;
  end?: number;
}

export function parseTimelineRangeInput(
  from: string,
  to: string,
): { ok: true; range: TimelineTimeRange | null } | { ok: false; error: string } {
  const date = (value: string) =>
    /^(?:[+-]\d{6}|\d{4})(?:-\d{2}(?:-\d{2})?)?$/.test(value) ? parseTimelineDate(value) : null;
  const start = from ? date(from)?.timestamp : undefined;
  const lastDay = to ? date(to)?.timestamp : undefined;
  if ((from && start === undefined) || (to && lastDay === undefined))
    return { ok: false, error: "Enter a valid year, YYYY-MM or YYYY-MM-DD (BCE uses ISO years, e.g. -000220)." };
  const next = lastDay === undefined ? null : new Date(lastDay);
  if (next) {
    const precision = date(to)!.precision;
    if (precision === "year") next.setUTCFullYear(next.getUTCFullYear() + 1);
    else if (precision === "month") next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCDate(next.getUTCDate() + 1);
  }
  const end = next ? next.getTime() - 1 : undefined;
  if (end !== undefined && !Number.isFinite(end))
    return { ok: false, error: "Date range exceeds the supported calendar." };
  if (start !== undefined && end !== undefined && start > end)
    return { ok: false, error: "From must be on or before To." };
  return {
    ok: true,
    range:
      start === undefined && end === undefined
        ? null
        : {
            ...(start === undefined ? {} : { start }),
            ...(end === undefined ? {} : { end }),
          },
  };
}

export function timelineRangeDates(range: TimelineTimeRange | null): { from: string; to: string } {
  return {
    from: range?.start === undefined ? "" : new Date(range.start).toISOString().split("T")[0],
    to: range?.end === undefined ? "" : new Date(range.end).toISOString().split("T")[0],
  };
}
