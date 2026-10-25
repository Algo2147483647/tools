# Layout protocol

`metadata.layout` references one independent JSON file for one `chartType`. **Update current layout** writes `<graph-name>.<chartType>.layout.json` beside the graph, or overwrites the existing reference. A new association is persisted by the normal graph Save operation. Layout files are written only on Update.

Version 3 separates layout geometry from graph content and Appearance. It does not serialize the internal renderer objects. Older version 1 settings and version 2 renderer payloads are read and converted in memory; the next Update writes version 3.

```json
{
  "format": "graph-studio-layout",
  "version": 3,
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

This is a settings-only document. Update includes the visible geometry and scope; Schema → Current JSON shows the actual document.

| Field under `layout` | Responsibility |
| --- | --- |
| `settings` | Only the selected chart's layout settings and optional AI plan |
| `scope` | Selection and filters; nested focus/collapse state, timeline range, or spatial camera as applicable |
| `graphFingerprint` | Identity of graph content, excluding style/layout references |
| `settingsFingerprint` | Identity of layout settings and scope |
| `geometry` | Canvas dimensions, node/group positions and dimensions, routes and label positions |

The file contains no node titles, descriptions, displayed text, relationship values/endpoints, colors, marker styles, selection indexes, diagnostics or quality reports. These come from the current graph, its projection and Appearance. Expanded compound solver boxes/routes are reconstructed from the single set of node/group/edge geometry. Quality is measured from the restored result.

A node geometry fragment is:

```json
{
  "id": "web-storefront",
  "position": [384, 618],
  "size": [200, 100]
}
```

| Geometry field | Meaning |
| --- | --- |
| `size` | `[canvasWidth, canvasHeight]`, pixels |
| `nodes[].id` | Graph node or collapsed-group ID |
| `nodes[].position` | `[x, y]`, node center in canvas pixels; timeline uses time anchor/cross-axis center |
| `nodes[].size` | `[width, height]`, pixels |
| `nodes[].text.title` | Optional measured `[localX, lineHeight]`; no title string or copied line content |
| `nodes[].text.content` | Optional `[titleY, detailY, detailLineHeight, badgeY]` in local pixels |
| `edges[].id` | Rendered connection ID; source, target and label text are resolved from the graph projection |
| `edges[].points` | Ordered `[[x, y], ...]` in canvas pixels, including attachments; used for route evaluation/editing |
| `edges[].path` | Exact SVG curve/band outline used for rendering; retained because waypoints alone do not describe curves and filled Sankey bands |
| `edges[].label` | `[x, y]` connection label anchor in canvas pixels |
| `groups[].position` | Compound-only `[left, top]` of an expanded group, pixels |
| `groups[].size` | Compound-only `[width, height]`, pixels |
| `lanes[].extent` | `[crossAxisCenter, width]`, pixels |

Node text remains derived from the current graph and Appearance; only measured text placement is retained. Viewport pan/zoom is never baked into geometry. The Schema expands every object into its fields; tuple order and units are stated in the description. Current values display each tuple intact, e.g. `[384, 618]`, rather than independently summarizing all x and y values.

Each chart adds only the necessary geometry:

- **Timeline:** event anchors `[startPixel, endPixel, anchorPixel]`, independent label `[x,y]`, extra attachment `[time,pixel]` tuples, time mapping, ticks and track extents. Time-axis pixels are canonical (canvas y vertically, canvas x horizontally). Horizontal filtering retains a canonical geometry-only representation; it contains no copied graph or Appearance data.
- **Sankey:** label side/y coordinate, band width and direction path. Flow quantities and colors come from graph/Appearance.
- **Spatial:** projected depth, label visibility/side, guide paths, fit bounds and scale. Source coordinates, guide labels and colors come from graph/Appearance.

Timeline `settings.view` includes only `layout`, `orientation`, `edgeRouting`, `axis`, `relativeTickStep`, `tickStep`, `tickUnit`, `compactness`, `locked` and `pins`. Marker appearance, colors and other visual styling are not persisted by Layout and cannot overwrite `metadata.style` on load.

Timeline AI plans in the **file** use tuple `label: [x,y]` and `points: [[x,y], ...]`. The independent AI/solver protocol still uses named point coordinates; the file adapter converts at the boundary. The AI never has to produce this complete persistence document.

On opening, matching graph/settings/scope restore positions while joining current graph content and Appearance by ID. Changes to graph content, scope or layout settings invalidate the saved geometry; live geometric Appearance changes also trigger a new layout. Update captures the resulting view. The parser validates exact tuple lengths, finite coordinates, unique IDs and chart-specific fields, and rejects graph/Appearance properties inside version 3 geometry.
