# Timeline Appearance

Portable files use `chartType: "timeline"`. Timeline combines shared `style.appearance` tokens with a dedicated `style.timeline` object. Do not put these options in graph `metadata.timeline`; that object describes the clock. See the [Timeline data protocol](../charts/timeline.md) and [shared style envelope](../appearance.md).

## Visual model

Point events, interval bars, time anchors, label leaders, relationship paths, track guides, and the ruler are distinct elements. A point marker's size is independent of an interval's thickness. A leader links a displaced label to its exact time; it is not a graph relationship.

Colors can follow Track or Type. Interval title colors may follow the theme, the interval color, or a custom color. Shared node-fill and edge tokens also affect label backgrounds and ruler/grid styling, so their meaning differs from ordinary cards.

## Event colors and interval fields

All field paths in this and the next three tables are relative to `style.timeline`. Defaults below are from the current sanitizer.

| Field                   | Accepted values / default                    | Meaning                                                       |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `colorBy`               | `track`, `type`; `track`                     | Category source for event colors.                             |
| `typeColors`            | String-to-color map; `{}`                    | Explicit Type color overrides, used when `colorBy` is `type`. |
| `intervalWidth`         | Finite number; 12                            | Bar thickness across the time axis, in logical pixels.        |
| `intervalStyle`         | `soft`, `solid`, `outline`; `soft`           | Bar fill treatment.                                           |
| `intervalBorder`        | `auto`, `none`, `solid`, `dashed`; `auto`    | Border treatment; auto follows fill style.                    |
| `intervalBorderWidth`   | Number clamped to 0-20; 1.5                  | Border width.                                                 |
| `intervalBorderColor`   | Color string; empty                          | Empty uses renderer fallback.                                 |
| `intervalRadius`        | Number clamped to 0-120; 4                   | Interval rounding, subject to geometry.                       |
| `intervalTitle`         | `outside`, `inside`, `hidden`; `outside`     | Label placement/visibility.                                   |
| `intervalAlign`         | `start`, `center`, `end`; `center`           | Inside-title alignment along the interval.                    |
| `intervalTextColorMode` | `theme`, `event`, `custom`; normally `theme` | Source of interval title color.                               |
| `intervalTextColor`     | Color string; empty                          | Explicit custom title color.                                  |

If `intervalTextColorMode` is omitted but a valid `intervalTextColor` is supplied, the sanitizer selects `custom`. Event mode follows the current event color. Inside titles show the title only and clip to the true interval; they do not extend the duration to fit text. Ongoing/clipped endpoints keep their open-ended indicators.

The current default thickness is **12 px**. The bar-width slider spans 0-240, but the underlying finite-number sanitizer is not a strict 0-240 file constraint. Historical documentation describing a 36 px default is outdated.

## Marker objects

`pointMarker` and `anchorMarker` share the following structure. Point markers represent instants. Anchor markers represent interval endpoints and interior relationship attachments.

| Subfield      | Accepted values                       | Point default | Anchor default |
| ------------- | ------------------------------------- | ------------- | -------------- |
| `visible`     | Boolean                               | true          | true           |
| `shape`       | `auto`, `circle`, `square`, `diamond` | `circle`      | `auto`         |
| `size`        | Number clamped to 0-120               | 12            | 8              |
| `fill`        | Color string                          | Empty         | Empty          |
| `borderColor` | Color string                          | Empty         | Empty          |
| `borderWidth` | Number clamped to 0-20                | 1.5           | 1.5            |

For point markers, `auto` normalizes to `circle`; automatic anchor geometry can distinguish endpoint meanings. Empty colors allow contextual fallbacks. Hiding markers does not remove events or relationship anchors from the data.

## Point text and leaders

| Field              | Accepted values / default          | Meaning                           |
| ------------------ | ---------------------------------- | --------------------------------- |
| `pointTextColor`   | Color string; empty                | Point title override.             |
| `pointDateVisible` | Boolean; true                      | Point date/time label visibility. |
| `pointDateColor`   | Color string; empty                | Date/time text override.          |
| `leaderStyle`      | `none`, `solid`, `dashed`; `solid` | Label-to-time leader line.        |
| `leaderColor`      | Color string; empty                | Leader color override.            |
| `leaderWidth`      | Number clamped to 0-20; 0.7        | Leader stroke width.              |

`style.showNodeDetail` controls additional label descriptions and defaults to false for Timeline. It is outside `style.timeline` in the current protocol.

Timeline color sanitization accepts hex forms with 3, 4, 6, or 8 digits and numeric `rgb(...)`/`rgba(...)` syntax. Invalid values become an empty fallback. Named colors, token references, and `var(...)` are not accepted by these dedicated color fields. This differs from the generic CSS-variable string map.

## Layout and axis settings stored alongside appearance

These are currently part of the same `style.timeline` object even though they affect layout rather than paint.

