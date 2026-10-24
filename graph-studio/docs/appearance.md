# Appearance and the Shared Style Protocol

This page documents the **canonical v1 style protocol**. Presets, browser storage, style files, models, and Schema editing use this same JSON structure. See [Canonical Appearance Schema](appearance-schema.md) for implementation ownership and validation rules. Old protocol fields are not supported.

## Chart-specific references

| Chart            | Appearance reference                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| Node-link        | [Cards, connections, typography, dimensions](appearance/node-link.md)             |
| Nested node-link | [Cards, groups, frames, titles](appearance/compound.md)                           |
| Sankey           | [Bars, quantitative bands, labels](appearance/sankey.md)                          |
| Timeline         | [Points, intervals, anchors, leaders, time-axis settings](appearance/timeline.md) |
| Spatial          | [Points, edges, labels, data styles, session controls](appearance/spatial.md)     |

The same `GraphAppearance` shape is stored for every chart, but not every field is used by every renderer. A field's presence in an exported file does not imply that the active chart supports it. Settings hides many irrelevant controls.

## Portable file envelope

**Settings > Appearance > Schema** edits the active chart's current v1 style. Its three-rule table keeps each parent and its descendants together, with Field, Type, Current value, and Description columns. Required fields have a red asterisk after their names. Rows stay on one line; horizontal scrolling belongs to the table. Select a preset above the table, or edit individual values. Booleans use switches and enumerations use selectors; numbers, strings, arrays, and maps accept direct edits. Press Enter or leave a field to apply; Escape cancels the draft. Invalid values remain unapplied with an inline error. CSS has a separate editor. Format and version identifiers are read-only.

The **example.json** view follows the current style, with Copy JSON and Download JSON actions. Edits update the right-hand live preview and participate in automatic saving and style undo/redo. The preset selector displays Custom when current values differ from the built-in presets.

Export the current chart's style from **Settings > Appearance > Advanced**. The accepted structure is:

```ts
interface ChartStyleFile {
  format: "graph-studio-style";
  version: 1;
  chartType: "node-link" | "compound" | "sankey" | "timeline" | "spatial";
  style: {
    showNodeDetail: boolean;
    hideNodeBorders: boolean;
    alignNodeWidthsToMax: boolean;
    appearance: {
      version: 1;
      layout: GraphLayoutAppearance;
      display: GraphDisplayAppearance;
      cssVars: Record<string, string>;
      css: string;
    };
    timeline?: TimelineViewSettings;
  };
}
```

The importer requires the three outer booleans, an appearance object with `version: 1`, object-valued `layout`, `display`, and `cssVars`, and a string-valued `css`. The file's chart type must match the import target. The file version and nested appearance version are independently checked.

