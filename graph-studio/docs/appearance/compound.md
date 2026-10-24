# Nested node-link Appearance

Generated from the canonical field definitions. Required fields are marked with an asterisk. Numeric font sizes use explicit pixel units. Unsupported shared fields are read-only for this chart; the document retains a common appearance shape.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| format * | graph-studio-style | "graph-studio-style" | Style document format. |
| version * | 1 | 1 | Style protocol version. |
| chartType * | compound | "compound" | Chart renderer. |
| style * | object | — | Complete chart style. |
| style.showNodeDetail * | boolean | false | Show node descriptions. |
| style.hideNodeBorders * | boolean | true | Hide ordinary node borders. |
| style.alignNodeWidthsToMax * | boolean | true | Align card widths to the configured maximum. |
| style.appearance * | object | — | Shared appearance object; includes stored fields unused by some charts. |
| style.appearance.version * | 1 | 1 | Nested appearance protocol version. |
| style.appearance.canvas * | object | — | Canvas padding and minimum visible size. |
| style.appearance.canvas.padding | [number, number] | [108,88] | Horizontal and vertical canvas padding [x, y] in logical pixels. |
| style.appearance.canvas.minSize | [number, number] | [980,600] | Minimum canvas size [width, height] in logical pixels. |
| style.appearance.nodes * | object | — | Node sizes and spacing; capabilities are declared per chart. |
| style.appearance.nodes.widths | [number, number] | [200,200] | Node width bounds [min, max]; max sets the event label width. |
| style.appearance.nodes.height | number | 100 | Base card height or chart-specific vertical-space input. |
| style.appearance.nodes.spacing * | object | — | Spacing between columns, rows and Timeline channels. |
| style.appearance.nodes.spacing.column | number | 24 | Layer separation in logical pixels. |
| style.appearance.nodes.spacing.row | number | 24 | Node or label separation in logical pixels. |
| style.appearance.nodes.spacing.channel | number | 24 | Channel spacing input in logical pixels. Not used by compound. |
| style.appearance.nodes.spread | number | 1 | Cross-time-axis spread multiplier, interpreted for the selected orientation. Not used by compound. |
| style.appearance.nodes.width | number | 20 | Sankey bar width in logical pixels. Not used by compound. |
| style.appearance.edges * | object | — | Spacing between edge lanes. |
| style.appearance.edges.spacing | number | 28 | Ordinary Node-link edge-lane separation in logical pixels. Not used by compound. |
| style.appearance.display * | object | — | Display flags and visual dimensions; unsupported fields remain stored. |
| style.appearance.display.titleAlign | left \| center | "center" | Nested node-link card-title alignment. |
| style.appearance.display.titleOverflow | ellipsis \| clip \| visible | "ellipsis" | Nested node-link title overflow treatment. |
| style.appearance.display.titleWrap | boolean | true | Enables two-line titles in Nested node-link. |
| style.appearance.display.edgeArrowStyle | filled \| open | "open" | Shape of the shared ordinary-edge arrowhead. |
| style.appearance.display.showNodeDots | boolean | false | Card dots and corresponding content offset. |
| style.appearance.display.showEdgeLabels | boolean | false | Enables relation-label geometry; Timeline reveals labels on active edges. |
| style.appearance.display.showGroupStats | boolean | false | Nested node-link group statistics. |
| style.appearance.display.showGroupBorders | boolean | false | Expanded Nested node-link container borders. |
| style.appearance.display.nodeCornerRadius | number | 20 | Ordinary/collapsed card radius, capped at half the smaller rendered dimension. |
| style.appearance.display.nodeShadow | boolean | true | Shared node-shape shadows; dense scenes suppress them. |
| style.appearance.display.shadowBlur | number | 8 | Shadow softness in logical pixels. |
| style.appearance.display.shadowOffset | number | 3 | Vertical shadow distance in logical pixels. |
| style.appearance.display.shadowOpacity | number | 12 | Shadow opacity as a percentage, not a 0–1 fraction. |
| style.appearance.display.sankeyLinkOpacity | number | 32 | Sankey normal-band opacity as a percentage; interaction has separate opacity rules. Not used by compound. |
| style.appearance.cssVars * | object | — | SVG root CSS variables; only --dag- names with string values are accepted. |
| style.appearance.cssVars[--dag-text-strong] | string | "#162033" | Primary text color. |
| style.appearance.cssVars[--dag-text-soft] | string | "#8792a2" | Secondary text color. |
| style.appearance.cssVars[--dag-edge] | string | "#cccccc" | Default ordinary-edge or axis/grid color where consumed. |
| style.appearance.cssVars[--dag-edge-active] | string | "#cc0000" | Active ordinary-edge color; explicit data strokes can take precedence. |
| style.appearance.cssVars[--dag-node-fill] | string | "#ffffff" | Card/background fill; does not replace Sankey or Spatial data colors. |
| style.appearance.cssVars[--dag-node-border] | string | "rgba(91, 109, 142, 0.17)" | Ordinary card outline; per-node category tokens can override it. |
| style.appearance.cssVars[--dag-node-border-strong] | string | "rgba(50, 79, 132, 0.35)" | Emphasized/root card outline. |
| style.appearance.cssVars[--dag-title-font-family] | string | "\"Times New Roman\", serif" | Title font stack; installed fonts determine rendering. |
| style.appearance.cssVars[--dag-title-font-size] | string | "22px" | Title size in logical pixels, shared by measurement and rendering. |
| style.appearance.cssVars[--dag-title-font-style] | string | "normal" | Title font style as a CSS string. |
| style.appearance.cssVars[--dag-title-font-weight] | string | "400" | Title font weight as a CSS string. |
| style.appearance.cssVars[--dag-detail-font-size] | string | "10px" | Detail font size. |
| style.appearance.cssVars[--dag-detail-font-family] | string | "\"IBM Plex Sans\", \"Segoe UI\", sans-serif" | Detail font family. |
| style.appearance.cssVars[--dag-detail-font-weight] | string | "400" | Detail font weight. |
| style.appearance.cssVars[--dag-detail-font-style] | string | "normal" | Detail font style. |
| style.appearance.cssVars[--dag-date-font-size] | string | "10px" | Date font size. Not used by compound. |
| style.appearance.cssVars[--dag-date-font-family] | string | "\"IBM Plex Mono\", Consolas, monospace" | Date font family. Not used by compound. |
| style.appearance.cssVars[--dag-date-font-weight] | string | "400" | Date font weight. Not used by compound. |
| style.appearance.cssVars[--dag-date-font-style] | string | "normal" | Date font style. Not used by compound. |
| style.appearance.cssVars[--dag-axis-font-size] | string | "11px" | Axis font size. Not used by compound. |
| style.appearance.cssVars[--dag-axis-font-family] | string | "\"IBM Plex Mono\", Consolas, monospace" | Axis font family. Not used by compound. |
| style.appearance.cssVars[--dag-axis-font-weight] | string | "400" | Axis font weight. Not used by compound. |
| style.appearance.cssVars[--dag-axis-font-style] | string | "normal" | Axis font style. Not used by compound. |
| style.appearance.cssVars[--dag-track-font-size] | string | "12px" | Track font size. Not used by compound. |
| style.appearance.cssVars[--dag-track-font-family] | string | "\"IBM Plex Sans\", \"Segoe UI\", sans-serif" | Track font family. Not used by compound. |
| style.appearance.cssVars[--dag-track-font-weight] | string | "600" | Track font weight. Not used by compound. |
| style.appearance.cssVars[--dag-track-font-style] | string | "normal" | Track font style. Not used by compound. |
| style.appearance.cssVars[--dag-flow-active-opacity] | string | "0.8" | Flow active opacity. Not used by compound. |
| style.appearance.cssVars[--dag-flow-muted-opacity] | string | "0.12" | Flow muted opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-muted-opacity] | string | "0.28" | Timeline muted opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-soft-opacity] | string | "0.24" | Timeline soft opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-hover-opacity] | string | "0.38" | Timeline hover opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-label-opacity] | string | "0.65" | Timeline label opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-edge-opacity] | string | "0.55" | Timeline edge opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-edge-muted-opacity] | string | "0.07" | Timeline edge muted opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-edge-active-opacity] | string | "1" | Timeline edge active opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-edge-width] | string | "1.7px" | Timeline edge width. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-edge-active-width] | string | "2.4px" | Timeline edge active width. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-selection-width] | string | "2.5px" | Timeline selection width. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-dash] | string | "6 4" | Timeline dash. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-reference-dash] | string | "3 5" | Timeline reference dash. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-backward-dash] | string | "6 3" | Timeline backward dash. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-reference-opacity] | string | "0.25" | Timeline reference opacity. Not used by compound. |
| style.appearance.cssVars[--dag-timeline-leader-dash] | string | "4 3" | Timeline leader dash. Not used by compound. |
| style.appearance.cssVars[--dag-shadow-color] | string | "24, 39, 64" | Shadow color. |
| style.appearance.cssVars[--dag-shadow-active-offset-scale] | string | "1.5" | Shadow active offset scale. |
| style.appearance.cssVars[--dag-shadow-active-blur-scale] | string | "1.25" | Shadow active blur scale. |
| style.appearance.cssVars[--dag-*] | string | — | Additional map entry. |
| style.appearance.css * | string | ".dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }" | Saved CSS; at most 50,000 characters; @import is rejected; custom CSS uses the final graph-custom cascade layer. |
| style.appearance.palette | object | — | Category and nested-group color palettes. |
| style.appearance.palette.categories | [number, number, number][] | [[356,58,47],[214,62,44],[145,52,40],[32,66,47],[188,54,42],[265,48,48],[325,48,48],[210,24,44]] | Category HSL swatches [hue, saturation, lightness]. Not used by compound. |
| style.appearance.palette.groups | string[][] | [["#fffdf5","#fffbea","#fff7df","#fff4d5"],["#f5fdf9","#edfdf5","#e5fbf0","#dcf8e9"],["#fff9f5","#fff3eb","#ffede1","#ffe7d8"],["#f5fcff","#edf9ff","#e4f6ff","#daf2ff"]] | Group color ramps, indexed by family and nesting depth. |
| style.appearance.performance | object | — | performance |
| style.appearance.performance.denseThresholds | [number, number, number] | [220,440,20000000] | Dense-scene thresholds [nodes, edges, area]. |
| style.appearance.performance.denseShadows | preserve \| disable | "disable" | Shadow policy in dense scenes. |

