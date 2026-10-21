# Timeline view

Timeline is a fourth chart type, alongside Node-link, Sankey, and Nested node-link. Choose it in **Settings → Chart type**. Its appearance and spacing are remembered independently of the other chart types.

**Appearance → Presets** provides **Default** and **Preset 2**. Default uses 12 px interval bars, 4 px corners, and an adaptive axis. Preset 2 saves the compact horizontal style: direct connections, Type colors, 24 px interval bars, square corners, hidden time anchors, inside titles that follow interval colors, and italic Times New Roman. Both presets apply the complete style, including Timeline controls. **Reset current style** restores Default; style undo/redo restores the complete previous/next configuration. The portable snapshot is [`timeline-preset-2.style.json`](../public/presets/timeline-preset-2.style.json).

## Reading the timeline

- Time runs on one shared axis. **Settings → Layout → Timeline arrangement** selects Vertical (top to bottom) or Horizontal (left to right); text always stays upright. Calendar axes use UTC, while relative axes use native numeric values. **Settings → Layout** independently selects the arrangement (Tracks or Relation flow) and axis (Fixed interval or Adaptive).
- A point represents an instant; a thick rounded bar represents a duration. An ongoing bar has an open endpoint. Labels may move to avoid overlaps, with a leader back to the exact time anchor.
- Branches and merges come from actual graph edges. Sharing a track or occurring one after another does not create a relationship.
- Tracks group events in columns with compact subchannels. Relation flow arranges events by their connections; type and track never constrain horizontal position. Type colors identify categories without background regions. Drag a flow node across the time axis (horizontally in Vertical mode, vertically in Horizontal mode), or use Alt + Left/Right or Alt + Up/Down respectively, to pin it without changing its date. Layout can clear pins.
- Events without a usable time remain in an **Undated** area. Invalid imported dates produce warnings instead of silently disappearing.
- References and containment relationships are visually distinct from sequence, dependency, and rendezvous edges. Backward relationships keep their original direction.

Use **Time range**, **Track**, and **Type** in the toolbar to filter. The time-range popover accepts optional From and To dates in UTC; To includes the whole day. Apply validates the range before changing the view. Instants inside the range and intervals that overlap it remain visible. Crossing intervals have clipped endpoints, while their stored dates remain unchanged; undated events are hidden until the range is cleared. Filtering keeps only original edges whose endpoints remain visible; it never invents a connection across hidden events. **Show all events** resets all filters. Click an event to highlight its path, double-click to view or edit it, and use **Locate selected event** to center its label at a readable zoom. New timeline views open at a readable scale from the earliest time. The usual zoom, pan, Fit, and SVG export controls work; Fit gives an overview of the entire map.

## Native v3 document format

Timeline uses the existing graph document. `diagram` remains `dag` or `sankey`; switching the view never converts node or edge data. To open a document in Timeline automatically, declare:

```json
"metadata": {
  "timeline": { "timeZone": "UTC" }
}
```

An ordinary graph can be switched to Timeline without this hint. Nodes without time will be visible as undated events.

For a historical snapshot, optional `metadata.timeline.asOf` accepts a date or explicit-offset date-time. Ongoing bars extend to that saved reference time instead of today. Without it they extend to the time the view is built.

