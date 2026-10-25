# Timeline

Timeline positions instants and durations along a shared time axis. The chart ID is `timeline`. Calendar and numeric relative time are supported, independently of vertical/horizontal orientation and Tracks/Relation flow arrangement.

Use Timeline when the time of an event carries meaning. Relationships remain explicit graph edges; chronological order or a shared track never creates an edge automatically.

## Calendar document example

```json
{
  "format": "graph-studio",
  "version": 3,
  "metadata": {
    "timeline": { "timeZone": "UTC", "asOf": "2026-10-24" }
  },
  "nodes": {
    "kickoff": { "title": "Kickoff", "time": { "at": "2026-05-01" }, "track": "Delivery" },
    "build": {
      "title": "Build",
      "time": { "start": "2026-05-02", "end": "2026-05-10" },
      "track": "Delivery",
      "type": "Phase"
    },
    "support": { "title": "Support", "time": { "start": "2026-05-11", "end": null } }
  },
  "edges": [
    {
      "id": "kickoff-build",
      "source": "kickoff",
      "target": "build",
      "metadata": { "timeline": { "kind": "sequence" } }
    },
    {
      "id": "build-support",
      "source": "build",
      "target": "support",
      "metadata": { "timeline": { "kind": "dependency" } }
    }
  ]
}
```

The document uses the [shared v3 protocol](../chart-types.md). Omit `diagram` or use `"dag"` for an ordinary timeline. `diagram: "timeline"` is invalid. An object at `metadata.timeline`, including `{}`, supplies the initial-view hint.

## Event and clock protocol

| Path                           | Accepted value                                             | Meaning/default                                                                                                     |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `metadata.timeline.timeZone`   | `"UTC"`                                                    | Calendar normalization; defaults to UTC.                                                                            |
| `metadata.timeline.asOf`       | Calendar string                                            | Snapshot endpoint for ongoing calendar intervals. Otherwise a reference time is captured when opening the document. |
| `metadata.timeline.clock.mode` | `"calendar"`, `"relative"`                                 | Calendar by default; provide `mode` when supplying a clock object.                                                  |
| `clock.unit`                   | `unit`, `second`, `minute`, `hour`, `day`, `week`, `cycle` | Relative display unit; default `unit`. Does not rescale stored numbers.                                             |
| `clock.origin`                 | Nonempty string                                            | Relative zero label; default `T0`.                                                                                  |
| `clock.format`                 | `"offset"`, `"elapsed"`                                    | Relative display format; default `offset`.                                                                          |
| `clock.precision`              | Integer 0-12                                               | Relative decimal display precision; default 2.                                                                      |
| `nodes[id].time`               | `{ at }` or `{ start, end }`                               | Use exactly one form.                                                                                               |
| `time.at`                      | Calendar string or relative finite number                  | Instant. Must not coexist with interval fields.                                                                     |
| `time.start`, `time.end`       | Calendar strings or relative finite numbers                | End must not precede start. Calendar `end: null` means ongoing.                                                     |
| `nodes[id].track`              | String                                                     | Track name; blank/missing falls back to `Events`.                                                                   |
| `nodes[id].space`              | Positive integer                                           | Fixed one-based row in horizontal orientation or column in vertical orientation.                                    |

Paths beginning with `clock` above are relative to `metadata.timeline.clock`. Timeline metadata accepts `timeZone`, `asOf`, and `clock`; inline `view` and nested `version` fields are rejected. Put portable appearance in a separate style file.

Calendar strings accept year, year-month, date, or ISO timestamp with an explicit timezone, such as `2026`, `2026-05`, `2026-05-02`, or `2026-05-02T10:30:00+08:00`. Impossible dates and timezone-free date-times are invalid. Original precision and source strings are retained. Signed six-digit astronomical years support BCE; for example, `-000220` represents 221 BCE and `0000` represents 1 BCE.

Relative time uses finite numbers in the document's declared unit. Negative and fractional offsets are allowed. Relative intervals require explicit ends; `end: null` and `asOf` do not provide a relative ongoing interval.

Missing or invalid imported time remains inspectable in the undated region with warnings. The graph importer deliberately tolerates malformed event-time evidence, although the JSON Schema describes valid forms and edits to time fields are validated before commit. Time values from the wrong clock basis are not silently converted.

## Relative document example

