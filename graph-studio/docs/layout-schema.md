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

`layout/compound/ai/decision.ts` defines a separate versioned interaction schema. Every response requires `protocolVersion: 1`; unversioned decisions and other versions are rejected. This version does not change Layout v4, graph data, or settings files. There is no old-protocol adapter.

| Action     | Required payload                                           | Execution                                                          |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `propose`  | `hypothesis`, `intent`                                     | Programmatic placement, group fitting, ports, routing and labels.  |
| `revise`   | `hypothesis`, `baseCandidateId`, `baseRevision`, `changes` | Apply ordered local changes to the exact immutable draft revision. |
| `evaluate` | `hypothesis`, complete v4 `layout`                         | Validate exact geometry without rerouting it.                      |
| `finish`   | `candidateId`, `summary`                                   | Select a legal evaluated candidate (or the legal starting layout). |

`intent` has `scope: {groupId, includeDescendants}`, `operation: "layout-and-route"`, `boundaryPolicy: "strict" | "allow-ancestor-resize"`, `objective: "readability" | "compact"`, and up to 100 constraints. Constraints are `direction`, `flow-order`, `prefer-outer-route`, and `port-side`, all with `strength: "soft"`. IDs for connections in this AI protocol are always visible aggregated IDs. The executor converts them to the solver's original edge IDs. The selected objective and fixed direction remain authoritative.

`changes` contains 1–100 operations: `move-node` with center `position`, `move-group` with top-left `position` (translates descendants), `resize-group` with `size`, `reroute-edge`, or `replace-route` with `points` and `label`. Each operation supplies `id`. Resize containers explicitly when local moves need more room. Moving geometry invalidates incident routes and routes or labels newly obstructed by unrelated cards. Unaffected routes are fixed. Manual replacement routes are validated exactly. Up to two local routing passes are attempted; all final geometry still receives full validation.

```json
{
  "protocolVersion": 1,
  "action": "revise",
  "hypothesis": "Repair the two routes that cross cards.",
  "baseCandidateId": "trial-3",
  "baseRevision": 1,
  "changes": [
    { "type": "reroute-edge", "id": "aggregate:[\"dispatch\",\"carrier\"]" },
    { "type": "reroute-edge", "id": "aggregate:[\"orders\",\"metrics\"]" }
  ]
}
```

`currentLayout` describes `session.workingDraft`, including a failed draft that can be repaired. Candidate IDs and revisions are immutable. Failed drafts are not selectable. Prior observations contain summaries, not full historical geometry; structured issues include route segments, card bounds and expected ports. Diagnostic lists contain at most 12 entries with totals; validation covers the full graph. Exact duplicate decisions, including failures, reuse their evaluation.

Defaults are four model requests total (including correction calls), two consecutive evaluations without improvement, and a 180-second deadline. Geometry calculations run in cancellable Workers with a 15-second per-job timeout. On budget exhaustion, stagnation or request failure, the harness reports the reason and selects the best legal candidate according to unmet intent preferences and the selected quality objective. A legal starting layout participates in that comparison. If none is legal, the run fails without changing the canvas. Explicit cancellation always preserves the canvas. Reports include requests, elapsed time, stop reason and provider-reported token counts; unavailable usage is not treated as zero. Evaluation geometry remains session-only.

## Timeline interaction protocol

Timeline retains its independent `evaluate`/`finish` contract in `layout/timeline/ai/decision.ts`. It submits complete v4 timeline geometry and explicitly selects a successful result; it does not accept Compound actions. Its cancellation and exact-geometry behavior remain unchanged.
