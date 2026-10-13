# Timeline view

Timeline is a fourth chart type, alongside Node-link, Sankey, and Nested node-link. Choose it in **Settings → Chart type**. Its appearance and spacing are remembered independently of the other chart types.

## Reading the timeline

- Time runs downward on one linear UTC axis. Equal time intervals occupy equal distances, including long empty periods. Zooming preserves this relationship.
- A point represents an instant; a thick rounded bar represents a duration. An ongoing bar has an open endpoint. Labels may move to avoid overlaps, with a leader back to the exact time anchor.
- Branches and merges come from actual graph edges. Sharing a track or occurring one after another does not create a relationship.
- A named track groups related events; overlapping events can occupy adjacent subtracks. Nodes without a track receive automatic lanes.
- Events without a usable time remain in an **Undated** area. Invalid imported dates produce warnings instead of silently disappearing.
- References and containment relationships are visually distinct from sequence, dependency, and rendezvous edges. Backward relationships keep their original direction.

Use **Time range**, **Track**, and **Type** in the toolbar to filter. The time-range popover accepts optional From and To dates in UTC; To includes the whole day. Apply validates the range before changing the view. Instants inside the range and intervals that overlap it remain visible. Crossing intervals have clipped endpoints, while their stored dates remain unchanged; undated events are hidden until the range is cleared. Filtering keeps only original edges whose endpoints remain visible; it never invents a connection across hidden events. **Show all events** resets all filters. Click an event to highlight its path, double-click to view or edit it, and use **Locate selected event** to center its label at a readable zoom. New timeline views open at a readable scale from the earliest time. The usual zoom, pan, Fit, and SVG export controls work; Fit gives an overview of the entire map.

## Native v3 document format

Timeline uses the existing graph document. `diagram` remains `dag` or `sankey`; switching the view never converts node or edge data. To open a document in Timeline automatically, declare:

```json
"metadata": {
  "timeline": { "version": 1, "timeZone": "UTC" }
}
```

An ordinary graph can be switched to Timeline without this hint. Nodes without time will be visible as undated events.

For a historical snapshot, optional `metadata.timeline.asOf` accepts a date or explicit-offset date-time. Ongoing bars extend to that saved reference time instead of today. Without it they extend to the time the view is built.

```json
{
  "format": "graph-studio",
  "version": 3,
  "title": "A mission",
  "metadata": { "timeline": { "version": 1, "timeZone": "UTC" } },
  "nodes": {
    "launch": {
      "title": "Launch",
      "time": { "at": "1969-07-16T13:32:00Z" },
      "track": "Mission"
    },
    "flight": {
      "title": "Flight",
      "time": { "start": "1969-07-16T13:32:00Z", "end": "1969-07-24T16:50:35Z" },
      "track": "Mission"
    }
  },
  "edges": [
    {
      "id": "launch-flight",
      "source": "launch",
      "target": "flight",
      "value": "begins",
      "metadata": { "timeline": { "kind": "sequence", "sourceAnchor": "start", "targetAnchor": "start" } }
    }
  ]
}
```

`time` accepts either `{ "at": "…" }` or `{ "start": "…", "end": "…" }`. Set `end` to `null` explicitly for an ongoing interval. A missing `time` is allowed. End must not precede start, and an ongoing interval cannot begin in the future.

Date-only strings use `YYYY-MM-DD` and retain day precision. Date-time strings require an explicit `Z` or numeric offset (`+08:00`); local clock times without an offset are rejected. Calendar validation rejects impossible dates rather than rolling them into the next month. Node details retain the entered date or offset while the axis displays UTC.

Optional edge `metadata.timeline` properties:

| Property       | Values                                                         | Default                                 |
| -------------- | -------------------------------------------------------------- | --------------------------------------- |
| `kind`         | `sequence`, `dependency`, `reference`, `rendezvous`, `part-of` | `reference`                             |
| `sourceAnchor` | `start`, `end`                                                 | `end` for dependency; otherwise `start` |
| `targetAnchor` | `start`, `end`                                                 | `start`                                 |

These properties describe routing and presentation. Edges retain their original source, target, ID, and relation value.

## Editing and persistence

The node editor includes **Event time & track** in Timeline and for nodes that already carry time. Choose Undated, Instant event, Time interval, or Ongoing event, then enter the dates and optional track. Field and Raw JSON editors stay synchronized. Save validates the time and uses the ordinary graph transaction, so Undo, Redo, dirty tracking, JSON save, and workspace editing keep working.

The JSON schema documents valid event-time data. Opening a document remains tolerant of malformed time fields so they can be inspected and corrected in the undated area. Editing a time through graph commands validates newly supplied dates; unrelated edits do not remove imported evidence.

The first version uses a real linear axis with time-range, track, and type filters. It does not fold empty time or drag events to reschedule them. Dense histories can be explored through the supplied topic documents, filters, and zooming.
