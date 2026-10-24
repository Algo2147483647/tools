# Canonical Appearance Schema

`src/schema/appearanceDefinition.json` is the authoritative runtime field definition. Its `appearance`, `timeline`, and `options` sections declare structure, defaults, enums, numeric bounds, tuple lengths, map item types, font units, grouping, chart support, conditional visibility, dependent resets, labels, and search keywords. `appearanceDefinition.ts` imports this JSON directly and exports the three definitions; it contains no configuration values. TypeScript data shapes live in `appearanceModel.ts`, preserving enum unions and fixed-length tuples.

`definition.ts` resolves and validates values. Imports, persistence, presets, console commands, ordinary controls, and Schema edits share this resolver. Missing optional values receive defaults; invalid provided values throw descriptive errors. There is no clipping, type coercion, obsolete-field migration, or color rewriting. Runtime helpers named `sanitizeGraphAppearance` and `sanitizeTimelineSettings` are thin aliases to the resolver for partial initialization.

| Consumer                    | Source                                      | Behavior                                                                             |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| TypeScript models           | `appearanceModel.ts`                        | Explicit data shapes matching JSON field structure, enum values and tuple lengths.   |
| Chart defaults              | Field defaults and `chartDefaults.ts`       | Explicit per-chart default overrides.                                                |
| Presets                     | `presetManifest.ts`                         | Full validated `ChartStyleDocument` records with identity outside the document.      |
| Schema table                | Field definitions and current values        | Unsupported fields are read-only and identified in their description.                |
| Ordinary controls           | Schema bindings and `appearanceUIConfig.ts` | Hierarchical UI templates retain sliders, color pickers, switches and button groups. |
| Preferences and style files | `styleProtocol.ts`                          | Complete documents round-trip through the same validator.                            |
| Documentation               | `generate-appearance-reference.mjs`         | Tables and complete examples are generated from the contract.                        |

## Geometry and typography

Appearance pairs use `canvas.padding: [x, y]`, `canvas.minSize: [width, height]`, and `nodes.widths: [min, max]`. Timeline and Spatial consume the shared padding and minimum size. Timeline applies the minimum size after orientation so width and height retain their viewport meaning.

Title, detail, date, axis, and track font roles use registered `--dag-<role>-font-*` tokens. Sizes must be non-negative pixel strings such as `18px`. Relative units are rejected because geometry and SVG must measure the same font. Timeline title and detail measurements, label rectangles, and collision bounds use the resolved sizes.

## Visual configuration and precedence

`appearance.palette.categories` contains HSL triples. Node-link, Timeline, Sankey, and Spatial use this shared palette. Explicit per-node colors override category colors. `appearance.palette.groups` contains nested color ramps for Compound groups. Type-color overrides remain available in Timeline.

Registered CSS tokens configure flow and Timeline normal, active, and muted opacity, edge widths, interval selection width, dash patterns, and active shadow multipliers. `appearance.performance.denseThresholds` specifies node, edge, and area thresholds. `denseShadows` selects `disable` or `preserve`.

SVG styles use ordered cascade layers: `graph-base`, `graph-theme`, and `graph-custom`. User CSS belongs to the final layer. Built-in CSS is not copied into the saved custom stylesheet. Inline data colors intentionally override theme colors; use an explicit custom rule with `!important` when overriding inline data styling is desired. Font-changing custom CSS cannot participate in geometry measurement; use font tokens for measured text.

CSS requires `--dag-` variable names, at most 500 characters per variable, and at most 50,000 characters for the custom stylesheet. `@import` is rejected. Timeline colors accept hex and numeric rgb/rgba strings, or an empty automatic value. Marker size is 0–120; stroke widths are 0–20. These limits are validated identically at every boundary.

## Storage and maintenance

The document envelope is `{ format: "graph-studio-style", version: 1, chartType, style }`. Saved preferences store one complete document per chart. Session-specific Timeline pins, axis lock state, and document category overrides remain excluded from global browser preferences. Invalid imported documents are rejected; invalid stored documents reset to chart defaults.

Edit defaults, bounds, labels, chart support and other configuration directly in `appearanceDefinition.json`; no configuration-generation step is needed. When adding or changing field structure, enum values or tuple lengths, also update `appearanceModel.ts` and implement the corresponding rendering behavior. Add presets as complete documents in the manifest without adding factory branches. Run the reference generator with the same TypeScript loader as the test runner, then run the contract and rendering tests. Validation tests cover actual geometry, typography, palettes, CSS precedence, editor support, presets, and round trips.

The JSON import uses import attributes for the Node.js scripts. The `appearance-json-import` Vite plugin removes that attribute before Vite 4's older esbuild processes the module; Vite loads the same JSON through its built-in JSON support.

## Hierarchical Settings UI

The Settings pipeline is `Schema -> resolved values -> UI tree -> registered renderer -> validated transaction -> ChartStyleDocument`. UI definitions contain paths, renderer names, labels, layout and slider presentation ranges. They never contain saved values or reset defaults. Schema remains responsible for data types, supported charts, enum values and validation.

`appearanceUIConfig.ts` declares a tree. An absolute `style.*` path selects a Schema branch; a relative child path resolves beneath its parent. A renderer can own a whole panel, an object, a tuple or a single field. For example, the node-size panel binds `style.appearance.nodes`, and its `widths` child selects the tuple renderer. The Timeline point panel binds `style.timeline` and delegates its `pointMarker` child to the marker renderer. Parent templates receive their rendered children, so specialized layouts do not flatten their descendants into generic text inputs.

`AppearanceUIContext.tsx` resolves paths, checks chart support and visibility, and dispatches registered renderers. `AppearanceUIRenderers.tsx` reuses the existing controls and specialized Timeline templates. Unspecified leaf renderers use Schema kinds and formats. Unknown paths and renderer names fail explicitly. `appearanceUIModel.ts` supplies current values, chart defaults, child bindings, reset and change operations. `updateAppearanceSchemaValues` validates the entire edit atomically and applies declared dependencies identically for parent and leaf edits.

To add a field, declare its contract and rendering behavior first. To expose it in Settings, add a binding under the appropriate UI parent; existing renderer types require no new event handler or persistence code. Add a renderer only for a new interaction or composite layout. Keep option labels and icons in the UI layer; derive allowed option values and reset defaults from Schema. The Schema tab continues to expose every supported protocol field, including fields without a dedicated visual control.

Settings separates layout rules from visual properties by object ownership. `appearance.nodes` contains node sizes, spacing and Timeline cross-axis spread; `appearance.edges` contains lane spacing; `appearance.canvas` contains padding and minimum size. There is no catch-all geometry settings group. Layout controls retain algorithm, direction, routing and time-axis behavior. Resetting an Appearance object leaves layout rules and time-axis state intact. Timeline AI arrangement plans can select order and routing; they cannot override Appearance sizes or spacing.
