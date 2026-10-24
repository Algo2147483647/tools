import type { TimelineEntry } from "./input-types";
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  const aTime = a.time.status === "dated" ? a.time.start : Infinity;
  const bTime = b.time.status === "dated" ? b.time.start : Infinity;
  return aTime - bTime || compareKeys(a.key, b.key);
}
