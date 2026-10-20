import type { SchemaField } from "./chartSchemas";

const field = (group: string, path: string, type: string, description: string, defaultValue?: string): SchemaField => ({
  group,
  path,
  type,
  requirement: "Optional",
  description,
  defaultValue,
});
const clock = (key: string, type: string, fallback: string, description: string) =>
  field("Clock", `metadata.timeline.clock.${key}`, type, description, fallback);
const relation = (key: string, type: string, description: string, fallback?: string) =>
  field("Time anchors", `edges[].metadata.timeline.${key}`, type, description, fallback);

export const TIMELINE_SCHEMA_FIELDS: SchemaField[] = [
  field(
    "Timeline",
    "metadata.timeline",
    "object",
    "Enables Timeline view. The enclosing document uses protocol version 3; diagram must be dag or omitted.",
  ),
  field(
    "Timeline",
    "metadata.timeline.timeZone",
    '"UTC"',
    "Calendar values are normalized to UTC. Relative values are never converted to dates.",
    '"UTC"',
  ),
  field(
    "Timeline",
    "metadata.timeline.asOf",
    "calendar date string",
    "Snapshot used as the end of calendar intervals whose end is null. Ignored for relative time.",
    "Current time",
  ),
  field(
    "Event time",
    "nodes[id].time",
    "{ at } | { start, end }",
    "Use exactly one form. Calendar values accept YYYY, YYYY-MM, YYYY-MM-DD, or an ISO timestamp with an explicit timezone. Relative values must be finite numbers. Missing or invalid time leaves the event unplaced.",
  ),
  field(
    "Event time",
    "nodes[id].time.at",
    "string | number",
    "Position of one instant. Must not coexist with start or end.",
  ),
  field(
    "Event time",
    "nodes[id].time.start",
    "string | number",
    "Inclusive start of a duration; required when using the duration form.",
  ),
  field(
    "Event time",
    "nodes[id].time.end",
    "string | number | null",
    "Inclusive end, no earlier than start. Calendar-only null means ongoing. Relative durations require an explicit finite end.",
  ),
  field(
    "Event time",
    "nodes[id].track",
    "string",
    "Track membership in Tracks layout. Independent of Type-based coloring.",
    '"Events"',
  ),
  field(
    "Event time",
    "nodes[id].space",
    "integer ≥ 1",
    "Fixed one-based row in horizontal orientation, or column in vertical orientation. Automatic placement and pins do not override this index.",
    "Automatic placement",
  ),
  clock(
    "mode",
    '"calendar" | "relative"',
    '"calendar"',
    "Selects string-based calendar time or numeric relative time for all events.",
  ),
  clock(
    "unit",
    '"unit" | "second" | "minute" | "hour" | "day" | "week" | "cycle"',
    '"unit"',
    "Relative display unit. unit is schematic; changing it does not rescale stored values.",
  ),
  clock("origin", "non-empty string", '"T0"', "Label for relative zero."),
  clock(
    "format",
    '"offset" | "elapsed"',
    '"offset"',
    "Displays relative values as signed offsets or elapsed values with the unit.",
  ),
  clock("precision", "integer, 0–12", "2", "Relative display decimal places; stored values remain unchanged."),
  relation(
    "kind",
    '"sequence" | "dependency" | "reference" | "rendezvous" | "part-of"',
    "Relationship semantics; does not replace source and target node IDs.",
    '"reference"',
  ),
  relation(
    "sourceAnchor",
    '"start" | "end"',
    "Source boundary when no valid sourceTime is supplied.",
    '"end" for dependency; otherwise "start"',
  ),
  relation("targetAnchor", '"start" | "end"', "Target boundary when no valid targetTime is supplied.", '"start"'),
  relation(
    "sourceTime",
    "calendar string | relative number",
    "Optional point within the source event, inclusive of its endpoints. Out-of-range values fall back to sourceAnchor with a warning.",
  ),
  relation(
    "targetTime",
    "calendar string | relative number",
    "Optional point within the target event, inclusive of its endpoints. Out-of-range values fall back to targetAnchor with a warning.",
  ),
];
