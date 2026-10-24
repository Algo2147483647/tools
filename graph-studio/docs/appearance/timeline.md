# Timeline Appearance

Generated from the canonical field definitions. Required fields are marked with an asterisk. Numeric font sizes use explicit pixel units. Unsupported shared fields are read-only for this chart; the document retains a common appearance shape.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| format * | graph-studio-style | "graph-studio-style" | Style document format. |
| version * | 1 | 1 | Style protocol version. |
| chartType * | timeline | "timeline" | Chart renderer. |
| style * | object | — | Complete chart style. |
| style.showNodeDetail * | boolean | false | Show node descriptions. |
| style.hideNodeBorders * | boolean | true | Hide ordinary node borders. Not used by timeline. |
| style.alignNodeWidthsToMax * | boolean | false | Align card widths to the configured maximum. Not used by timeline. |
| style.appearance * | object | — | Shared appearance object; includes stored fields unused by some charts. |
| style.appearance.version * | 1 | 1 | Nested appearance protocol version. |
| style.appearance.layout * | object | — | Stored geometry values; renderer support varies by chart. |
| style.appearance.layout.stagePadding | [number, number] | [108,88] | Horizontal and vertical stage padding [x, y] in logical pixels. |
| style.appearance.layout.columnGap | number | 116 | Layer separation in logical pixels. Not used by timeline. |
| style.appearance.layout.rowGap | number | 22 | Node or label separation in logical pixels. |
| style.appearance.layout.edgeLaneGap | number | 28 | Ordinary Node-link edge-lane separation in logical pixels. Not used by timeline. |
| style.appearance.layout.nodeHeight | number | 74 | Base card height or chart-specific vertical-space input. |
| style.appearance.layout.nodeWidthRange | [number, number] | [188,280] | Node width bounds [min, max]; max sets the event label width. |
| style.appearance.layout.stageMinSize | [number, number] | [980,600] | Minimum stage dimensions [width, height] in logical pixels. |
| style.appearance.display * | object | — | Display flags and visual dimensions; unsupported fields remain stored. |
| style.appearance.display.titleAlign | left \| center | "left" | Nested node-link card-title alignment. Not used by timeline. |
| style.appearance.display.titleOverflow | ellipsis \| clip \| visible | "ellipsis" | Nested node-link title overflow treatment. Not used by timeline. |
| style.appearance.display.titleWrap | boolean | false | Enables two-line titles in Nested node-link. Not used by timeline. |
| style.appearance.display.edgeArrowStyle | filled \| open | "filled" | Shape of the shared ordinary-edge arrowhead. |
| style.appearance.display.showNodeDots | boolean | true | Card dots and corresponding content offset. Not used by timeline. |
| style.appearance.display.showEdgeLabels | boolean | false | Enables relation-label geometry; Timeline reveals labels on active edges. |
| style.appearance.display.showGroupStats | boolean | true | Nested node-link group statistics. Not used by timeline. |
| style.appearance.display.showGroupBorders | boolean | true | Expanded Nested node-link container borders. Not used by timeline. |
| style.appearance.display.nodeCornerRadius | number | 24 | Ordinary/collapsed card radius, capped at half the smaller rendered dimension. Not used by timeline. |
| style.appearance.display.nodeShadow | boolean | true | Shared node-shape shadows; dense scenes suppress them. Not used by timeline. |
| style.appearance.display.shadowBlur | number | 8 | Shadow softness in logical pixels. Not used by timeline. |
| style.appearance.display.shadowOffset | number | 3 | Vertical shadow distance in logical pixels. Not used by timeline. |
| style.appearance.display.shadowOpacity | number | 12 | Shadow opacity as a percentage, not a 0–1 fraction. Not used by timeline. |
| style.appearance.display.sankeyNodeWidth | number | 20 | Sankey bar width in logical pixels; exposed under Layout. Not used by timeline. |
| style.appearance.display.sankeyLinkOpacity | number | 32 | Sankey normal-band opacity as a percentage; interaction has separate opacity rules. Not used by timeline. |
| style.appearance.cssVars * | object | — | SVG root CSS variables; only --dag- names with string values are accepted. |
| style.appearance.cssVars[--dag-text-strong] | string | "#162033" | Primary text color. |
| style.appearance.cssVars[--dag-text-soft] | string | "#8792a2" | Secondary text color. |
| style.appearance.cssVars[--dag-edge] | string | "rgba(76, 96, 132, 0.24)" | Default ordinary-edge or axis/grid color where consumed. |
| style.appearance.cssVars[--dag-edge-active] | string | "rgba(41, 92, 207, 0.72)" | Active ordinary-edge color; explicit data strokes can take precedence. |
| style.appearance.cssVars[--dag-node-fill] | string | "#ffffff" | Card/background fill; does not replace Sankey or Spatial data colors. |
| style.appearance.cssVars[--dag-node-border] | string | "rgba(91, 109, 142, 0.17)" | Ordinary card outline; per-node category tokens can override it. Not used by timeline. |
| style.appearance.cssVars[--dag-node-border-strong] | string | "rgba(50, 79, 132, 0.35)" | Emphasized/root card outline. Not used by timeline. |
| style.appearance.cssVars[--dag-title-font-family] | string | "\"Georgia\", serif" | Title font stack; installed fonts determine rendering. |
| style.appearance.cssVars[--dag-title-font-size] | string | "13px" | Title size in logical pixels, shared by measurement and rendering. |
| style.appearance.cssVars[--dag-title-font-style] | string | "normal" | Title font style as a CSS string. |
| style.appearance.cssVars[--dag-title-font-weight] | string | "400" | Title font weight as a CSS string. |
| style.appearance.cssVars[--dag-detail-font-size] | string | "10px" | Detail font size. |
| style.appearance.cssVars[--dag-detail-font-family] | string | "\"IBM Plex Sans\", \"Segoe UI\", sans-serif" | Detail font family. |
| style.appearance.cssVars[--dag-detail-font-weight] | string | "400" | Detail font weight. |
| style.appearance.cssVars[--dag-detail-font-style] | string | "normal" | Detail font style. |
| style.appearance.cssVars[--dag-date-font-size] | string | "10px" | Date font size. |
| style.appearance.cssVars[--dag-date-font-family] | string | "\"IBM Plex Mono\", Consolas, monospace" | Date font family. |
| style.appearance.cssVars[--dag-date-font-weight] | string | "400" | Date font weight. |
| style.appearance.cssVars[--dag-date-font-style] | string | "normal" | Date font style. |
| style.appearance.cssVars[--dag-axis-font-size] | string | "11px" | Axis font size. |
| style.appearance.cssVars[--dag-axis-font-family] | string | "\"IBM Plex Mono\", Consolas, monospace" | Axis font family. |
| style.appearance.cssVars[--dag-axis-font-weight] | string | "400" | Axis font weight. |
| style.appearance.cssVars[--dag-axis-font-style] | string | "normal" | Axis font style. |
| style.appearance.cssVars[--dag-track-font-size] | string | "12px" | Track font size. |
| style.appearance.cssVars[--dag-track-font-family] | string | "\"IBM Plex Sans\", \"Segoe UI\", sans-serif" | Track font family. |
| style.appearance.cssVars[--dag-track-font-weight] | string | "600" | Track font weight. |
| style.appearance.cssVars[--dag-track-font-style] | string | "normal" | Track font style. |
| style.appearance.cssVars[--dag-flow-active-opacity] | string | "0.8" | Flow active opacity. Not used by timeline. |
| style.appearance.cssVars[--dag-flow-muted-opacity] | string | "0.12" | Flow muted opacity. Not used by timeline. |
| style.appearance.cssVars[--dag-timeline-muted-opacity] | string | "0.28" | Timeline muted opacity. |
| style.appearance.cssVars[--dag-timeline-soft-opacity] | string | "0.24" | Timeline soft opacity. |
| style.appearance.cssVars[--dag-timeline-hover-opacity] | string | "0.38" | Timeline hover opacity. |
| style.appearance.cssVars[--dag-timeline-label-opacity] | string | "0.65" | Timeline label opacity. |
| style.appearance.cssVars[--dag-timeline-edge-opacity] | string | "0.55" | Timeline edge opacity. |
| style.appearance.cssVars[--dag-timeline-edge-muted-opacity] | string | "0.07" | Timeline edge muted opacity. |
| style.appearance.cssVars[--dag-timeline-edge-active-opacity] | string | "1" | Timeline edge active opacity. |
| style.appearance.cssVars[--dag-timeline-edge-width] | string | "1.7px" | Timeline edge width. |
| style.appearance.cssVars[--dag-timeline-edge-active-width] | string | "2.4px" | Timeline edge active width. |
| style.appearance.cssVars[--dag-timeline-selection-width] | string | "2.5px" | Timeline selection width. |
| style.appearance.cssVars[--dag-timeline-dash] | string | "6 4" | Timeline dash. |
| style.appearance.cssVars[--dag-timeline-reference-dash] | string | "3 5" | Timeline reference dash. |
| style.appearance.cssVars[--dag-timeline-backward-dash] | string | "6 3" | Timeline backward dash. |
| style.appearance.cssVars[--dag-timeline-reference-opacity] | string | "0.25" | Timeline reference opacity. |
| style.appearance.cssVars[--dag-timeline-leader-dash] | string | "4 3" | Timeline leader dash. |
| style.appearance.cssVars[--dag-shadow-color] | string | "24, 39, 64" | Shadow color. Not used by timeline. |
| style.appearance.cssVars[--dag-shadow-active-offset-scale] | string | "1.5" | Shadow active offset scale. Not used by timeline. |
| style.appearance.cssVars[--dag-shadow-active-blur-scale] | string | "1.25" | Shadow active blur scale. Not used by timeline. |
| style.appearance.cssVars[--dag-*] | string | — | Additional map entry. |
| style.appearance.css * | string | "" | Saved CSS; at most 50,000 characters; @import is rejected; custom CSS uses the final graph-custom cascade layer. |
| style.appearance.palette | object | — | Category and nested-group color palettes. |
| style.appearance.palette.categories | [number, number, number][] | [[356,58,47],[214,62,44],[145,52,40],[32,66,47],[188,54,42],[265,48,48],[325,48,48],[210,24,44]] | Category HSL swatches [hue, saturation, lightness]. |
| style.appearance.palette.groups | string[][] | [["#fffdf5","#fffbea","#fff7df","#fff4d5"],["#f5fdf9","#edfdf5","#e5fbf0","#dcf8e9"],["#fff9f5","#fff3eb","#ffede1","#ffe7d8"],["#f5fcff","#edf9ff","#e4f6ff","#daf2ff"]] | Group color ramps, indexed by family and nesting depth. Not used by timeline. |
| style.appearance.performance | object | — | performance |
| style.appearance.performance.denseThresholds | [number, number, number] | [220,440,20000000] | Dense-scene thresholds [nodes, edges, area]. |
| style.appearance.performance.denseShadows | preserve \| disable | "disable" | Shadow policy in dense scenes. |
| style.timeline | object | — | Timeline-specific geometry, event colors, markers and text settings. |
| style.timeline.layout | tracks \| flow | "tracks" | Tracks groups by track; Flow arranges connected event chains. |
| style.timeline.orientation | vertical \| horizontal | "vertical" | Direction of increasing time; text remains upright. |
| style.timeline.edgeRouting | avoid \| direct | "avoid" | Routes between time anchors directly or around obstacles. |
| style.timeline.colorBy | track \| type | "track" | Uses Track or Type categories for event color. |
| style.timeline.typeColors | object | — | Type-name color overrides, used only when colorBy is type. |
| style.timeline.typeColors[type] | string | — | Additional map entry. |
| style.timeline.intervalWidth | number | 12 | Interval thickness across the time axis; never changes its duration. |
| style.timeline.intervalTitle | outside \| inside \| hidden | "outside" | Outside shows title/time; inside clips the title to the true interval; hidden omits it. |
| style.timeline.intervalAlign | start \| center \| end | "center" | Inside-title alignment along the interval. |
| style.timeline.intervalStyle | soft \| solid \| outline | "soft" | Interval fill treatment. |
| style.timeline.intervalBorder | auto \| none \| solid \| dashed | "auto" | Interval outline treatment; auto follows fill style. |
| style.timeline.intervalBorderWidth | number | 1.5 | Interval stroke width, valid from 0–20 px. |
| style.timeline.intervalBorderColor | string | "" | Interval border override; empty uses the renderer fallback. |
| style.timeline.intervalRadius | number | 4 | Interval corner radius, valid from 0–120 px. |
| style.timeline.intervalTextColor | string | "" | Custom interval title color; empty uses the fallback. |
| style.timeline.intervalTextColorMode | theme \| event \| custom | "theme" | Selects theme, event color or explicit custom text color. |
| style.timeline.pointMarker | object | — | Marker for an instant event. |
| style.timeline.pointMarker.visible | boolean | true | Marker visibility; hiding a marker does not remove its time anchor. |
| style.timeline.pointMarker.shape | auto \| circle \| square \| diamond | "circle" | Marker shape; auto resolves contextually for anchors and to circle for points. |
| style.timeline.pointMarker.size | number | 12 | Marker size, valid from 0–120 logical pixels. |
| style.timeline.pointMarker.fill | string | "" | Marker fill override; empty follows contextual color. |
| style.timeline.pointMarker.borderColor | string | "" | Marker border override; empty uses the fallback. |
| style.timeline.pointMarker.borderWidth | number | 1.5 | Marker border width, valid from 0–20 px. |
| style.timeline.anchorMarker | object | — | Markers for interval boundaries and interior attachments. |
| style.timeline.anchorMarker.visible | boolean | true | Marker visibility; hiding a marker does not remove its time anchor. |
| style.timeline.anchorMarker.shape | auto \| circle \| square \| diamond | "auto" | Marker shape; auto resolves contextually for anchors and to circle for points. |
| style.timeline.anchorMarker.size | number | 8 | Marker size, valid from 0–120 logical pixels. |
| style.timeline.anchorMarker.fill | string | "" | Marker fill override; empty follows contextual color. |
| style.timeline.anchorMarker.borderColor | string | "" | Marker border override; empty uses the fallback. |
| style.timeline.anchorMarker.borderWidth | number | 1.5 | Marker border width, valid from 0–20 px. |
| style.timeline.pointTextColor | string | "" | Point-title color override; empty follows theme. |
| style.timeline.pointDateVisible | boolean | true | Shows the point's date/time text. |
| style.timeline.pointDateColor | string | "" | Point date/time color override. |
| style.timeline.leaderStyle | none \| solid \| dashed | "solid" | Label-to-time leader line, independent of graph relationships. |
| style.timeline.leaderColor | string | "" | Leader line color override. |
| style.timeline.leaderWidth | number | 0.7 | Leader stroke width, valid from 0–20 px. |
| style.timeline.relativeTickStep | number | 1 | Positive tick step in the relative clock's native units. |
| style.timeline.axis | linear \| adaptive | "adaptive" | Linear preserves elapsed-time scale; adaptive compresses sparse periods. |
| style.timeline.tickStep | number | 10 | Positive calendar tick interval; fixed intervals use integer steps. |
| style.timeline.tickUnit | auto \| second \| minute \| hour \| day \| week \| month \| year | "auto" | Calendar tick unit; auto chooses a suitable unit. |
| style.timeline.nodeGap | number | 24 | Channel spacing input in logical pixels. |
| style.timeline.horizontalSpread | number | 1 | Cross-time-axis spread multiplier, interpreted for the selected orientation. |
| style.timeline.compactness | number | 0.5 | Timeline layout compactness input. |
| style.timeline.locked | boolean | false | Retains the current time-axis mapping where supported. |
| style.timeline.pins | object | — | Node-to-position map; clear temporary pins before publishing a reusable style. |
| style.timeline.pins[id] | number | — | Additional map entry. |