Here is a complete, importable Node-link style. Empty objects are accepted and receive generic appearance defaults; `css: ""` explicitly supplies no saved custom CSS, while built-in rendering styles still apply.

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "node-link",
  "style": {
    "showNodeDetail": false,
    "hideNodeBorders": false,
    "alignNodeWidthsToMax": true,
    "appearance": {
      "version": 1,
      "layout": { "columnGap": 64, "rowGap": 28, "nodeHeight": 48, "maxNodeWidth": 240 },
      "display": { "nodeCornerRadius": 12, "nodeShadow": true, "showEdgeLabels": true },
      "cssVars": { "--dag-node-fill": "#ffffff", "--dag-text-strong": "#162033" },
      "css": ""
    }
  }
}
```

Omitted optional fields receive the selected chart's schema defaults. Required fields must be present. A bare `GraphAppearance` object is not a valid style document. Unknown fields and invalid values are rejected.

## Style-level options

| Path relative to `style` | Type    | Meaning                                                                       |
| ------------------------ | ------- | ----------------------------------------------------------------------------- |
| `showNodeDetail`         | Boolean | Card descriptions, or Timeline label details where supported.                 |
| `hideNodeBorders`        | Boolean | Inverse visibility flag for ordinary node shapes; `true` hides their borders. |
| `alignNodeWidthsToMax`   | Boolean | Equal card widths in supported card layouts.                                  |
| `appearance`             | Object  | Shared geometry, visual flags, CSS variables, and custom CSS.                 |
| `timeline`               | Object  | Timeline-specific layout, colors, markers, intervals, and label settings.     |

These flags are required in every portable file even for charts where they have little or no visible effect.

## Layout fields

All paths below are relative to `style.appearance.layout`. Numeric dimensions use SVG/chart logical pixels, not screen pixels after zoom.

| Field            | Generic fallback | Purpose                                                  |
| ---------------- | ---------------- | -------------------------------------------------------- |
| `stagePadding`   | `[108, 88]`      | Horizontal and vertical padding `[x, y]`.                |
| `columnGap`      | 116              | Separation between layers where used.                    |
| `rowGap`         | 22               | Separation between nodes or labels, depending on chart.  |
| `edgeLaneGap`    | 28               | Ordinary Node-link edge-lane separation.                 |
| `nodeHeight`     | 74               | Base card height or chart-specific vertical-space input. |
| `minNodeWidth`   | 188              | Minimum ordinary card width.                             |
| `maxNodeWidth`   | 280              | Maximum card/label width where used.                     |
| `stageMinWidth`  | 980              | Minimum stage width where used.                          |
| `stageMinHeight` | 600              | Minimum stage height where used.                         |

The shared sanitizer accepts finite numeric values and supplies fallbacks for missing/nonfinite values. It does **not** enforce all slider ranges or a universal min/max-width relationship. UI ranges and layout-specific clamps are separate. Do not interpret a slider range as a strict file-schema constraint.

`stagePadding: [x, y]` contains exactly two finite numbers. Models, presets, storage, console commands, and renderers use this tuple directly. Separate X/Y properties are rejected.

## Display fields

All paths below are relative to `style.appearance.display`. Defaults are generic sanitizer fallbacks; chart presets override several of them.

| Field               | Type / generic fallback                   | Primary applicability                                                   |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `titleAlign`        | `left` or `center`; `left`                | Compound card titles.                                                   |
| `titleOverflow`     | `ellipsis`, `clip`, `visible`; `ellipsis` | Compound titles.                                                        |
| `titleWrap`         | Boolean; false                            | Compound two-line titles.                                               |
| `edgeArrowStyle`    | `filled` or `open`; `filled`              | Shared ordinary-edge arrow marker.                                      |
| `showNodeDots`      | Boolean; true                             | Node-link and Compound card dots.                                       |
| `showEdgeLabels`    | Boolean; false                            | Relationship-label geometry; chart CSS may further restrict visibility. |
| `showGroupStats`    | Boolean; true                             | Compound group statistics.                                              |
| `showGroupBorders`  | Boolean; true                             | Expanded Compound frames.                                               |
| `nodeCornerRadius`  | Number; 24                                | Node-link and collapsed Compound cards; capped by rendered dimensions.  |
| `nodeShadow`        | Boolean; true                             | Shared node-shape shadow effect.                                        |
| `shadowBlur`        | Number; 8                                 | Shadow softness in logical pixels.                                      |
| `shadowOffset`      | Number; 3                                 | Vertical shadow offset in logical pixels.                               |
| `shadowOpacity`     | Number; 12                                | Shadow opacity in **percent**, not 0-1.                                 |
| `sankeyNodeWidth`   | Number; 20                                | Sankey bar width; exposed under Layout.                                 |
| `sankeyLinkOpacity` | Number; 32                                | Sankey normal band opacity in **percent**.                              |

The shared numeric sanitizer checks finiteness rather than consistently clamping these values. Current sliders include card radius 0-80, shadow blur 0-32, offset 0-16, shadow opacity 0-40%, bar width 0-48, and flow opacity 0-90%. Numeric entry can exceed slider bounds; use sensible nonnegative dimensions and opacity percentages when authoring files.

## CSS variables

`style.appearance.cssVars` is a map of strings. Keys must begin with `--dag-`; values longer than 500 characters are rejected. The protocol does not implement a complete CSS value validator. Color controls perform additional input validation.

| Variable                   | Meaning                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `--dag-node-fill`          | Default card/background fill where consumed.                          |
| `--dag-node-border`        | Default node outline.                                                 |
| `--dag-node-border-strong` | Emphasized/root outline.                                              |
| `--dag-edge`               | Default relation/grid stroke where consumed.                          |
| `--dag-edge-active`        | Active ordinary relation color.                                       |
| `--dag-text-strong`        | Primary text color.                                                   |
| `--dag-text-soft`          | Secondary text color.                                                 |
| `--dag-title-font-family`  | Title font stack.                                                     |
| `--dag-title-font-size`    | CSS length, such as `15px`; Timeline titles use their own fixed size. |
| `--dag-title-font-weight`  | CSS font weight string.                                               |
| `--dag-title-font-style`   | CSS font style string.                                                |

Additional renderer variables exist for category borders, pins, glows, and interaction states. Per-node category tokens can override inherited root tokens. Sankey and Spatial data colors also have their own precedence. A global node-fill setting is not a universal chart palette.

## Custom CSS and precedence

`style.appearance.css` stores stylesheet text of at most 50,000 characters. The protocol rejects longer strings and `@import` statements. This is not a complete CSS isolation or security contract.

The SVG embeds styles in this order: built-in base rules, saved CSS, built-in effects, then Timeline rules. Root CSS variables are applied as inline styles; some data-derived properties and tokens are assigned directly to elements. Normal CSS specificity, inline precedence, and `!important` therefore matter. Custom CSS is not guaranteed to win over every effect; shared shadow rules deliberately use `!important` and disable shadows on dense graphs.

Scope custom selectors to the graph and relevant renderer. Existing hooks include:

| Element                   | Selector/attribute                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------- |
| SVG root                  | `.dag-graph`, `data-layout`, `data-density`, `data-borderless`                        |
| Node group                | `.dag-node`, `data-key`, `data-type`; interaction attributes are updated by the stage |
| Ordinary node shape/title | `.dag-node__shape`, `.dag-node__title`                                                |
| Edge group                | `.dag-edge`, `data-source`, `data-target`, `data-active`                              |
| Ordinary edge path        | `.dag-edge__path`                                                                     |
| Sankey band               | `.dag-edge__flow`                                                                     |
| Timeline event            | `.timeline-node`                                                                      |
| Spatial point/label       | `.spatial-point`, `.spatial-label`                                                    |

`data-layout` is the renderer key: Node-link uses `level`, `sugiyama`, or `dagre`; other charts use their chart ID. A proposed `data-chart-type` or `data-element` contract is not implemented. Check chart-specific pages before writing selectors.

Editing CSS replaces the saved CSS string on Apply. Append to an exported stylesheet if you want to retain its previous preset-specific rules. CSS drafts are not applied until explicitly submitted.

## Defaults, presets, and reset

Each chart owns an independent profile and in-session appearance history. The current preset IDs are `default` for every chart and `preset-2` for Compound and Timeline. Older preset names in archived guides are not current APIs.

The whole-style reset restores that chart's Default profile. Section reset targets selected appearance/display/timeline fields and preserves custom CSS. Consequently, custom CSS can still visually override a field after its section has been reset. Timeline's Layout-section reset currently resets shared layout fields; it is not a blanket reset of every `style.timeline` layout option.

Slider gestures are grouped into appearance undo transactions. Timeline control changes and presets also interact with the Timeline settings state; a style export captures its current values. Graph data edits and appearance changes use separate histories.

## Linked styles and persistence

Add a relative reference such as `metadata.style: "styles/example.style.json"` to graph JSON. The resolver reads only files available in the opened workspace; it does not fetch URLs. It requires a `.json` path, rejects query/fragment suffixes, and limits a linked style file to 16 MB. The file must match the graph's inferred initial chart type.

A missing, inaccessible, malformed, or mismatched style produces a notice while leaving the graph usable. A linked style temporarily supplies the document's profile; leaving that document restores the user's chart preference. Editing the appearance does not automatically rewrite the linked style file: export the updated style separately.

Unlinked chart preferences are saved in browser preferences. Spatial camera controls are session state, not `ChartStyle` fields. Timeline pins are normally document-local view state, but the current style exporter serializes the full `style.timeline` object, including `pins`; clear them to `{}` when publishing a reusable style.

## Preview and export

Settings uses the graph renderer for sample previews. Colors update without geometry work; geometry and font changes can require remeasurement/layout. The preview has independent sample navigation and CSS isolation.

Saving graph JSON preserves data and style references, not the current global style profile. Style export produces JSON for the active chart only. SVG and interactive HTML exports retain the current visible geometry and applicable rendered styles. Fonts still depend on available fonts unless separately provided.

## Implementation references

[Appearance model and sanitizer](../src/graph/appearance.ts), [chart defaults](../src/state/chartStyles.ts), [style file parser](../src/state/chartStyleFile.ts), [controller and export](../src/controllers/useChartPreferences.ts), [section resets](../src/components/settings/appearanceSections.ts), [style injection](../src/rendering/GraphDefs.tsx).
