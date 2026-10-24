# Appearance Protocol v2 Proposal

**Status: design proposal, not implemented.** The current importer accepts only [graph-studio-style v1](appearance.md). No example or field in this proposal should be treated as a current import contract.

## Goal

Make appearance consistent across chart types while preserving chart-specific visual semantics. Use JSON as the editable source of truth; compile it into renderer parameters, CSS variables, and SVG attributes. Keep custom CSS as an advanced extension rather than duplicating every CSS feature in JSON.

The existing system already has independent chart profiles. Its main limitations are mixed responsibilities in `GraphAppearance.display`, Timeline settings stored separately from similar shared properties, manually duplicated UI/reset field lists, and differences between visible controls and renderer support.

## Proposed document boundaries

| Section                              | Responsibility                                                          | Examples                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `style.layout`                       | Geometry, arrangement, routing, projection configuration where reusable | Node spacing, Sankey bar width, Timeline arrangement     |
| `style.encoding`                     | Mapping data fields to visual channels                                  | Type palette, track colors, explicit source-color policy |
| `style.appearance`                   | Paint, typography, marker shape, visual interaction states              | Stroke, opacity, radius, labels                          |
| Separate document/session view state | Current navigation and temporary manipulation                           | Selection, expansion, pan/zoom, temporary pins           |

Ownership and update cost are independent. A font size belongs to appearance but can require text measurement and layout. A field descriptor must declare its effects.

## Shared primitives and chart-specific elements

Reuse typed definitions for Fill, Stroke, TextStyle, Shadow, and Marker. Compose them only into supported elements:

| Chart     | Proposed element keys                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Node-link | `node`, `edge`, `nodeLabel`, `edgeLabel`                                           |
| Compound  | Node-link elements plus `group`, `groupLabel`, `collapsedGroup`                    |
| Sankey    | `bar`, `flow`, `nodeLabel`, `valueLabel`                                           |
| Timeline  | `point`, `interval`, `anchor`, `leader`, `relation`, `axis`, and associated labels |
| Spatial   | `point`, `edge`, `axis`, `grid`, `pointLabel`                                      |

Use a TypeScript discriminated union and corresponding chart-aware validation. A Sankey flow must not expose an ordinary decorative width that overrides its quantitative thickness. Unsupported properties should produce path-based diagnostics.

## Illustrative v2 shape

This is a proposed example, not an importable current style:

```json
{
  "format": "graph-studio-style",
  "version": 2,
  "chartType": "sankey",
  "style": {
    "layout": { "nodeWidth": 20, "nodeGap": 16 },
    "encoding": {
      "nodeColor": { "mode": "category", "field": "type", "palette": ["#2563eb", "#10b981"], "fallback": "#94a3b8" }
    },
    "appearance": {
      "tokens": { "textColor": "#162033", "fontFamily": "Inter, sans-serif" },
      "elements": {
        "bar": { "stroke": { "color": "#ffffff", "width": 1 } },
        "flow": { "colorMode": "source", "opacity": 0.32 },
        "nodeLabel": {
          "visible": true,
          "text": { "color": { "token": "textColor" }, "fontFamily": { "token": "fontFamily" }, "fontSize": 14 }
        }
      },
      "states": {
        "selected": { "bar": { "stroke": { "color": "#2563eb", "width": 2 } } }
      },
      "advanced": { "css": "" }
    }
  }
}
```

## Field registry

A protocol-layer registry should own each supported path's type, default, bounds, chart applicability, reset group, and update effects. UI metadata can supply labels, search terms, units, and control preferences. Specialized widgets and renderers remain handwritten consumers.

For example, `appearance.elements.flow.opacity` would be a number in 0-1, default 0.32, paint-only, shown as a percentage slider in the Connections group. The same definition should support validation, settings, reset, command/AI schemas, documentation, and change previews.

## Resolution and editing rules

- Missing fields inherit version-specific defaults; explicit false and zero remain meaningful.
- Removing an override restores inheritance. Reset must not write a misleading empty value.
- Arrays replace as a whole; no index-based implicit merging.
- Store opacity as 0-1. Identify logical pixels, screen pixels, and data units explicitly where they differ.
- Resolve defaults, then encoding, then explicit element overrides, then visual states. Define deterministic state ordering before implementation; retain a visible keyboard-focus cue.
- Make data-provided colors an explicit encoding policy rather than an undocumented renderer exception.
- Keep chart profiles independent. Cross-chart theme transfer should copy supported common properties through an explicit action.
- Reject unsupported versions. Do not silently normalize a future document into the current schema.
- Advanced CSS may override computed presentation. The UI must indicate that its fields do not necessarily equal final computed styles when CSS overrides are present.

Do not save generated CSS variables as a second authoritative copy of structured JSON values. Do not reverse-parse arbitrary custom CSS into Settings values.

## Migration and implementation order

1. Introduce a shared field registry over current v1 controls and reset behavior without changing exported files.
2. Add v2 types, validation, and a resolver that adapts to existing renderers.
3. Add explicit v1-to-v2 migration, using chart type to interpret legacy fields. Convert shadow/flow percentages to fractions and split Timeline paint/layout/view concerns.
4. Preserve custom CSS that cannot be structurally migrated. Do not silently rewrite graph-level Spatial styles or Sankey node colors; preserve them through an explicit legacy encoding policy until a separate data migration is requested.
5. Verify Node-link and Sankey first, then Compound, Timeline, and Spatial.
6. Route preview, main-canvas rendering, export, Settings, console, and AI changes through the same resolver and validated mutation path.

## Acceptance criteria

Migration should preserve representative v1 visuals, including custom CSS and data-derived colors. Round trips must preserve explicit values. Unsupported chart fields must be diagnosed. Section reset must affect only its declared fields, and undo must restore the complete previous style. Preview and export must use the same resolved appearance. Timeline pins and Spatial camera state must not leak into reusable style exports under the new protocol.

This proposal does not change the current application or version its files. Implementation requires a separate code change and migration validation.
