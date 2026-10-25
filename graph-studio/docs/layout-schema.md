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

## Compound AI interaction protocol

`layout/compound/ai/decision.ts` requires `protocolVersion: 2`. Version 1, unversioned decisions, `propose` and full-geometry `evaluate` are rejected. This protocol does not change Layout v4 or saved graph/settings schemas.

| Action | Required payload | Execution |
| --- | --- | --- |
| `design` | `hypothesis`, `design`, `review` | Replace the spatial composition and compute complete geometry. Initial review is null; subsequent designs review the current candidate. |
| `revise` | `hypothesis`, `baseCandidateId`, `baseRevision`, `changes`, `review` | Apply local changes to the exact supplied draft revision. |
| `finish` | `candidateId`, `summary`, `review` | Finish the supplied legal candidate after reviewing its actual result. |

`design` states a `purpose`, a `readingPath` of visible node/group IDs, `regions` with primary/branch/support roles and reasons, `scopes`, and visible `connections` with main/branch/feedback/support roles. Each scope has `groupId`, RIGHT/DOWN `direction`, `rows` and a reason. RIGHT uses rows as parallel lanes and columns as reading steps; DOWN transposes the map. Null cells reserve space. Every movable direct child of a supplied scope occurs exactly once. The current root scope is required; omitted interiors retain their arrangement. Spatial cells do not add business dependencies or flow-order constraints. Group bounds are derived from contents. Main connections are routed before supporting ones; feedback/support connections may use bounded outer corridors. A replacement design clears earlier generated constraints.

`changes` supports `move-node` (center), `move-group` (top-left, translates descendants), `resize-group`, `reroute-edge`, and exact `replace-route`. Moving geometry reroutes incident and newly obstructed connections. Grow groups explicitly if needed. Manual route replacements are never silently repaired. Final geometry receives complete validation.

Each review binds `candidateId` and `revision` and describes `readingFlow`, `hierarchy`, `relationships`, and `problems`. Problems identify concrete IDs, an observation, a proposed change and its expected effect. A revision or replacement after the initial design requires a problem. Subsequent feedback includes the previous review so the model can check its expected effect. Failed drafts can be repaired but not finished. A changed candidate must receive its own review.

The browser renders candidates offscreen using the real GraphStage and current appearance, then sends an overview and up to four details through the configured provider's native image input. Images are identified by candidate/revision and canvas bounds. The canvas is not replaced while reviewing. Images remain transient and are not included as base64 in JSON history. Unsupported image input retries explicitly in structure-only mode; reports disclose this limitation. Renderer failure does not masquerade as visual review.

Defaults are six total model requests including corrections and a 240-second deadline. Geometry Workers remain cancellable with 15-second timeouts. A final request is reserved for reviewing the result rather than creating an unreviewable edit. There is no numeric stagnation rule, baseline quality gate or automatic metric-based candidate selection. On interruption the last reviewed legal design may be retained with the stop reason and unresolved issues; without a reviewed legal design the canvas stays unchanged. Explicit cancellation always preserves the canvas. Reports include design intent, reviews, observation mode, geometry diagnostics, request counts, elapsed time and available provider usage.

## Timeline interaction protocol

Timeline retains its independent `evaluate`/`finish` contract in `layout/timeline/ai/decision.ts`. It submits complete v4 timeline geometry and explicitly selects a successful result; it does not accept Compound actions. Its cancellation and exact-geometry behavior remain unchanged.
