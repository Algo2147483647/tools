# Timeline view

Timeline is a fourth chart type, alongside Node-link, Sankey, and Nested node-link. Choose it in **Settings → Chart type**. Its appearance and spacing are remembered independently of the other chart types.

## Reading the timeline

- Time runs downward on one shared UTC axis. **Settings → Layout** independently selects the arrangement (Tracks or Relation flow) and axis (Fixed interval or Adaptive).
- A point represents an instant; a thick rounded bar represents a duration. An ongoing bar has an open endpoint. Labels may move to avoid overlaps, with a leader back to the exact time anchor.
- Branches and merges come from actual graph edges. Sharing a track or occurring one after another does not create a relationship.
- Tracks group events in columns with compact subchannels. Relation flow arranges events by their connections; type and track never constrain horizontal position. Type colors identify categories without background regions. Drag a flow node horizontally, or use Alt + Left/Right, to pin it without changing its date. Layout can clear pins.
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

Strings can use `YYYY`, `YYYY-MM` or `YYYY-MM-DD` and retain their original precision. BCE uses signed six-digit ISO astronomical years: 221 BCE is `-000220`, 1 BCE is `0000`. Display labels use historical BCE notation without a year zero. Date-time strings require an explicit `Z` or numeric offset (`+08:00`); local clock times without an offset are rejected. Calendar validation rejects impossible dates. Node details retain the entered date or offset while the axis displays UTC. Time-range inputs also accept years and months; To includes the entire supplied period.

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

## Layout and axis

In **Settings → Layout**, choose the arrangement independently of the time axis:

- **Tracks**: named columns with compact subchannels for overlapping markers and durations. Labels share a text column and move vertically to avoid collisions; duration bars do not reserve a full text column each.
- **Relation flow**: free horizontal branches and joins. Categories do not attract nodes or own columns. A crossing is not a merge: only a shared graph node creates a join. Real edge directions and IDs are retained, including backward relationships.
- **Fixed interval**: equal elapsed durations have equal distances. Set a positive integer interval with seconds, minutes, hours, days, weeks, months or years, or select Auto. Calendar months and years follow UTC boundaries; zoom may omit labels at whole multiples of the configured base interval.
- **Adaptive**: expand dense event dates and duration endpoints, compress sparse periods, and smooth local scale changes. All branches use the same strictly increasing, reversible mapping. Duration bars alone do not add density throughout their lifetimes. Screen lengths are not proportional to real durations. The live ruler, grid and SVG export use the same mapping.

Ordinary filters retain node positions and the axis. Time range clipping preserves stored dates. **Fit visible events** rebuilds from visible events; **Show all events** restores the full layout. **Lock time axis** retains its mapping across content edits; newly exposed dates extend its existing end segments. Layout/axis choices are browser preferences; document `metadata.timeline.view` supplies initial defaults, e.g. `{ "layout": "flow", "axis": "adaptive", "compactness": 0.5 }`. Pins are local view state and do not carry into other documents. Existing documents default to Tracks and a linear axis; legacy draft `cluster` settings migrate to Relation flow.

In both layouts, simultaneous event markers and duration endpoints stay on the exact same time coordinate. Text is positioned independently and may move above or below its event, with straight leaders connecting it to the anchor. Leaders render beneath relationship lines and markers. Labels sit above rounded orthogonal relationship lines with translucent backgrounds; relationship routing ignores labels. **Horizontal spread** adjusts event spacing in either layout from 50% to 300%, while preserving time coordinates and pinned marker positions. Text retains enough room to remain readable at the narrower settings.

## Relationships inside a period

An edge can set `metadata.timeline.sourceTime` or `targetTime` to a supported ISO time within the corresponding event interval. This overrides that endpoint's start/end anchor and creates a port on its bar. For example, a Sui-period edge to a 589 event uses `sourceTime: "0589"`, so it attaches at 589 rather than at the dynasty's beginning. These anchors contribute to adaptive density. An out-of-range anchor produces a warning and falls back to its declared start/end anchor. Edge metadata is preserved on import/save and can be edited in graph JSON.

## Chinese history example

Open **中国历史：分流与交汇** in the example gallery. Its 341 events and periods and 441 named relationships span 770 BCE–2026 CE, with source links, 65 polity categories, six topic guides, and explicit joins. The modern selection includes political campaigns, human rights, economic reform, public health, science, and diplomacy; disputed findings retain source attribution. Sources were checked through October 14, 2026. It defaults to Relation flow with an adaptive axis. The example documents and source notes are in `public/examples/china-history/`.
