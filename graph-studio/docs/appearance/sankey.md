# Sankey Appearance

Portable files use `chartType: "sankey"`. Read the [shared style protocol](../appearance.md) and [flow data protocol](../charts/sankey.md).

## Visual model and ownership

Sankey renders flow bars, quantity-scaled bands, node names, totals, and return-flow indicators. The quantities control band thickness and bar height. Style controls bar width, band opacity, typography, and shared effects.

| Visual property             | Current source                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| Bar height / band thickness | Graph flow quantities and computed layout.                            |
| Bar / outgoing-band color   | `nodes[id].color`, or generated category/identity color.              |
| Bar width                   | `style.appearance.display.sankeyNodeWidth`.                           |
| Normal band opacity         | `style.appearance.display.sankeyLinkOpacity`.                         |
| Name / value text           | Shared primary/secondary text tokens.                                 |
| Label font                  | Shared title font tokens; value labels retain their own smaller type. |

Do not use ordinary edge stroke width to style quantitative bands. It would change the visual meaning without changing the data.

## Fields and defaults

| Path relative to `style`               | Default | Meaning                                                 |
| -------------------------------------- | ------- | ------------------------------------------------------- |
| `appearance.display.sankeyNodeWidth`   | 20 px   | Bar width; slider 0-48, located under Layout.           |
| `appearance.display.sankeyLinkOpacity` | 32%     | Normal band opacity; slider 0-90%.                      |
| `appearance.display.showEdgeLabels`    | false   | Enables relationship/flow label geometry.               |
| `appearance.display.nodeShadow`        | true    | Shared shape shadow effect.                             |
| `appearance.display.shadowBlur`        | 8 px    | Shared shadow softness.                                 |
| `appearance.display.shadowOffset`      | 3 px    | Shared shadow distance.                                 |
| `appearance.display.shadowOpacity`     | 12%     | Shared shadow opacity.                                  |
| `appearance.layout.nodeHeight`         | 74 px   | Available vertical-space input, not a fixed bar height. |
| `appearance.layout.rowGap`             | 22 px   | Node separation.                                        |
| `appearance.layout.maxNodeWidth`       | 280 px  | Label room.                                             |

Settings exposes node shadows and the shared border toggle, but bar paint uses explicit data-derived fill/stroke, so a generic card border/fill setting does not provide an independent Sankey palette. Card radius, node dots, equal widths, and description controls are not exposed as Sankey card settings.

Sankey has one built-in preset, Default. Unlike Node-link, it uses the generic base appearance defaults. Ordinary title defaults are Georgia, 15 px, normal style, weight 400.

## Complete style example

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "sankey",
  "style": {
    "showNodeDetail": true,
    "hideNodeBorders": true,
    "alignNodeWidthsToMax": false,
    "appearance": {
      "version": 1,
      "layout": { "nodeHeight": 90, "rowGap": 24, "maxNodeWidth": 300 },
      "display": { "sankeyNodeWidth": 24, "sankeyLinkOpacity": 45, "showEdgeLabels": true, "nodeShadow": false },
      "cssVars": {
        "--dag-title-font-family": "Inter, sans-serif",
        "--dag-title-font-size": "14px",
        "--dag-text-soft": "#64748b"
      },
      "css": ""
    }
  }
}
```

The outer booleans are required by the shared file envelope even where the renderer does not consume them as card controls. `45` means 45% opacity in v1; `0.45` would mean 0.45% before any renderer-specific handling.

## Interaction and CSS

The renderer converts the opacity percentage to `--dag-sankey-opacity`. Built-in interaction rules use opacity 0.8 for hovered/active bands and 0.12 for unrelated bands during interaction. These are state rules, not additional saved opacity fields.

Useful selectors include `.dag-edge__flow`, `.dag-node__flow-label`, and `.dag-node__flow-value`, scoped under `.dag-graph[data-layout="sankey"]`. The node shape has data-derived inline fill/stroke; bands use the source color and calculated width. Generic `--dag-edge` and `--dag-node-fill` therefore do not recolor all flow marks.

## Reset and export

Layout reset includes `sankeyNodeWidth`, despite its storage under `appearance.display`. Edges reset includes `sankeyLinkOpacity`. These are current v1 grouping rules, not evidence that bar width is a paint-only setting. Whole-style reset restores the Sankey Default profile; custom CSS survives section resets.

Style export does not contain quantities or node-specific colors. Those remain in graph JSON. SVG/HTML captures the active layout, quantitative scale, and styles, including return bands.

Sources: [appearance effects](../../src/graph/appearance.ts), [node rendering](../../src/rendering/GraphNode.tsx), [edge rendering](../../src/rendering/GraphEdge.tsx), [layout](../../src/layout/algorithms/sankey.ts).
