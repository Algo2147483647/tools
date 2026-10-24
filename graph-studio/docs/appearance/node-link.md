# Node-link Appearance

Use this reference with the [shared style protocol](../appearance.md) and [Node-link chart guide](../charts/node-link.md). Portable files use `chartType: "node-link"`.

## Visual model

The renderer draws card shapes, optional node dots, titles and descriptions, directed paths, and optional relationship labels. Category tokens can color borders and dots independently of the shared card fill. Hover, focus, and selection emphasize connected elements; unrelated content is dimmed.

## Supported fields

Paths are relative to `style` unless stated otherwise.

| Path                                                             | Effect                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `showNodeDetail`                                                 | Shows card description content.                                   |
| `hideNodeBorders`                                                | Hides ordinary card outlines when true.                           |
| `alignNodeWidthsToMax`                                           | Aligns card widths to the calculated maximum.                     |
| `appearance.display.nodeCornerRadius`                            | Card radius, limited to half the smaller rendered card dimension. |
| `appearance.display.showNodeDots`                                | Node-dot visibility and corresponding content offset.             |
| `appearance.display.nodeShadow`                                  | Enables shared card shadows.                                      |
| `appearance.display.shadowBlur`, `shadowOffset`, `shadowOpacity` | Shadow softness, distance, and percentage opacity.                |
| `appearance.display.showEdgeLabels`                              | Relationship label visibility.                                    |
| `appearance.display.edgeArrowStyle`                              | Filled or open ordinary arrowhead.                                |
| `appearance.cssVars`                                             | Shared card, text, edge, and font tokens.                         |
| `appearance.css`                                                 | Advanced selector-based customization.                            |

`showGroupStats`, `showGroupBorders`, and Sankey fields are carried by the shared object but are not Node-link features. Compound's title alignment/wrap controls are not exposed as Node-link title-layout controls.

## Default profile

The current Node-link Default preset differs from generic sanitizer defaults:

| Setting                                         | Default                                      |
| ----------------------------------------------- | -------------------------------------------- |
| Descriptions / borders / equal widths           | Hidden / hidden / enabled                    |
| Layer spacing / row spacing / edge-lane spacing | 64 / 28 / 12 px                              |
| Base node height / maximum width                | 48 / 240 px                                  |
| Card radius / node dots                         | 16 px / visible                              |
| Shadow                                          | Enabled; blur 8 px, offset 3 px, opacity 10% |
| Edge labels / arrow style                       | Hidden / open                                |
| Title                                           | Times New Roman, 15 px, weight 500           |
| Edge / active edge                              | `#e1e3e6` / `#8b1e2d`                        |

The saved preset CSS hides the backdrop and sets ordinary paths to 1 px. A different custom CSS string may change these effects. The only built-in Node-link preset is Default.

## Geometry controls

`appearance.layout.columnGap`, `rowGap`, `edgeLaneGap`, `nodeHeight`, and `maxNodeWidth` are exposed under Layout. The full shared layout object also contains padding, minimum width, and stage minimum dimensions. Fonts participate in measurement. Radius and shadow adjustments do not change the topology or node positions.

The layout engine (`level`, `sugiyama`, `dagre`) is separate browser preference state and is not a field in the current portable style file.

## Complete style example

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "node-link",
  "style": {
    "showNodeDetail": true,
    "hideNodeBorders": false,
    "alignNodeWidthsToMax": false,
    "appearance": {
      "version": 1,
      "layout": { "columnGap": 80, "rowGap": 32, "nodeHeight": 64, "maxNodeWidth": 280 },
      "display": { "nodeCornerRadius": 8, "nodeShadow": false, "showEdgeLabels": true, "edgeArrowStyle": "open" },
      "cssVars": {
        "--dag-node-fill": "#ffffff",
        "--dag-title-font-family": "Inter, sans-serif",
        "--dag-title-font-size": "16px"
      },
      "css": ".dag-graph .dag-edge__path { stroke-width: 1.5px; }"
    }
  }
}
```

Omitted optional fields receive the selected chart's schema defaults, as described in the [shared reference](../appearance.md). Export a full current profile if you need an exact starting point.

## CSS and rendering notes

Target `.dag-node__shape`, `.dag-node__title`, `.dag-node__detail`, `.dag-node__pin`, and `.dag-edge__path`. Category-derived per-node variables may override inherited border tokens. Built-in shadow rules override ordinary `filter` rules and suppress shadows for dense scenes. The borderless root flag can hide a configured border color.

Whole-style reset restores the chart's defaults. Section reset preserves custom CSS, so it may not remove a custom line-width or color rule. SVG/HTML export uses the current profile and visible arrangement.

Sources: [Node-link defaults](../../src/graph/nodeLinkAppearance.ts), [node renderer](../../src/rendering/GraphNode.tsx), [appearance effects](../../src/graph/appearance.ts).
