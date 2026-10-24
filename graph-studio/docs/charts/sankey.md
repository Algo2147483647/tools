# Sankey

Sankey displays quantities as bands between vertical bars. Band thickness uses one shared linear scale. Use it for flows whose numeric values have a consistent interpretation, such as energy, material throughput, or allocations.

## Data protocol

Declare `diagram: "sankey"` to make flow semantics explicit and open the chart automatically when no higher-priority chart hint applies.

```json
{
  "format": "graph-studio",
  "version": 3,
  "diagram": "sankey",
  "nodes": {
    "supply": { "title": "Supply", "color": "#2563eb" },
    "process": { "title": "Process", "color": "#10b981" },
    "product": { "title": "Product" },
    "loss": { "title": "Loss" }
  },
  "edges": [
    { "id": "input", "source": "supply", "target": "process", "value": 100 },
    { "id": "output", "source": "process", "target": "product", "value": 80 },
    { "id": "waste", "source": "process", "target": "loss", "value": 20 }
  ]
}
```

| Path                        | Type                | Meaning                                                |
| --------------------------- | ------------------- | ------------------------------------------------------ |
| `diagram`                   | `"sankey"`          | Enables strict flow semantics in the graph document.   |
| `edges[].value`             | Finite number >= 0  | Required quantity. No string-to-number conversion.     |
| `nodes[id].color`           | Six-digit hex color | Optional bar and outgoing-band color.                  |
| `edges[].metadata.label`    | String              | Optional label associated with the displayed quantity. |
| `edges[].metadata.feedback` | Boolean             | `true` explicitly requests return-flow routing.        |

The [shared graph rules](../chart-types.md) still apply. Missing values, numeric strings, booleans, null, negative values, and overflowing incoming/outgoing totals are rejected. Self-loops remain invalid; multi-node cycles are supported.

An ordinary graph with valid numeric values can be viewed as Sankey without changing its `diagram`. Selecting Sankey for invalid quantities is rejected with a status message; values are never invented. If an active Sankey view becomes invalid through a data change, the application can fall back to Node-link.

## How to read quantities

Bar height uses the larger incoming or outgoing total. Unequal totals can produce a balance notice; Graph Studio does not silently normalize the numbers. Band width represents quantity, not a configurable decorative stroke width.

Zero-value edges remain in JSON but have no visible band. Nodes without positive flow appear with zero markers rather than invented minimum throughput. A filter or branch focus recalculates quantities and scale for the visible subgraph, so widths from different filtered views should not be compared as if their scales were identical.

## Cycles and returns

Feedback bands route in lanes below the main diagram and show their direction. Explicit `metadata.feedback: true` marks a recycling link; otherwise feedback detection identifies links that need return routing. All flows, including returns, contribute to totals and use the same quantity scale.

Return routing does not change endpoints, quantities, or edge direction. A cycle does not imply conservation: verify that units and balances match the intended model.

## Filtering and editing

Type filtering keeps original edges between visible endpoints. It does not invent replacement flow through hidden nodes. Numeric flow editing supports ordinary graph transactions and undo/redo. New Sankey relationships default to quantity `1`; invalid edits are rejected.

Node color is optional data attached to a node. Without it, the renderer assigns colors using category or identity. This differs from the general card-fill CSS token. See [Sankey appearance](../appearance/sankey.md) for precise ownership of colors, bar width, and band opacity.

## Persistence and limits

The graph stores quantities and explicit colors. The style stores bar-width and visual preferences. SVG captures the current computed flow geometry; changing CSS stroke width in an exported SVG would break the quantitative representation.

Flow layout is automatic; BFS, Sugiyama, and Dagre are Node-link choices. Edges are aggregated quantities, so a single chart should use compatible units. Mixing units can produce a technically valid file with a misleading visual scale.

Implementation: [flow validation and feedback detection](../../src/graph/sankey.ts), [Sankey layout](../../src/layout/sankey/layout.ts), [edge renderer](../../src/components/canvas/GraphEdge.tsx).
