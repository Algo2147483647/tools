# Layout protocol

`metadata.layout` is a relative path to a separate JSON file. Layout changes apply to the current session. **Update current layout**, on the right of the Layout title, saves the current settings and complete rendering. A first update creates `<graph-name>.<chartType>.layout.json` in the graph's directory and binds the reference; subsequent updates overwrite the referenced file. New references are persisted with the normal graph Save operation, just like Appearance. Local workspaces and the local example server support direct writes without a file picker.

```json
{
  "format": "graph-studio-layout",
  "version": 2,
  "chartType": "compound",
  "layout": {
    "settings": {
      "version": 1,
      "method": "automatic",
      "direction": "AUTO",
      "objective": "readability",
      "portMode": "distributed",
      "constraints": []
    }
  }
}
```

This is a configuration-only example. The Schema tab's **Current JSON** contains the actual complete rendering; Update always includes it when a graph is visible. Version 1 configuration files are upgraded in memory and written as version 2 on Update.

Each file describes exactly one `chartType`; its Schema tab contains only fields relevant to that type. `layout` contains:

| Field                 | Content                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `scope`               | Selection/type filter plus only the selected chart’s scope: nested focus/collapsed groups, timeline track/date filters, or spatial camera |
| `settings`            | Only this chart’s layout settings. Timeline adds `view` with resolved timeline controls, orientation, mapping options and pins            |
| `graphFingerprint`    | Stable identity of graph content, excluding the style/layout file associations                                                            |
| `settingsFingerprint` | Identity of the chart's configuration and current scope                                                                                   |
| `geometry`            | Complete rendering payload, with absolute canvas coordinates in pixels                                                                    |

Geometry includes node positions and dimensions, measured text layouts, event label positions and time anchors/ports, expanded group bounds, edge waypoints and SVG paths, edge labels, Sankey bands, lanes, canvas bounds, spatial guides and projected positions. Timeline geometry includes axis mapping, tick positions, track bounds and the canonical stage for horizontal filtering. Nested geometry also includes the exact solver boxes/routes so subsequent AI evaluations see the rendered arrangement.

The Fields table expands arrays and objects into their child fields, including optional fields absent from the current graph. `[]` means each array item; `[id]` means each entry in an ID-keyed map. The Current column summarizes values across matching entries; Current JSON retains every value in full.

| Node field under `layout.geometry.nodes[]`                    | Meaning                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `key`                                                         | Graph node ID, or the group ID for a collapsed summary                                   |
| `x`, `y`                                                      | Node center in canvas pixels; timeline nodes use their time anchor and cross-axis center |
| `width`, `height`                                             | Rendered dimensions in pixels                                                            |
| `layer`, `order`                                              | Algorithm layer and within-layer order                                                   |
| `title`, `displayTitle`, `detail`, `detailLines`, `typeLabel` | Resolved text and measured line breaks                                                   |
| `titleLayout.{lines,x,anchor,lineHeight}`                     | Wrapped title and local horizontal positioning                                           |
| `contentLayout.{titleY,detailY,detailLineHeight,badgeY}`      | Card-local text offsets in pixels                                                        |
| `kind`, `groupStatsOnly`, `external`                          | Nested chart summary and focused-group flags                                             |
| `timeline.*`                                                  | Timeline-only event/time/label/port geometry; every property is expanded in Schema       |
| `flow.*`                                                      | Sankey-only flow totals and label placement                                              |
| `spatial.*`                                                   | Spatial-only source coordinates, projected depth and marker/label properties             |

Connection `points[].x/y` and `labelPosition.x/y` are absolute canvas coordinates. Card text offsets are local to its top-left corner. Expanded group rectangles and `compoundGeometry.boxes[id]` use top-left coordinates, unlike node centers. Timeline `startY`, `endY`, `anchorY` and `ports[].y` refer to the canonical time axis (canvas y vertically, canvas x horizontally); `labelX` and `labelY` always refer to physical canvas coordinates. Viewport pan and zoom are not baked into any of these values.

Runtime lookup Maps, adjacency indexes and graph data are reconstructed from the graph and geometry; they are not duplicated in the file. Appearance remains its own Schema and `metadata.style` association. Geometric text measurements and resolved renderer attributes describe the saved rendering, not an additional editable Appearance preset.

On opening, matching graph/settings/scope restore the saved rendering. Graph content changes invalidate it. Changing scope or layout settings computes the appropriate new view; editing live Appearance geometry also releases the restored positions. Update captures the resulting current view. A file never bundles unrelated chart configurations or renderings. Switching chart types changes Schema immediately. An existing metadata.layout target is overwritten by Update, including its declared chart type, matching Appearance semantics. No automatic background file write occurs.

Timeline AI plans support `trackOrder`, `eventOrder`, `edgeRouting`, `placements` and `routes`. A placement is `{id, cross, label?: {x,y}}`; `cross` is x for vertical time and y for horizontal time. A route is `{id, points: [{x,y}, ...], label?: {x,y}}`. Endpoints attach to the declared event time anchors; labels and interior route points are otherwise independent. Dates and durations remain graph content. `layout.settings.basis` identifies the inputs for exact plans; stale exact routes/positions are not reused after their time mapping or dimensions change.
