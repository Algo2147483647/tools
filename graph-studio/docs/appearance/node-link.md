# Node-link Appearance

Generated from the canonical field definitions. Required fields are marked with an asterisk. Numeric font sizes use explicit pixel units. Unsupported shared fields are read-only for this chart; the document retains a common appearance shape.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| format * | graph-studio-style | "graph-studio-style" | Style document format. |
| version * | 1 | 1 | Style protocol version. |
| chartType * | node-link | "node-link" | Chart renderer. |
| style * | object | — | Complete chart style. |
| style.showNodeDetail * | boolean | false | Show node descriptions. |
| style.hideNodeBorders * | boolean | true | Hide ordinary node borders. |
| style.alignNodeWidthsToMax * | boolean | true | Align card widths to the configured maximum. |
| style.appearance * | object | — | Shared appearance object; includes stored fields unused by some charts. |
| style.appearance.version * | 1 | 1 | Nested appearance protocol version. |
| style.appearance.layout * | object | — | Stored geometry values; renderer support varies by chart. |
| style.appearance.layout.stagePadding | [number, number] | [108,88] | Horizontal and vertical stage padding [x, y] in logical pixels. |
| style.appearance.layout.columnGap | number | 64 | Layer separation in logical pixels. |
| style.appearance.layout.rowGap | number | 28 | Node or label separation in logical pixels. |
| style.appearance.layout.edgeLaneGap | number | 12 | Ordinary Node-link edge-lane separation in logical pixels. |
| style.appearance.layout.nodeHeight | number | 48 | Base card height or chart-specific vertical-space input. |
| style.appearance.layout.nodeWidthRange | [number, number] | [188,240] | Node width bounds [min, max]; max sets the event label width. |
| style.appearance.layout.stageMinSize | [number, number] | [980,600] | Minimum stage dimensions [width, height] in logical pixels. |
| style.appearance.display * | object | — | Display flags and visual dimensions; unsupported fields remain stored. |
| style.appearance.display.titleAlign | left \| center | "left" | Nested node-link card-title alignment. Not used by node-link. |
| style.appearance.display.titleOverflow | ellipsis \| clip \| visible | "ellipsis" | Nested node-link title overflow treatment. Not used by node-link. |
| style.appearance.display.titleWrap | boolean | false | Enables two-line titles in Nested node-link. Not used by node-link. |
| style.appearance.display.edgeArrowStyle | filled \| open | "open" | Shape of the shared ordinary-edge arrowhead. |
| style.appearance.display.showNodeDots | boolean | true | Card dots and corresponding content offset. |
| style.appearance.display.showEdgeLabels | boolean | false | Enables relation-label geometry; Timeline reveals labels on active edges. |
| style.appearance.display.showGroupStats | boolean | true | Nested node-link group statistics. Not used by node-link. |
| style.appearance.display.showGroupBorders | boolean | true | Expanded Nested node-link container borders. Not used by node-link. |
| style.appearance.display.nodeCornerRadius | number | 16 | Ordinary/collapsed card radius, capped at half the smaller rendered dimension. |
| style.appearance.display.nodeShadow | boolean | true | Shared node-shape shadows; dense scenes suppress them. |
| style.appearance.display.shadowBlur | number | 8 | Shadow softness in logical pixels. |
| style.appearance.display.shadowOffset | number | 3 | Vertical shadow distance in logical pixels. |
| style.appearance.display.shadowOpacity | number | 10 | Shadow opacity as a percentage, not a 0–1 fraction. |
| style.appearance.display.sankeyNodeWidth | number | 20 | Sankey bar width in logical pixels; exposed under Layout. Not used by node-link. |
| style.appearance.display.sankeyLinkOpacity | number | 32 | Sankey normal-band opacity as a percentage; interaction has separate opacity rules. Not used by node-link. |
| style.appearance.cssVars * | object | — | SVG root CSS variables; only --dag- names with string values are accepted. |
| style.appearance.cssVars[--dag-text-strong] | string | "#162033" | Primary text color. |
| style.appearance.cssVars[--dag-text-soft] | string | "#8792a2" | Secondary text color. |
| style.appearance.cssVars[--dag-edge] | string | "#e1e3e6" | Default ordinary-edge or axis/grid color where consumed. |
| style.appearance.cssVars[--dag-edge-active] | string | "#8b1e2d" | Active ordinary-edge color; explicit data strokes can take precedence. |
| style.appearance.cssVars[--dag-node-fill] | string | "#ffffff" | Card/background fill; does not replace Sankey or Spatial data colors. |
| style.appearance.cssVars[--dag-node-border] | string | "rgba(91, 109, 142, 0.17)" | Ordinary card outline; per-node category tokens can override it. |
| style.appearance.cssVars[--dag-node-border-strong] | string | "rgba(50, 79, 132, 0.35)" | Emphasized/root card outline. |
| style.appearance.cssVars[--dag-title-font-family] | string | "\"Times New Roman\", serif" | Title font stack; installed fonts determine rendering. |
| style.appearance.cssVars[--dag-title-font-size] | string | "15px" | Title size in logical pixels, shared by measurement and rendering. |
| style.appearance.cssVars[--dag-title-font-style] | string | "normal" | Title font style as a CSS string. |
| style.appearance.cssVars[--dag-title-font-weight] | string | "500" | Title font weight as a CSS string. |
| style.appearance.cssVars[--dag-detail-font-size] | string | "10px" | Detail font size. |
| style.appearance.cssVars[--dag-detail-font-family] | string | "\"IBM Plex Sans\", \"Segoe UI\", sans-serif" | Detail font family. |
| style.appearance.cssVars[--dag-detail-font-weight] | string | "400" | Detail font weight. |
| style.appearance.cssVars[--dag-detail-font-style] | string | "normal" | Detail font style. |
| style.appearance.cssVars[--dag-date-font-size] | string | "10px" | Date font size. Not used by node-link. |
| style.appearance.cssVars[--dag-date-font-family] | string | "\"IBM Plex Mono\", Consolas, monospace" | Date font family. Not used by node-link. |
| style.appearance.cssVars[--dag-date-font-weight] | string | "400" | Date font weight. Not used by node-link. |
| style.appearance.cssVars[--dag-date-font-style] | string | "normal" | Date font style. Not used by node-link. |
| style.appearance.cssVars[--dag-axis-font-size] | string | "11px" | Axis font size. Not used by node-link. |
| style.appearance.cssVars[--dag-axis-font-family] | string | "\"IBM Plex Mono\", Consolas, monospace" | Axis font family. Not used by node-link. |
| style.appearance.cssVars[--dag-axis-font-weight] | string | "400" | Axis font weight. Not used by node-link. |
| style.appearance.cssVars[--dag-axis-font-style] | string | "normal" | Axis font style. Not used by node-link. |
| style.appearance.cssVars[--dag-track-font-size] | string | "12px" | Track font size. Not used by node-link. |
| style.appearance.cssVars[--dag-track-font-family] | string | "\"IBM Plex Sans\", \"Segoe UI\", sans-serif" | Track font family. Not used by node-link. |
| style.appearance.cssVars[--dag-track-font-weight] | string | "600" | Track font weight. Not used by node-link. |
| style.appearance.cssVars[--dag-track-font-style] | string | "normal" | Track font style. Not used by node-link. |
| style.appearance.cssVars[--dag-flow-active-opacity] | string | "0.8" | Flow active opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-flow-muted-opacity] | string | "0.12" | Flow muted opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-muted-opacity] | string | "0.28" | Timeline muted opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-soft-opacity] | string | "0.24" | Timeline soft opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-hover-opacity] | string | "0.38" | Timeline hover opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-label-opacity] | string | "0.65" | Timeline label opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-edge-opacity] | string | "0.55" | Timeline edge opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-edge-muted-opacity] | string | "0.07" | Timeline edge muted opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-edge-active-opacity] | string | "1" | Timeline edge active opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-edge-width] | string | "1.7px" | Timeline edge width. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-edge-active-width] | string | "2.4px" | Timeline edge active width. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-selection-width] | string | "2.5px" | Timeline selection width. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-dash] | string | "6 4" | Timeline dash. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-reference-dash] | string | "3 5" | Timeline reference dash. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-backward-dash] | string | "6 3" | Timeline backward dash. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-reference-opacity] | string | "0.25" | Timeline reference opacity. Not used by node-link. |
| style.appearance.cssVars[--dag-timeline-leader-dash] | string | "4 3" | Timeline leader dash. Not used by node-link. |
| style.appearance.cssVars[--dag-shadow-color] | string | "24, 39, 64" | Shadow color. |
| style.appearance.cssVars[--dag-shadow-active-offset-scale] | string | "1.5" | Shadow active offset scale. |
| style.appearance.cssVars[--dag-shadow-active-blur-scale] | string | "1.25" | Shadow active blur scale. |
| style.appearance.cssVars[--dag-*] | string | — | Additional map entry. |
| style.appearance.css * | string | ".dag-backdrop { display: none; }\n.dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }" | Saved CSS; at most 50,000 characters; @import is rejected; custom CSS uses the final graph-custom cascade layer. |
| style.appearance.palette | object | — | Category and nested-group color palettes. |
| style.appearance.palette.categories | [number, number, number][] | [[356,58,47],[214,62,44],[145,52,40],[32,66,47],[188,54,42],[265,48,48],[325,48,48],[210,24,44]] | Category HSL swatches [hue, saturation, lightness]. |
| style.appearance.palette.groups | string[][] | [["#fffdf5","#fffbea","#fff7df","#fff4d5"],["#f5fdf9","#edfdf5","#e5fbf0","#dcf8e9"],["#fff9f5","#fff3eb","#ffede1","#ffe7d8"],["#f5fcff","#edf9ff","#e4f6ff","#daf2ff"]] | Group color ramps, indexed by family and nesting depth. Not used by node-link. |
| style.appearance.performance | object | — | performance |
| style.appearance.performance.denseThresholds | [number, number, number] | [220,440,20000000] | Dense-scene thresholds [nodes, edges, area]. |
| style.appearance.performance.denseShadows | preserve \| disable | "disable" | Shadow policy in dense scenes. |