| Field              | Values / default                                                           | Meaning                                                                      |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `layout`           | `tracks`, `flow`; `tracks`                                                 | Arrangement model.                                                           |
| `orientation`      | `vertical`, `horizontal`; `vertical`                                       | Direction of increasing time.                                                |
| `edgeRouting`      | `avoid`, `direct`; `avoid`                                                 | Relationship routing.                                                        |
| `axis`             | `linear`, `adaptive`; `adaptive`                                           | Time-to-distance mapping.                                                    |
| `tickStep`         | Finite number; 10                                                          | Calendar tick interval input.                                                |
| `tickUnit`         | `auto`, `second`, `minute`, `hour`, `day`, `week`, `month`, `year`; `auto` | Calendar tick unit.                                                          |
| `relativeTickStep` | Finite number; 1                                                           | Relative tick interval in native clock units.                                |
| `nodeGap`          | Finite number; 24                                                          | Channel/node spacing input.                                                  |
| `horizontalSpread` | Finite number; 1                                                           | Cross-time-axis spread multiplier; orientation changes its screen direction. |
| `compactness`      | Finite number; 0.5                                                         | Layout compactness input.                                                    |
| `locked`           | Boolean; false                                                             | Retains the current time-axis mapping where supported.                       |
| `pins`             | Node-ID-to-finite-number map; `{}`                                         | Temporary cross-axis positions.                                              |

Use positive tick steps; calendar fixed steps are intended as positive integers. The sanitizer only checks finiteness for several numeric fields, so layout and UI constraints must not be mistaken for strict importer ranges. Explicit `nodes[id].space` indices take precedence over pins.

The shared Layout controls also expose `appearance.layout.maxNodeWidth` as Event label width, `nodeHeight` as Timeline vertical spacing, and `rowGap` as Label spacing. Saved Arrange plans in graph `metadata.layout.timeline` are a separate mechanism with their own validation and bounds.

## Shared typography and CSS

Timeline titles consume `--dag-title-font-family`, `--dag-title-font-style`, and `--dag-title-font-weight`. Their base font size is 13 px in Timeline CSS; the generic title-size control is omitted. The ruler/date labels use their own smaller monospace typography.

`--dag-text-strong` and `--dag-text-soft` provide text fallbacks. `--dag-node-fill` supplies backgrounds, and `--dag-edge` supplies grid/axis styling. These tokens do not replace Track/Type event colors.

Useful selectors include `.timeline-node__duration`, `.timeline-node__point`, `.timeline-node__title`, `.timeline-node__inside-title`, `.timeline-node__date`, `.timeline-node__leader`, and `.dag-edge__timeline`. Scope rules with `.dag-graph[data-layout="timeline"]`. Built-in Timeline CSS follows saved custom CSS, so equal-specificity custom rules can be overridden.

`appearance.display.showEdgeLabels` enables relationship-label geometry, but Timeline CSS normally reveals relationship labels only on active edges. Ordinary card radius, shadows, border toggles, and equal widths are not Timeline marker controls.

## Complete style example

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
      "layout": { "maxNodeWidth": 280 },
      "display": { "showEdgeLabels": true },
      "cssVars": { "--dag-title-font-family": "Inter, sans-serif", "--dag-title-font-style": "normal" },
      "css": ""
    },
    "timeline": {
      "layout": "flow",
      "orientation": "horizontal",
      "axis": "linear",
      "edgeRouting": "direct",
      "colorBy": "type",
      "intervalWidth": 24,
      "intervalStyle": "soft",
      "intervalBorder": "solid",
      "intervalRadius": 0,
      "intervalTitle": "inside",
      "intervalTextColorMode": "event",
      "pointMarker": { "shape": "diamond", "size": 10 },
      "anchorMarker": { "visible": false },
      "pins": {}
    }
  }
}
```

## Presets, resets, and persistence

Default uses Tracks, vertical orientation, adaptive time, 12 px interval bars, and 4 px corners. Preset 2 uses horizontal orientation, direct edges, Type colors, 24 px intervals, a 1 px solid border, square corners, inside event-colored titles, hidden anchors, a linear axis, zero node gap/spread, and italic Times New Roman. Preset 2 retains the default Tracks arrangement.

Nodes reset covers event colors, point markers, and interval shape. Edges reset covers anchor markers and leaders along with shared edge options. Text reset covers interval/point labels, descriptions, and shared fonts. Whole-style reset also restores Timeline layout settings. Layout-section reset currently does not reset every field in `style.timeline`; use individual controls or whole-style reset as appropriate.

The exporter includes the current complete Timeline settings, including `pins`. Browser/document handling normally keeps pins local, but a portable file can carry them. Set `pins: {}` before sharing a reusable style. Times, tracks, explicit row indices, clock semantics, and saved Arrange plans remain in graph JSON. SVG/HTML export preserves the current visible time mapping and styles.

Sources: [Timeline settings and defaults](../../src/graph/timelineSettings.ts), [Timeline CSS](../../src/rendering/timelineStyles.ts), [presets](../../src/state/chartStyles.ts), [export controller](../../src/controllers/useChartPreferences.ts).
