export type TimelinePrecision = "date" | "datetime";
export type TimelineRelationKind = "sequence" | "dependency" | "reference" | "rendezvous" | "part-of";

export interface DatedTimelineTime {
  status: "dated";
  kind: "instant" | "range";
  start: number;
  end: number;
  ongoing: boolean;
  precision: TimelinePrecision;
  label: string;
}

export interface UndatedTimelineTime {
  status: "missing" | "invalid";
  kind: "undated";
  message: string;
  label: string;
}

export type ParsedTimelineTime = DatedTimelineTime | UndatedTimelineTime;

/** Dates mean a UTC calendar day; clock times must explicitly identify their offset. */
export function parseTimelineDate(value: unknown): { timestamp: number; precision: TimelinePrecision } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
    value,
  );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, offsetText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  const second = Number(secondText || 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59)
    return null;
  let offsetMinutes = 0;
  if (offsetText && offsetText !== "Z") {
    const hours = Number(offsetText.slice(1, 3));
    const minutes = Number(offsetText.slice(4, 6));
    if (hours > 23 || minutes > 59) return null;
    offsetMinutes = (hours * 60 + minutes) * (offsetText[0] === "+" ? 1 : -1);
  }
  // setUTCFullYear deliberately avoids Date.UTC's special interpretation of years 00–99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number((fractionText || "").padEnd(3, "0").slice(0, 3)));
  return {
    timestamp: date.getTime() - offsetMinutes * 60_000,
    precision: hourText === undefined ? "date" : "datetime",
  };
}

export function parseTimelineTime(value: unknown, now = Date.now()): ParsedTimelineTime {
  if (value === undefined)
    return { status: "missing", kind: "undated", message: "No event time is set.", label: "Undated" };
  const invalid = (message: string): UndatedTimelineTime => ({
    status: "invalid",
    kind: "undated",
    message,
    label: "Invalid time",
  });
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("Time must be an object with at, or start and end.");
  const time = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(time, "at")) {
    if (Object.prototype.hasOwnProperty.call(time, "start") || Object.prototype.hasOwnProperty.call(time, "end"))
      return invalid("Use either at or start/end, never both.");
    const parsed = parseTimelineDate(time.at);
    if (!parsed) return invalid("at must be a valid YYYY-MM-DD date or ISO date-time with an explicit timezone.");
    return {
      status: "dated",
      kind: "instant",
      start: parsed.timestamp,
      end: parsed.timestamp,
      ongoing: false,
      precision: parsed.precision,
      label: formatInputDate(time.at as string),
    };
  }
  const start = parseTimelineDate(time.start);
  if (!start) return invalid("start must be a valid YYYY-MM-DD date or ISO date-time with an explicit timezone.");
  const ongoing = time.end === null;
  const end = ongoing ? { timestamp: now, precision: start.precision } : parseTimelineDate(time.end);
  if (!end || !Number.isFinite(end.timestamp))
    return invalid("end must be a valid date/date-time, or null for an ongoing event.");
  if (end.timestamp < start.timestamp)
    return invalid(
      ongoing ? "An ongoing event cannot start in the future." : "Event end cannot be earlier than its start.",
    );
  return {
    status: "dated",
    kind: "range",
    start: start.timestamp,
    end: end.timestamp,
    ongoing,
    precision: start.precision === "datetime" || end.precision === "datetime" ? "datetime" : "date",
    label: `${formatInputDate(time.start as string)} → ${ongoing ? "ongoing" : formatInputDate(time.end as string)}`,
  };
}

export function parseNodeTimeline(node: Record<string, unknown>, now = Date.now()): ParsedTimelineTime {
  return parseTimelineTime(node.time, now);
}

/** Missing time is permitted; only a supplied malformed value blocks editing. */
export function validateTimelineTime(value: unknown): string | null {
  const parsed = parseTimelineTime(value);
  return parsed.status === "invalid" ? parsed.message : null;
}

export function getTimelineRelation(metadata?: Record<string, unknown>): {
  kind: TimelineRelationKind;
  sourceAnchor: "start" | "end";
  targetAnchor: "start" | "end";
} {
  const value = metadata?.timeline;
  const timeline =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const kinds: readonly string[] = ["sequence", "dependency", "reference", "rendezvous", "part-of"];
  const kind =
    typeof timeline.kind === "string" && kinds.includes(timeline.kind)
      ? (timeline.kind as TimelineRelationKind)
      : "reference";
  return {
    kind,
    sourceAnchor:
      timeline.sourceAnchor === "start" || timeline.sourceAnchor === "end"
        ? timeline.sourceAnchor
        : kind === "dependency"
          ? "end"
          : "start",
    targetAnchor: timeline.targetAnchor === "end" ? "end" : "start",
  };
}

function formatInputDate(value: string): string {
  return value.replace("T", " ").replace(/Z$/, " UTC");
}
