# Node-link

Node-link displays nodes as cards connected by directed relationship paths. It is the default for ordinary graphs without a more specific chart hint. Use it when connections and dependency structure matter more than time, coordinates, or containment.

## Layout modes

Select the engine in **Settings > Layout**. The chart ID remains `node-link` for all three engines.

| UI engine        | Stored layout key | Behavior                                                                                          |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| BFS levels       | `level`           | Groups nodes by breadth-first relationship levels. Useful for inspecting reachability from roots. |
| Sugiyama layered | `sugiyama`        | Uses layered ordering to organize directed structure and reduce visual crossings.                 |
| Dagre layered    | `dagre`           | Uses the Dagre layout engine for directed layered placement.                                      |

These are layout preferences, not accepted values of the graph's `diagram` field. The engine choice is remembered separately from the portable `ChartStyle` envelope; exporting appearance does not include a `layoutMode` property.

Multiple roots and disconnected components are supported. Directed cycles retain their original edges and are arranged on a best-effort basis. An edge's scalar value is a label, not a constraint on card size or line thickness.

## Data protocol

Use the [shared v3 envelope](../chart-types.md). No Node-link-specific metadata is required. `diagram` can be omitted or set to `"dag"`.

```json
{
  "format": "graph-studio",
  "version": 3,
  "nodes": {
    "source": { "title": "Source", "type": "Input" },
    "parse": { "title": "Parse", "type": "Operation" },
    "validate": { "title": "Validate", "type": "Operation" },
    "result": { "title": "Result", "type": "Output" }
  },
  "edges": [
    { "id": "source-parse", "source": "source", "target": "parse", "value": "text" },
    { "id": "parse-validate", "source": "parse", "target": "validate", "value": "structure" },
    { "id": "validate-result", "source": "validate", "target": "result", "value": "accepted" },
    { "id": "validate-parse", "source": "validate", "target": "parse", "value": "retry" }
  ]
}
```

`title`, `define`, and `type` drive the standard card and node details. Additional JSON fields remain available in details. Do not store incoming or outgoing adjacency inside nodes; edit `edges` instead.

## Reading and navigating

Use root, branch, and parent navigation to inspect parts of a graph. Type filtering changes the visible projection. Some ordinary graph projections can use display-only bridge relationships; these are not persisted as new source edges. Hovering, focus, and selection emphasize connected paths and dim unrelated content.

Containment metadata is preserved when viewing a compound document as Node-link, but it does not create container frames. Node-link displays ordinary nodes and ordinary edges.

## Layout and appearance boundary

Card dimensions, layer spacing, row spacing, and edge-lane spacing affect geometry. Fill, border colors, shadows, and rounded corners affect paint. Fonts can affect measured card geometry as well as paint.

The [Node-link appearance reference](../appearance/node-link.md) documents exact paths, defaults, and CSS hooks. A card's radius does not change its edge endpoints. Equal widths is a display option outside `appearance.layout` in the current v1 style protocol.

## Persistence and limitations

- Switching engines does not rewrite node or edge data.
- The appearance profile is independent of other chart types.
- Cyclic graphs are supported, but the view does not assert that input is a mathematical DAG.
- A numeric relation label does not automatically make a Sankey document. Use explicit flow semantics when quantities are intended.
- SVG and HTML capture the current visible arrangement; graph JSON remains the full document.

Implementation: [chart and engine types](../../src/graph/types.ts), [stage layout](../../src/layout/stage-layout.ts), [node renderer](../../src/rendering/GraphNode.tsx), [default appearance](../../src/graph/nodeLinkAppearance.ts).