```json
{
  "format": "graph-studio",
  "version": 3,
  "title": "A mission",
  "metadata": { "timeline": { "timeZone": "UTC" } },
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
- **Relation flow**: continuous sequence/dependency chains share a horizontal position. Parallel branches reserve separate channels until they end; later branches can reuse those channels, and merges prefer the established main chain. Meetings, references and period membership do not fan out merely because they share a source. Overlapping durations and simultaneous markers remain separated. Categories do not own columns. A crossing is not a merge: only a shared graph node creates a join. Real edge directions and IDs are retained, including backward relationships.

Both arrangements keep time coordinates fixed and place labels independently after assigning marker channels. Tracks applies the same chain alignment inside each category column. **Horizontal spread** controls channel spacing, not offsets between events on one chain. In Relation flow, a manual pin aligns its compatible chain to that position; conflicting pins split the chain while retaining both explicit positions.

- **Fixed interval**: equal elapsed durations have equal distances. Set a positive integer interval with seconds, minutes, hours, days, weeks, months or years, or select Auto. Calendar months and years follow UTC boundaries; zoom may omit labels at whole multiples of the configured base interval.
- **Adaptive**: expand dense event dates and duration endpoints, compress sparse periods, and smooth local scale changes. All branches use the same strictly increasing, reversible mapping. Duration bars alone do not add density throughout their lifetimes. Screen lengths are not proportional to real durations. The live ruler, grid and SVG export use the same mapping.

Ordinary filters retain node positions and the axis. Time range clipping preserves stored dates. **Fit visible events** rebuilds from visible events; **Show all events** restores the full layout. **Lock time axis** retains its mapping across content edits; newly exposed dates extend its existing end segments. Layout/axis choices are browser preferences and can be exported in a separate style file. A graph links that file with `metadata.style`. Pins are local view state and do not carry into other documents. Documents without saved view settings default to Tracks and an adaptive axis.

In both layouts, simultaneous event markers and duration endpoints stay on the exact same time coordinate. Text is positioned independently and may move above or below its event, with straight leaders connecting it to the anchor. Leaders render beneath relationship lines and markers. Labels sit above rounded orthogonal relationship lines with translucent backgrounds; relationship routing ignores labels. **Horizontal spread** (Vertical spread in horizontal orientation) adjusts spacing from 0% to 300% while preserving time coordinates and pinned positions. At 0%, adjacent duration bars touch without an extra gutter; explicit skipped rows still keep their indices. **Layout → Connections → Routing** selects Direct for one straight segment between time anchors, or Avoid obstacles for routed connections.

## Relationships inside a period

An edge can set `metadata.timeline.sourceTime` or `targetTime` to a supported ISO time within the corresponding event interval. This overrides that endpoint's start/end anchor and creates a port on its bar. For example, a Sui-period edge to a 589 event uses `sourceTime: "0589"`, so it attaches at 589 rather than at the dynasty's beginning. These anchors contribute to adaptive density. An out-of-range anchor produces a warning and falls back to its declared start/end anchor. Edge metadata is preserved on import/save and can be edited in graph JSON.

## European history example

The **欧洲历史：分流与交汇** canvas within **Human History** follows the same point-first approach: 585 events, 13 qualified periods, 673 relationships and 81 categories, from the Aegean Bronze Age to 2026. Chinese explanations retain original-language proper names, including Greek and Cyrillic scripts. Six period guides, a name concordance, detailed catalogs and a source index accompany the canvas. Period endpoints join dated events, while staged changes such as the 1989 border opening / 1990 German unification and treaty signature / entry into force remain distinct. See [Example workspaces](examples.md) for its reproducible generation commands.

## Chinese history example

The pre-Eastern-Zhou supplement starts with Erlitou archaeology and continues through Shang and Western Zhou to the existing eastward-migration node. It separates archaeological sites from polity categories, labels approximate dates and evidence types, and includes regional centers and the Western Zhou background of later states. Its narrative, catalog and source notes are `notes/pre-zhou.md`, `notes/pre-zhou-catalog.md` and `notes/pre-zhou-sources.md`. Stone Age surveys and a Xia royal chronology are outside this selection.

To reduce overlapping duration bars, 26 Western Zhou topics and seven Spring and Autumn / Warring States entries use point markers. Original spans remain in `historicalRange` and the details; approximate markers do not turn uncertain dates or extended activities into exact single-year events. Dynasty, state and major period ranges remain visible. Relations from converted points no longer use interior range anchors.

Open **Human History** in the example gallery and select **中国历史：分流与交汇**. Its 1273 events and periods and 2322 named relationships span c. 1750 BCE–2026 CE, with source links, 109 polity or archaeological-site categories, six topic guides, and explicit joins. The modern selection includes political campaigns, human rights, economic reform, public health, science, and diplomacy; disputed findings retain source attribution. The modern-event cutoff is October 14, 2026; ancient-history supplements were added on October 15. The Spring and Autumn through early Han supplement adds 124 nodes. The Emperor Wu through Three Kingdoms supplement adds 143 point events and revises 12 existing accounts, with a narrative guide, chronological catalog, and source notes; existing dynasty ranges remain unchanged. It distinguishes accession, imperial titles, campaigns, and unification, including Wu's 221/222/229 milestones and Jin's 265/280 transitions. The Jin through Sui supplement adds 154 point events and revises 10 existing accounts, covering the parallel Sixteen Kingdoms, Northern and Southern dynasties, institutions, knowledge, and Sui campaigns and canals through 618. The Sui–Tang through Southern Song supplement adds 209 point events and revises 13 existing accounts, distinguishing parallel Five Dynasties and Ten Kingdoms, Song–Liao–Xia–Jin relations, institutions and knowledge, and the separate 1273, 1276, and 1279 stages of the Southern Song collapse. The Yuan through Qing supplement adds 236 point events and revises 13 existing accounts through the 1912 abdication, with separate Yuan collapse, Ming succession, Southern Ming and Zheng, Qing institutions, frontier warfare, publishing, industrial education, and late Qing constitutional milestones. It preserves all earlier dates and period bars and distinguishes edition dates from composition, and initial reforms from later implementation. It defaults to Relation flow with an adaptive axis. The example documents and source notes are in `public/examples/china-history/`.

## Relative time and interval bars

The document protocol (`metadata.timeline.clock`) determines Calendar or Relative time, its unit, zero-point name, format and precision. These are not menu settings. Events from the other basis stay in the unplaced region with a warning until edited. Unit changes relabel the numeric coordinate system without rescaling values.

Relative values are numbers in the declared unit, never timestamps or dates. `unit` means schematic units and `cycle` means schematic cycles; neither implies seconds, hours or any other elapsed duration. Actual-duration units are `second`, `minute`, `hour`, `day`, and `week`. Zero, negative values, decimals, and zero-length intervals are valid. A relative interval needs an explicit numeric end; it never extends to the computer's current date.

```json
{
  "format": "graph-studio",
  "version": 3,
  "metadata": {
    "timeline": {
      "clock": { "mode": "relative", "unit": "minute", "origin": "领取", "format": "elapsed", "precision": 2 }
    }
  },
  "nodes": {
    "prepare": { "title": "准备", "time": { "at": -2.5 } },
    "window": { "title": "参与窗口", "time": { "start": 0, "end": 30 }, "status": "active" }
  },
  "edges": [{ "id": "prepare-window", "source": "prepare", "target": "window" }]
}
```

The zero-point `origin` defaults to `T0` and can be named “活动开始” or “领取”. `format: "offset"` produces `T0`, `T+2`, `T−0.5`; `format: "elapsed"` produces `领取后 30 分钟`. `precision` sets the maximum displayed decimal places (0–12); it never rounds stored values. The style-file setting `style.timeline.relativeTickStep` defines positive decimal tick steps in the declared unit. At smaller zooms, the ruler skips whole multiples of that step; display precision also prevents indistinguishable tick labels. Both linear and adaptive axes support relative time. Adaptive spacing remains explicitly non-proportional.

The time-range filter uses inclusive numeric From/To bounds in relative mode. Node editing also uses numeric values. Optional edge `sourceTime` / `targetTime` anchors are numeric in a relative document, and strings in a calendar document. SVG and offline HTML use the same direction, clock labels, interval titles and styles as the canvas; HTML details identify the relative unit.

**Settings → Appearance → Nodes → Interval bars** controls:

- **Interval bar width**: the short dimension in pixels (height in horizontal mode, width in vertical mode). The default is 36 px. The slider spans 0–240; the numeric field accepts values beyond that range. Changing it reserves room across the time axis without changing any time coordinate.
- **Fill style**: Soft, Solid or Outline.
- **Border and corner radius**: outline style, stroke width/color, and bar rounding.

**Appearance → Text → Interval text** controls:

- **Title placement**: Outside (title and time), Inside (title only), or Hidden. Inside titles never include time or node details; short bars clip text within their true duration instead of extending the bar.
- **Title alignment**: start/center/end maps to Left/Center/Right horizontally and Top/Center/Bottom vertically.
- **Font color**: Match interval follows the current Type or Track color automatically; Theme uses the theme text color; Custom selects an independent title color.

**Appearance → Text → Italic title** controls slanted titles for both points and intervals.
**Appearance → Nodes → Point events** configures marker visibility, shape, size, fill and border.
**Appearance → Text → Point text** configures point title color and time-label visibility/color. Node descriptions also belong to Text.
**Appearance → Edges → Time anchors** configures interval endpoints and interior connection markers independently, plus the line that links a label to its exact time.
Each appearance group's reset affects only its own settings and supports Undo/Redo. Connection routing remains under **Layout → Connections**.
Changing these styles never changes the stored event times or connection anchors. Clipped and ongoing endpoints retain their open-ended indicator.

Layout and appearance belong to a separate **graph-studio-style** file. Export it from **Appearance → Configuration → Export style**, save it alongside the graph, and set only `"metadata": { "style": "timeline.style.json" }` in the graph. Opening the workspace resolves the reference relative to the graph file and applies the style automatically. Opening just the graph file cannot access sibling files; import the style manually or open its workspace. Missing or invalid style files produce a notice while the graph stays usable.

The style file stores timeline controls under `style.timeline`, including routing, direction, spacing, colors and interval appearance. Timeline metadata only accepts `timeZone`, `asOf` and `clock`. Nested `version` and inline `view` fields are rejected. **Appearance → Nodes → Event colors → Type** uses the same category palette and light fills as Node-link; Type names come from the graph.

## Explicit rows and columns

Set `nodes[id].space` to a positive integer starting at **1**. It is the row number for a horizontal timeline, or the column number for a vertical timeline. It is not a pixel coordinate.

```json
"nodes": {
  "a": { "title": "Activity", "time": { "start": 0, "end": 30 }, "space": 1 },
  "b": { "title": "Review", "time": { "start": 5, "end": 12 }, "space": 3 }
}
```

Row/column 1 starts next to the time ruler. The layout's spread, node gap and interval bar width determine the physical distance between rows, shared across tracks. Changing that spacing moves the grid while preserving each node's assigned index. Skipped indices are not compacted; equal indices remain on the same row even when intervals overlap.

This applies to Tracks and Relation flow, calendar and relative clocks, points, intervals and undated nodes. Protocol rows take precedence over temporary view pins and survive filtering, fitting and rebuilding. Only unspecified nodes are automatically arranged; labels and edge routes may avoid collisions without changing the fixed row. Dragging and keyboard pinning are disabled for fixed nodes; edit `space` to move them. Saved JSON retains the indices; SVG and HTML use the resulting geometry.
