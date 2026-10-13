import { parseTimelineDate } from "./timeline";

export interface TimelineTimeRange {
  start?: number;
  end?: number;
}

export function parseTimelineRangeInput(
  from: string,
  to: string,
): { ok: true; range: TimelineTimeRange | null } | { ok: false; error: string } {
  const date = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? parseTimelineDate(value) : null);
  const start = from ? date(from)?.timestamp : undefined;
  const lastDay = to ? date(to)?.timestamp : undefined;
  if ((from && start === undefined) || (to && lastDay === undefined))
    return { ok: false, error: "Enter valid dates in YYYY-MM-DD format." };
  const end = lastDay === undefined ? undefined : lastDay + 86_400_000 - 1;
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
    from: range?.start === undefined ? "" : new Date(range.start).toISOString().slice(0, 10),
    to: range?.end === undefined ? "" : new Date(range.end).toISOString().slice(0, 10),
  };
}