## Complete example

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "node-link",
  "style": {
    "showNodeDetail": false,
    "hideNodeBorders": true,
    "alignNodeWidthsToMax": true,
    "appearance": {
      "version": 1,
      "layout": {
        "stagePadding": [
          108,
          88
        ],
        "columnGap": 64,
        "rowGap": 28,
        "edgeLaneGap": 12,
        "nodeHeight": 48,
        "nodeWidthRange": [
          188,
          240
        ],
        "stageMinSize": [
          980,
          600
        ]
      },
      "display": {
        "titleAlign": "left",
        "titleOverflow": "ellipsis",
        "titleWrap": false,
        "edgeArrowStyle": "open",
        "showNodeDots": true,
        "showEdgeLabels": false,
        "showGroupStats": true,
        "showGroupBorders": true,
        "nodeCornerRadius": 16,
        "nodeShadow": true,
        "shadowBlur": 8,
        "shadowOffset": 3,
        "shadowOpacity": 10,
        "sankeyNodeWidth": 20,
        "sankeyLinkOpacity": 32
      },
      "cssVars": {
        "--dag-text-strong": "#162033",
        "--dag-text-soft": "#8792a2",
        "--dag-edge": "#e1e3e6",
        "--dag-edge-active": "#8b1e2d",
        "--dag-node-fill": "#ffffff",
        "--dag-node-border": "rgba(91, 109, 142, 0.17)",
        "--dag-node-border-strong": "rgba(50, 79, 132, 0.35)",
        "--dag-title-font-family": "\"Times New Roman\", serif",
        "--dag-title-font-size": "15px",
        "--dag-title-font-style": "normal",
        "--dag-title-font-weight": "500",
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
      "css": ".dag-backdrop { display: none; }\n.dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }",
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
