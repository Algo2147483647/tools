import type { GraphDocument } from "../types";
import type { TimelineClock } from "./clock";
import { parseNodeTimeline,parseTimelineDate,parseTimelineTime } from "./time";

export function getTimelineReferenceTime(document: Pick<GraphDocument, "metadata"> | null): number | undefined {
  const metadata = document?.metadata?.timeline;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? parseTimelineDate((metadata as Record<string, unknown>).asOf)?.timestamp
    : undefined;
}

/** Imported invalid time remains inspectable; unrelated edits must preserve it. */
export function getTimelineEditError(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  referenceTime?: number,
  clock?: TimelineClock,
): string | null {
  if (JSON.stringify(previous?.time) !== JSON.stringify(next.time)) {
    const parsed = clock ? parseNodeTimeline(next, referenceTime, clock) : parseTimelineTime(next.time, referenceTime);
    if (parsed.status === "invalid") return parsed.message;
  }
  if (
    JSON.stringify(previous?.track) !== JSON.stringify(next.track) &&
    next.track !== undefined &&
    typeof next.track !== "string"
  )
    return "Event track must be a string.";
  return null;
}
