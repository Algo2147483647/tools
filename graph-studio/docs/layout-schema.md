# Layout protocols

Layout has two explicit responsibilities: configuration persistence and AI rendering results. Both are chart-specific; they are deliberately different documents.

## Configuration persistence

**Update current layout**, beside the Layout title, writes `<graph-name>.<chartType>.layout.json` beside the graph, or overwrites its existing `metadata.layout` reference. The same operation persists the association in the disk graph and refreshes the workspace cache. Unrelated unsaved graph edits remain unsaved. The Layout file contains configuration only:

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

## Compound AI tools

Compound uses native function tools defined in `layout/compound/ai/protocol.ts`. The old versioned JSON decision envelope and correction adapter have been removed. Schema Layout v4 and configuration persistence are unchanged.

| Tool              | Purpose                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `inspect_graph`   | Scope children, selected nodes, incident connections and boundary endpoints.                    |
| `compose_layout`  | Branch from an exact candidate/revision, merge supplied scope compositions, and execute intent. |
| `edit_layout`     | Branch using exact local positions, group sizes or routes.                                      |
| `inspect_layout`  | Scoped geometry, intent checks, region shares, route passages and optional exact polylines.     |
| `compare_layouts` | Compare two immutable candidates without assigning a metric winner.                             |
| `finish_layout`   | Select a legal candidate after consuming its global inspection in a later model turn.           |

A design contains purpose, readingPath, region roles, scope compositions and connection roles. Each supplied scope can express primaryPath, parallelBranches, relative placement (left/right/above/below), left/top alignment, and [column,row] spacing. These are executable spatial requirements, not new business edges. Optional rows seed physical top-to-bottom rows and left-to-right cells in both directions. Explicit rows must contain every movable direct child exactly once. Without rows the engine seeds from path/branches and puts supporting regions in another lane. Omitted scopes retain their compositions. Groups size from children, followed by routing. Conflicting requirements return a recoverable tool error identifying the involved relationships.

Every mutation returns an immutable candidate ID and revision. Earlier candidates remain available for branching and comparison. Call IDs are idempotent: identical replays reuse results; changed arguments with an existing ID are rejected. Mutations run sequentially. Errors return through tool results, not an old JSON-regeneration protocol. Finish requires a complete global inspection (null scope, empty nodeIds), or comparison, returned before the selecting model turn. Geometry validity is enforced; numeric quality is auxiliary.

Initial input is a complete semantic graph overview without route geometry. Detailed positions and routes are queried as text. No images or offscreen renderer are used. Native conversation messages retain tool calls/results and provider-required reasoning/signatures; tools are not guaranteed to reduce total token usage.

Each invocation allows 16 model requests, 48 tool dispatches, a 20-minute overall limit and a 120-second response idle timeout refreshed by streaming output. Geometry Workers retain their 15-second timeout. Interruptions preserve the current canvas and checkpoint the conversation, candidates and pending calls in the current page session. Resume grants a fresh bounded invocation and continues pending work without repeating completed mutations. Changing document/view/layout/model context invalidates resume. Reloading the page discards these transient checkpoints. Only finish installs a candidate; no fallback or metric-based selection occurs. Tool inputs/results and final review are visible in the panel.

## Timeline interaction protocol

Timeline retains its independent `evaluate`/`finish` contract in `layout/timeline/ai/decision.ts`. It submits complete v4 timeline geometry and explicitly selects a successful result; it does not accept Compound actions. Its cancellation and exact-geometry behavior remain unchanged.