## Complete example

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "compound",
  "style": {
    "showNodeDetail": false,
    "hideNodeBorders": true,
    "alignNodeWidthsToMax": true,
    "appearance": {
      "version": 1,
      "canvas": {
        "padding": [
          108,
          88
        ],
        "minSize": [
          980,
          600
        ]
      },
      "nodes": {
        "widths": [
          200,
          200
        ],
        "height": 100,
        "spacing": {
          "column": 24,
          "row": 24,
          "channel": 24
        },
        "spread": 1,
        "width": 20
      },
      "edges": {
        "spacing": 28
      },
      "display": {
        "titleAlign": "center",
        "titleOverflow": "ellipsis",
        "titleWrap": true,
        "edgeArrowStyle": "open",
        "showNodeDots": false,
        "showEdgeLabels": false,
        "showGroupStats": false,
        "showGroupBorders": false,
        "nodeCornerRadius": 20,
        "nodeShadow": true,
        "shadowBlur": 8,
        "shadowOffset": 3,
        "shadowOpacity": 12,
        "sankeyLinkOpacity": 32
      },
      "cssVars": {
        "--dag-text-strong": "#162033",
        "--dag-text-soft": "#8792a2",
        "--dag-edge": "#cccccc",
        "--dag-edge-active": "#cc0000",
        "--dag-node-fill": "#ffffff",
        "--dag-node-border": "rgba(91, 109, 142, 0.17)",
        "--dag-node-border-strong": "rgba(50, 79, 132, 0.35)",
        "--dag-title-font-family": "\"Times New Roman\", serif",
        "--dag-title-font-size": "22px",
        "--dag-title-font-style": "normal",
        "--dag-title-font-weight": "400",
        "--dag-detail-font-size": "10px",
        "--dag-detail-font-family": "\"IBM Plex Sans\", \"Segoe UI\", sans-serif",
        "--dag-detail-font-weight": "400",
        "--dag-detail-font-style": "normal",
        "--dag-date-font-size": "10px",
        "--dag-date-font-family": "\"IBM Plex Mono\", Consolas, monospace",
        "--dag-date-font-weight": "400",
        "--dag-date-font-style": "normal",
        "--dag-axis-font-size": "11px",
        "--dag-axis-font-family": "\"IBM Plex Mono\", Consolas, monospace",
        "--dag-axis-font-weight": "400",
        "--dag-axis-font-style": "normal",
        "--dag-track-font-size": "12px",
        "--dag-track-font-family": "\"IBM Plex Sans\", \"Segoe UI\", sans-serif",
        "--dag-track-font-weight": "600",
        "--dag-track-font-style": "normal",
        "--dag-flow-active-opacity": "0.8",
        "--dag-flow-muted-opacity": "0.12",
        "--dag-timeline-muted-opacity": "0.28",
        "--dag-timeline-soft-opacity": "0.24",
        "--dag-timeline-hover-opacity": "0.38",
        "--dag-timeline-label-opacity": "0.65",
        "--dag-timeline-edge-opacity": "0.55",
        "--dag-timeline-edge-muted-opacity": "0.07",
        "--dag-timeline-edge-active-opacity": "1",
        "--dag-timeline-edge-width": "1.7px",
        "--dag-timeline-edge-active-width": "2.4px",
        "--dag-timeline-selection-width": "2.5px",
        "--dag-timeline-dash": "6 4",
        "--dag-timeline-reference-dash": "3 5",
        "--dag-timeline-backward-dash": "6 3",
        "--dag-timeline-reference-opacity": "0.25",
        "--dag-timeline-leader-dash": "4 3",
        "--dag-shadow-color": "24, 39, 64",
        "--dag-shadow-active-offset-scale": "1.5",
        "--dag-shadow-active-blur-scale": "1.25"
      },
      "css": ".dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }",
      "palette": {
        "categories": [
          [
            356,
            58,
            47
          ],
          [
            214,
            62,
            44
          ],
          [
            145,
            52,
            40
          ],
          [
            32,
            66,
            47
          ],
          [
            188,
            54,
            42
          ],
          [
            265,
            48,
            48
          ],
          [
            325,
            48,
            48
          ],
          [
            210,
            24,
            44
          ]
        ],
        "groups": [
          [
            "#fffdf5",
            "#fffbea",
            "#fff7df",
            "#fff4d5"
          ],
          [
            "#f5fdf9",
            "#edfdf5",
            "#e5fbf0",
            "#dcf8e9"
          ],
          [
            "#fff9f5",
            "#fff3eb",
            "#ffede1",
            "#ffe7d8"
          ],
          [
            "#f5fcff",
            "#edf9ff",
            "#e4f6ff",
            "#daf2ff"
          ]
        ]
      },
      "performance": {
        "denseThresholds": [
          220,
          440,
          20000000
        ],
        "denseShadows": "disable"
      }
    }
  }
}
```
