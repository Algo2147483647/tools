# Graph Appearance System

This document describes the CSS-first graph UI configuration system in DAG Studio. It covers the appearance data model, settings UI, console commands, AI integration, persistence, export behavior, and safety rules.

For graph JSON shape, see [Data Format Guide](data-format.md). For console syntax, see [Graph Console DSL](graph-console-dsl.md).

## Overview

DAG Studio separates graph data from graph appearance.

| Area | Stored In | Purpose |
| --- | --- | --- |
| Graph data | The opened or saved graph JSON file | Nodes, fields, parent/child relations, and edge metadata |
| Graph appearance | Page preferences and optional downloaded appearance JSON | Layout dimensions, display flags, CSS variables, and custom graph CSS |

Appearance changes do not rewrite graph JSON. They affect how the current graph is rendered and how exported SVG output looks.

## Appearance Document

The editable appearance object is `GraphAppearance`.

```ts
interface GraphAppearance {
  version: 1;
  layout: GraphLayoutAppearance;
  display: GraphDisplayAppearance;
  cssVars: Record<string, string>;
  css: string;
}
```

A downloaded appearance file has the same shape:

```json
{
  "version": 1,
  "layout": {
    "stagePaddingX": 96,
    "stagePaddingY": 80,
    "columnGap": 220,
    "rowGap": 42,
    "edgeLaneGap": 18,
    "nodeHeight": 92,
    "minNodeWidth": 172,
    "maxNodeWidth": 360,
    "stageMinWidth": 960,
    "stageMinHeight": 620
  },
  "display": {
    "showEdgeLabels": true
  },
  "cssVars": {
    "--dag-node-fill": "#ffffff",
    "--dag-node-border": "#d8dee8",
    "--dag-edge": "#8a95a6",
    "--dag-title-font-family": "Inter, system-ui, sans-serif"
  },
  "css": ".dag-node[data-selected=\"true\"] .dag-node-card { stroke-width: 2.5; }"
}
```

## Layout Appearance

Layout values are sanitized before use. Invalid, missing, or out-of-range values fall back to safe defaults.

| Key | Meaning |
| --- | --- |
| `stagePaddingX` | Horizontal padding around the rendered graph |
| `stagePaddingY` | Vertical padding around the rendered graph |
| `columnGap` | Horizontal distance between graph layers |
| `rowGap` | Vertical distance between sibling rows |
| `edgeLaneGap` | Spacing between bundled edge lanes |
| `nodeHeight` | Base node height used by the layout engine |
| `minNodeWidth` | Minimum node width |
| `maxNodeWidth` | Maximum node width |
| `stageMinWidth` | Minimum SVG stage width |
| `stageMinHeight` | Minimum SVG stage height |

## Display Appearance

Display flags control graph visibility choices that are not layout geometry or raw CSS.

| Key | Meaning |
| --- | --- |
| `showEdgeLabels` | Whether relation-value edge labels are rendered |

## CSS Variables

Appearance variables are injected as inline style values on the graph SVG root. Only `--dag-*` variables are accepted by the sanitizer.

Common variables:

| Variable | Purpose |
| --- | --- |
| `--dag-text-strong` | Primary graph text |
| `--dag-text-soft` | Secondary graph text |
| `--dag-edge` | Default edge stroke |
| `--dag-edge-active` | Active or related edge stroke |
| `--dag-node-fill` | Default node fill |
| `--dag-node-border` | Default node border |
| `--dag-node-border-strong` | Focused or emphasized node border |
| `--dag-title-font-family` | Graph title font family |
| `--dag-title-font-size` | Graph title font size |
| `--dag-title-font-weight` | Graph title font weight |
| `--dag-title-font-style` | Graph title font style |

Rendering also exposes state-specific variables such as `--dag-node-root-fill`, `--dag-node-active-fill`, `--dag-node-active-border`, `--dag-node-pin-fill`, and `--dag-node-affordance-fill`.

## Stable SVG Contract

Custom CSS should target stable `dag-*` classes and data attributes.

| Element | Selectors and Attributes |
| --- | --- |
| Stage root | `.dag-graph`, `data-layout`, `data-density`, `data-borderless`, `data-has-interactive-node` |
| Backdrop | `.dag-backdrop` |
| Edge lane | `.dag-lane` |
| Edge group | `.dag-edge`, `data-source`, `data-target`, `data-weight`, `data-label`, `data-active` |
| Node group | `.dag-node`, `data-key`, `data-type`, `data-root`, `data-selected`, `data-focused`, `data-hovered`, `data-connected`, `data-layer`, `data-order` |
| Node card | `.dag-node-card` |
| Node title | `.dag-node-title` |
| Node type | `.dag-node-type` |
| Node body | `.dag-node-body` |

Example:

