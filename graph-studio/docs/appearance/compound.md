# Nested Node-link Appearance

Portable files use `chartType: "compound"`, while the UI calls the chart **Nested node-link**. Read the [shared protocol](../appearance.md) and [chart behavior](../charts/compound.md) first.

## Visual model

The chart distinguishes ordinary cards, collapsed group cards, expanded container frames, group headers/statistics, and projected relationship paths. Group membership comes from graph data. Appearance controls how those elements look without changing membership or expansion state.

## Supported fields

Compound supports the card, shadow, border, equal-width, edge-label, arrow, and typography fields listed for [Node-link](node-link.md), plus:

| Path relative to `style`              | Values                        | Effect                                |
| ------------------------------------- | ----------------------------- | ------------------------------------- |
| `appearance.display.showGroupStats`   | Boolean                       | Group node/relationship statistics.   |
| `appearance.display.showGroupBorders` | Boolean                       | Expanded frame outlines.              |
| `appearance.display.titleAlign`       | `left`, `center`              | Card title alignment.                 |
| `appearance.display.titleOverflow`    | `ellipsis`, `clip`, `visible` | Overflow treatment for card titles.   |
| `appearance.display.titleWrap`        | Boolean                       | Enables a two-line card title layout. |

`nodeCornerRadius` applies to ordinary and collapsed cards. Expanded container frames have separate rendering geometry. Hiding ordinary card borders and hiding expanded group borders are separate choices.

## Default profile and Preset 2

| Setting                                        | Default                                    | Preset 2                                 |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| Layer / row spacing                            | 24 / 24 px                                 | 24 / 24 px                               |
| Base node height                               | 100 px                                     | 48 px                                    |
| Minimum / maximum width                        | 200 / 200 px                               | 188 / 240 px                             |
| Corner radius                                  | 20 px                                      | 16 px                                    |
| Title                                          | Centered, two lines, 22 px Times New Roman | Left, single line, generic 15 px Georgia |
| Node dots                                      | Hidden                                     | Visible                                  |
| Group statistics / frames                      | Hidden / hidden                            | Hidden / hidden                          |
| Descriptions / ordinary borders / equal widths | Hidden / hidden / enabled                  | Hidden / hidden / enabled                |
| Edge labels / arrows                           | Hidden / open                              | Hidden / open                            |
| Edge / active edge                             | `#cccccc` / `#cc0000`                      | `#e1e3e6` / `#8b1e2d`                    |

Both profiles use shared shadows and append a 1 px ordinary-edge CSS rule. Applying a preset replaces the complete style, so preserve a custom profile by exporting it first.

## Geometry and reset behavior

Layout exposes layer spacing, node spacing, node height, and maximum width. It omits ordinary edge-lane spacing because the nested router uses its own routing model. Title fonts, wrap, dots, and group statistics can change measured geometry and trigger layout.

Nodes reset includes card appearance and group visibility/statistics. Text reset includes the Compound title flags and font tokens. Edges reset covers shared edge properties. Section resets preserve CSS. Expansion, focus, and document-specific Arrange plans are outside these appearance resets.

## Complete style example

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "compound",
  "style": {
    "showNodeDetail": false,
    "hideNodeBorders": false,
    "alignNodeWidthsToMax": true,
    "appearance": {
      "version": 1,
      "layout": { "columnGap": 32, "rowGap": 28, "nodeHeight": 80, "minNodeWidth": 200, "maxNodeWidth": 240 },
      "display": {
        "nodeCornerRadius": 12,
        "showGroupBorders": true,
        "showGroupStats": true,
        "showNodeDots": false,
        "showEdgeLabels": true,
        "titleAlign": "center",
        "titleWrap": true,
        "titleOverflow": "ellipsis"
      },
      "cssVars": { "--dag-title-font-size": "18px", "--dag-edge": "#94a3b8" },
      "css": ""
    }
  }
}
```

## CSS, colors, and exports

Use `.dag-graph[data-layout="compound"]` to limit rules to the nested chart. Cards retain ordinary node selectors. Expanded group rendering exposes `data-group-id` and `data-depth`; inspect the renderer before overriding container elements rather than assuming they share card classes.

Category colors may locally override inherited border tokens. A global node radius or fill does not describe every container element. Changing a projected edge's visual style does not alter its original edge records or aggregation.

SVG and HTML export the current expanded/collapsed appearance. Saving style JSON does not save the expansion tree or focused group. Saving graph JSON preserves the actual membership and relationships.

Sources: [defaults and presets](../../src/state/chartStyles.ts), [title geometry inputs](../../src/layout/appearance.ts), [group rendering](../../src/rendering/GraphStage.tsx), [section reset mapping](../../src/components/settings/appearanceSections.ts).