```json
{
  "format": "graph-studio",
  "version": 3,
  "metadata": {
    "timeline": {
      "clock": { "mode": "relative", "unit": "minute", "origin": "Start", "format": "elapsed", "precision": 1 }
    }
  },
  "nodes": {
    "warmup": { "title": "Warm-up", "time": { "start": -5, "end": 0 }, "space": 1 },
    "run": { "title": "Run", "time": { "start": 0, "end": 12.5 }, "space": 1 },
    "review": { "title": "Review", "time": { "at": 10 }, "space": 3 }
  },
  "edges": [
    { "id": "warmup-run", "source": "warmup", "target": "run", "metadata": { "timeline": { "kind": "dependency" } } },
    { "id": "run-review", "source": "run", "target": "review", "metadata": { "timeline": { "sourceTime": 10 } } }
  ]
}
```

Skipped `space` indices are preserved. Equal indices stay on the same row/column even if intervals overlap. Explicit indices take precedence over temporary pins; the layout cannot move them to resolve overlap.

## Relationship time anchors

All fields below live in `edges[].metadata.timeline`:

| Field          | Values                                                         | Default/behavior                                                     |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `kind`         | `sequence`, `dependency`, `reference`, `rendezvous`, `part-of` | `reference`. Describes relationship semantics.                       |
| `sourceAnchor` | `start`, `end`                                                 | `end` for dependency, otherwise `start`.                             |
| `targetAnchor` | `start`, `end`                                                 | `start`.                                                             |
| `sourceTime`   | Calendar string or relative number                             | Explicit attachment within the source interval, including endpoints. |
| `targetTime`   | Calendar string or relative number                             | Explicit attachment within the target interval, including endpoints. |

A valid explicit time overrides the corresponding boundary anchor. Out-of-range attachment times produce warnings and fall back to the boundary. Source and target IDs, direction, and relation values remain unchanged. Backward relationships are retained. Reference and part-of edges use distinct styling.

## Arrangement and axis modes

| Setting     | Mode                    | Meaning                                                                                                                              |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Arrangement | Tracks                  | Groups by track and allocates channels for overlapping events.                                                                       |
| Arrangement | Relation flow           | Aligns connected chains and branches; categories do not own fixed columns.                                                           |
| Orientation | Vertical                | Time increases downward.                                                                                                             |
| Orientation | Horizontal              | Time increases rightward; text remains upright.                                                                                      |
| Axis        | Linear / Fixed interval | Equal elapsed time has equal distance. Calendar months/years follow calendar boundaries.                                             |
| Axis        | Adaptive                | Expands dense events and compresses sparse periods using one monotonic mapping. Screen lengths are not proportional to elapsed time. |
| Routing     | Avoid obstacles         | Routes relationships around event geometry.                                                                                          |
| Routing     | Direct                  | Connects time anchors with a straight segment.                                                                                       |

Labels can move independently to avoid overlap; leaders connect them back to exact times. Interval thickness changes room across the time axis, never the stored duration. Manual flow pins also move events across the time axis without editing their times.

Time range filters preserve events inside or intersecting the range, clip displayed durations, and keep original dates. Calendar upper bounds include the supplied period; relative bounds are inclusive numbers. Undated events are hidden by an active time range. Track/Type filters retain original edges between visible endpoints without bridging hidden events.

## AI Layout result

AI receives graph meaning, dates, measured event and label dimensions, current geometry and quality. It returns the same chart-specific **Schema Layout** shown in the Layout tab: complete event positions, label anchors and connection routes using `[x,y]` tuples in physical canvas pixels. Dates, durations, axis mapping and pins remain fixed. The harness renders supplied coordinates directly, without invoking the local placement or routing solver.

The model evaluates results, receives measured quality and validation feedback, then selects a successful candidate with an explanation. The live layout changes only after selection. Cancellation or invalid output preserves the current arrangement. There is no fixed iteration limit. The completed response transcript and before/after metrics remain visible.

## Style and persistence

See [Timeline appearance](../appearance/timeline.md) for visual settings. Graph JSON preserves dates, tracks and business data. `metadata.style` associates an independent Appearance JSON, updated by **Update current appearance** beside the title.

`metadata.layout` associates a `graph-studio-layout-settings` version 1 file. **Update current layout** saves only mode and view configuration: layout, orientation, edge routing, axis mode, tick settings and compactness. It never saves exact positions, labels, routes, plans, ordering, pins or viewport scope. Existing associations are overwritten; first use creates a sibling JSON file. Save the graph to retain a new association.

On reopen, the graph is arranged using these settings. AI geometry is transient and is not restored or regenerated by a network request. The Schema tab describes AI rendering results, independently of this settings file; see [Layout protocols](../layout-schema.md).