```css
.dag-node[data-type="api"] .dag-node-card {
  fill: #f5fbff;
  stroke: #3a86ff;
}

.dag-edge[data-active="true"] path {
  stroke-width: 2.4;
}
```

## Settings UI

The settings dialog has an `Appearance` tab for graph UI configuration.

| Section | Purpose |
| --- | --- |
| UI Configuration | Import, export, or reset the whole appearance object |
| Layout | Choose the graph layout engine |
| Layout Tuning | Adjust spacing and node sizing values |
| Presets | Apply built-in appearance presets |
| Tokens | Edit common CSS variables without writing CSS |
| Custom CSS | Replace the graph CSS block directly |
| Title | Configure graph title typography |
| View | Toggle node detail, borders, width alignment, and edge labels |

`Import`, `Export`, and `Reset` are intentionally grouped under `UI Configuration` because they apply to the whole appearance object, not just layout tuning.

Built-in presets:

| Preset | Intent |
| --- | --- |
| `simple` | Minimal graph styling with hidden pins and labels |
| `compact` | Denser node spacing |
| `default` | Balanced default UI |
| `slate` | Quiet dark-neutral reading surface |
| `blueprint` | Technical diagram look |
| `contrast` | High-contrast inspection mode |
| `presentation` | Larger, display-oriented graph styling |

## Console Commands

The console can modify graph appearance directly.

| Command | Effect |
| --- | --- |
| `/layout <key> <number>` | Set one layout appearance number |
| `/style-var <var> <value>` | Set a `--dag-*` CSS variable |
| `/style-var --unset <var>` | Remove a custom CSS variable override |
| `/style-css show` | Print the current custom CSS block |
| `/style-css append <css>` | Append CSS to the current custom CSS block |
| `/style-css replace <css>` | Replace the current custom CSS block |
| `/style-preset <id>` | Apply a built-in preset |
| `/style-reset` | Restore the default graph appearance |

Style-only commands can run even when no graph is loaded. Graph mutation commands still require a graph.

## AI Integration

AI requests include the current appearance summary, layout values, CSS variables, custom CSS, and the stable SVG selector contract. This allows the assistant to answer UI questions and generate appearance command batches such as:

```sh
/style-preset contrast
/layout rowGap 28
/style-var --dag-edge-active #ff6b35
```

Preflight validation simulates appearance commands the same way it simulates graph commands. Review cards can show expected appearance diffs before execution.

## Persistence and Export

Appearance is persisted in page preferences under `dag-studio:page-preferences`. It is restored on refresh and sanitized before use.

Export paths:

| Action | Result |
| --- | --- |
| `Appearance -> UI Configuration -> Import` | Loads a graph appearance JSON file, sanitizes it, and records one appearance undo step |
| `Appearance -> UI Configuration -> Export` | Downloads the current `GraphAppearance` as timestamped JSON |
| `Appearance -> UI Configuration -> Reset` | Restores `DEFAULT_GRAPH_APPEARANCE` |
| `Export SVG` | Exports the current SVG view with injected graph CSS and `--dag-*` variables |
| `Save JSON` | Saves graph data only; appearance is not embedded in graph JSON |

## Undo and Redo

Graph edits and appearance edits have separate histories. The toolbar `Undo` and `Redo` buttons operate on graph edit history first. When no graph edit is available in that direction, they operate on appearance history.

Appearance history records changes from settings controls, presets, reset, and console style commands.

## Sanitization Rules

Appearance is sanitized at every load or mutation boundary.

| Rule | Behavior |
| --- | --- |
| Version | Unknown or missing versions are normalized to the current version |
| Layout | Numeric values are clamped and defaulted |
| CSS variables | Only `--dag-*` keys are accepted |
| CSS size | Custom CSS is capped to prevent unbounded preference payloads |
| CSS imports | `@import` rules are stripped |

These rules keep appearance editable while preventing malformed stored preferences from breaking the graph renderer.

## Implementation Map

| Area | File |
| --- | --- |
| Appearance model and sanitizer | [`src/graph/appearance.ts`](../src/graph/appearance.ts) |
| Appearance commands and presets | [`src/graph/appearanceCommands.ts`](../src/graph/appearanceCommands.ts) |
| Console parsing | [`src/console/dsl.ts`](../src/console/dsl.ts) |
| Console execution | [`src/console/executor.ts`](../src/console/executor.ts) |
| App-level appearance history and export | [`src/App.tsx`](../src/App.tsx) |
| Settings UI | [`src/components/Topbar.tsx`](../src/components/Topbar.tsx) |
| SVG rendering | [`src/rendering/GraphStage.tsx`](../src/rendering/GraphStage.tsx) |
| SVG export | [`src/rendering/export-svg.ts`](../src/rendering/export-svg.ts) |
| AI context and validation | [`src/ai/context.ts`](../src/ai/context.ts), [`src/ai/harness.ts`](../src/ai/harness.ts) |