## Complete example

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "timeline",
  "style": {
    "showNodeDetail": false,
    "hideNodeBorders": true,
    "alignNodeWidthsToMax": false,
    "appearance": {
      "version": 1,
      "layout": {
        "stagePadding": [
          108,
          88
        ],
        "columnGap": 116,
        "rowGap": 22,
        "edgeLaneGap": 28,
        "nodeHeight": 74,
        "nodeWidthRange": [
          188,
          280
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
        "edgeArrowStyle": "filled",
        "showNodeDots": true,
        "showEdgeLabels": false,
        "showGroupStats": true,
        "showGroupBorders": true,
        "nodeCornerRadius": 24,
        "nodeShadow": true,
        "shadowBlur": 8,
        "shadowOffset": 3,
        "shadowOpacity": 12,
        "sankeyNodeWidth": 20,
        "sankeyLinkOpacity": 32
      },
      "cssVars": {
        "--dag-text-strong": "#162033",
        "--dag-text-soft": "#8792a2",
        "--dag-edge": "rgba(76, 96, 132, 0.24)",
        "--dag-edge-active": "rgba(41, 92, 207, 0.72)",
        "--dag-node-fill": "#ffffff",
        "--dag-node-border": "rgba(91, 109, 142, 0.17)",
        "--dag-node-border-strong": "rgba(50, 79, 132, 0.35)",
        "--dag-title-font-family": "\"Georgia\", serif",
        "--dag-title-font-size": "13px",
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
      "css": "",
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
    },
    "timeline": {
      "layout": "tracks",
      "orientation": "vertical",
      "edgeRouting": "avoid",
      "colorBy": "track",
      "typeColors": {},
      "intervalWidth": 12,
      "intervalTitle": "outside",
      "intervalAlign": "center",
      "intervalStyle": "soft",
      "intervalBorder": "auto",
      "intervalBorderWidth": 1.5,
      "intervalBorderColor": "",
      "intervalRadius": 4,
      "intervalTextColor": "",
      "intervalTextColorMode": "theme",
      "pointMarker": {
        "visible": true,
        "shape": "circle",
        "size": 12,
        "fill": "",
        "borderColor": "",
        "borderWidth": 1.5
      },
      "anchorMarker": {
        "visible": true,
        "shape": "auto",
        "size": 8,
        "fill": "",
        "borderColor": "",
        "borderWidth": 1.5
      },
      "pointTextColor": "",
      "pointDateVisible": true,
      "pointDateColor": "",
      "leaderStyle": "solid",
      "leaderColor": "",
      "leaderWidth": 0.7,
      "relativeTickStep": 1,
      "axis": "adaptive",
      "tickStep": 10,
      "tickUnit": "auto",
      "nodeGap": 24,
      "horizontalSpread": 1,
      "compactness": 0.5,
      "locked": false,
      "pins": {}
    }
  }
}
```
