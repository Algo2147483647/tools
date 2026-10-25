# Layout protocols

Layout has two explicit responsibilities: configuration persistence and AI rendering results. Both are chart-specific; they are deliberately different documents.

## Configuration persistence

**Update current layout**, beside the Layout title, writes `<graph-name>.<chartType>.layout.json` beside the graph, or overwrites its existing `metadata.layout` reference. Normal graph Save persists a new association. Only configuration is written:

```json
{
  "format": "graph-studio-layout-settings",
  "version": 1,
  "chartType": "compound",
  "settings": {
    "method": "ai",
    "direction": "AUTO",
    "objective": "readability",
    "portMode": "distributed"
  }
}
```

Compound stores method, direction, objective and port mode. Timeline stores mode and view settings (`layout`, `orientation`, `edgeRouting`, `axis`, `relativeTickStep`, `tickStep`, `tickUnit`, `compactness`). Node-link stores its algorithm. There are no saved coordinates, group bounds, paths, node order, constraints, plans, pins, scope, fingerprints or geometry. Unsupported fields are rejected at both filesystem write boundaries. Old associations are read for configuration only; old geometry is discarded before validation and never installed. Update replaces the old file with configuration only.

Opening or expanding/collapsing the graph calculates the visible layout using current configuration. An AI result exists in the current session; reopening does not reproduce that result or call an AI automatically. Appearance has its own independent JSON association through `metadata.style`, updated by **Update current appearance** beside the Appearance title.

## Schema Layout: AI output and rendering

`src/schema/layoutResult.ts` defines the provider JSON Schema, Schema tab fields and response parser. `src/layout/shared/applyLayoutResult.ts` applies validated results directly to measured stage data; the Schema module does not depend on rendering algorithms. **Current JSON** shows the currently rendered result in this same protocol, not the settings file.

```json
{
  "format": "graph-studio-layout",
  "version": 4,
  "chartType": "compound",
  "geometry": {
    "size": [700, 300],
    "nodes": [
      { "id": "a", "position": [150, 150] },
      { "id": "b", "position": [500, 150] }
    ],
    "edges": [
      {
        "id": "ab",
        "points": [
          [250, 150],
          [400, 150]
        ],
        "label": [325, 150]
      }
    ],
    "groups": []
  }
}
```

This example assumes two measured cards 200 pixels wide. Coordinates are absolute canvas pixels, before viewport pan/zoom. `size` is `[width,height]`, node `position` is its center, group `position` is its top-left. The input supplies graph meaning, measured dimensions, topology, current result, configuration and quality observations. Output supplies complete visible member IDs and exact positions/routes. It does not duplicate titles, details, colors, measured card sizes, time mapping or ticks.

Chart variants:

- Compound: node positions, expanded group bounds, connection polylines and label anchors. Collapsed groups are nodes. Groups preserve containment and measured minimum dimensions.
- Timeline: event marker positions and independent `label:[x,y]`, connection polylines and labels. The time-axis coordinate, dates, durations and pins are preserved. Horizontal coordinates are physical canvas coordinates; canonical geometry is derived locally without rearrangement.
- Node-link: node centers and connection polylines.
- Sankey and spatial: node centers and exact SVG connection paths, retaining measured chart-specific rendering attributes from the input.

AI Arrange currently runs for compound and timeline. Their evaluation envelope is `{action:"evaluate",hypothesis:"...",layout:<Schema Layout document>}`. The payload under `layout` is precisely the Schema tab's protocol. The response `{action:"finish",candidateId:"trial-1",summary:"..."}` selects a successful evaluated result. Every evaluation returns quality and geometry feedback. The model controls revision and selection, with cancellation available; there is no fixed iteration budget or quality-based substitute. One malformed provider response may be regenerated once.

The harness checks structure, finite coordinates, current-scope membership and chart semantics. It joins graph and Appearance data, constructs SVG paths from supplied polylines, measures quality, and renders exact supplied geometry. It never fits groups, moves specified nodes, reroutes supplied connections or chooses Automatic in place of the selected AI result. Intermediate results are not applied; invalid responses or cancellation leave the live arrangement unchanged.
