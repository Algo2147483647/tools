# Appearance: loading to rendering

Open **appearance-pipeline.json** in this workspace for the focused nested graph. The same nodes and connections also appear in **core-workflow.json**, connected to the rest of Graph Studio. The focused canvas contains 49 nodes, 48 relationships and 11 groups.

Follow the labelled arrows. Frames represent responsibility boundaries. The graph describes data dependencies and event-driven updates, not one synchronous call stack: startup restoration, opening a document, editing a field and exporting a view happen at different times.

## 1. Default construction

**Field definition JSON → Import definitions → Compose chart defaults → Default ChartStyle**

`src/schema/appearance/definition.json` declares appearance, Timeline and display-option fields, including base defaults and constraints. `definition.ts` imports that JSON directly and exposes the three definition objects. Vite's JSON-import compatibility plugin handles import-attribute syntax; there is no configuration-generation stage.

`defaults.json` supplies chart-specific overrides to **Compose chart defaults**. In `contract.ts`, `styleDefinition(chart)` resolves base values, applies those overrides and writes the resulting leaf defaults into a chart-specific definition. `defaultChartStyle(chart)` then produces a complete style. `getDefaultChartStyle` exposes that operation to callers.

A `ChartStyle` contains `appearance`, display options such as `showNodeDetail`, `hideNodeBorders` and `alignNodeWidthsToMax`, and Timeline settings when applicable. A preset is a separate complete snapshot; it is not another mandatory layer added to every default style.

## 2. Style loading and validation

Four explicit source nodes feed **Validate style values**:

| Source                      | When it is used                                                      | Invalid-input behavior                                                                 |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Restore browser preferences | Startup reads `graph-studio:page-preferences`                        | Missing or invalid styles fall back to the corresponding chart defaults.               |
| Preset JSON snapshots       | Presets are validated on module loading; a selected preset is cloned | Invalid built-in preset documents or duplicate identities fail at the import boundary. |
| Import a style file         | The user selects a JSON style file                                   | Report an error without committing the imported values.                                |
| Resolve metadata.style      | A graph links a style file relative to its workspace path            | Report a linked-style notice and continue opening the graph without that override.     |

`styleProtocol.ts` owns the envelope: `format`, `version`, `chartType` and `style`. `parseStyleDocument` calls `resolveDefinition(documentDefinition(chartType), value)`. `parseChartStyleFile` returns the validated `style` member. The chart contract validates types, bounds and enums consistently.

Linked styles are read only from files available in the opened workspace. The example itself demonstrates this route through `metadata.style: "./workflow.style.json"`.

## 3. Active style and history

**Validated style document → Activate a chart style → Resolved chart style** describes startup and document loading. The active history is indexed by chart type. A valid linked style replaces the active style when a new document generation opens; leaving a document with a linked style restores the saved user chart preference.

**Validated style document → Commit style and history** describes selecting a preset or importing a valid style. The **Default ChartStyle → Commit style and history** arrow is the Reset action. These are explicit state changes, not an unconditional CSS precedence stack.

Editing follows **Appearance controls → Bind controls to Schema → Validate an atomic edit → Commit style and history → Resolved chart style**. Bindings expose values, defaults, visibility, supported charts and child paths. `updateAppearanceSchemaValues` changes a cloned document, applies dependent resets and validates the complete result before commit. Custom CSS replacement commands also use appearance validation.

**Undo or redo appearance** restores the independent style history, including associated display and Timeline values. **Save reusable preferences** persists reusable chart preferences while retaining the saved user preference for a document-linked chart. Reusable Timeline settings exclude document-specific type colors and pins and do not retain the axis lock. Browser persistence does not overwrite a linked JSON file.

## 4. Appearance layout inputs

**Resolved chart style → Extract StageAppearance → Memoize and debounce → Measure text and boxes → Run chart algorithms → Build stage data**

`getStageAppearance` selects canvas and node dimensions, spacing, title typography, detail/date/axis/track fonts and relevant display flags. **Track font readiness** contributes a font-metrics key so newly available browser fonts can invalidate measurement.

`useGraphLayout` compares a serialized geometry input, memoizes equivalent values and settles rapid updates with a default 150 ms debounce. Text measurement and the selected chart pipeline then compute node boxes, paths, labels and stage bounds.

**Supply layout options** shows the separate inputs outside the extracted appearance object: detail visibility, width alignment, chart-specific settings and Nested edge-label visibility. Timeline settings also have their own debounced path.

The separation is practical rather than absolute. Palette values still appear in `StageAppearance`, and Nested edge-label visibility participates in layout input. Do not assume every color or display change avoids layout work. Arbitrary custom CSS that changes font metrics does not update geometry measurement; use the registered font properties when text size must remain synchronized with layout.

## 5. Appearance SVG rendering

The active style also feeds the rendering branch directly:

- **Map SVG CSS variables** runs `appearanceToStageStyle`, including supplied CSS variables and derived shadows, dot visibility, content shift, edge-label fallback color and Sankey opacity. Its result becomes the root SVG `style` object.
- **Apply component properties** passes display flags, palette values and density behavior to components and SVG attributes. Group borders, group fills, edge-label visibility and markers are not all expressed as root CSS variables. `hideNodeBorders` comes from `ChartStyle` outside `appearance`.
- **Build GraphDefs** embeds arrow definitions and the three named stylesheet layers inside the SVG.

| Layer node         | Embedded content                         |
| ------------------ | ---------------------------------------- |
| graph-base layer   | `GRAPH_BASE_CSS` and `DEFAULT_GRAPH_CSS` |
| graph-theme layer  | `GRAPH_EFFECTS_CSS` and `TIMELINE_CSS`   |
| graph-custom layer | Validated `appearance.css`               |

For normal layered declarations, custom follows theme and base. Inline data styling still has its own CSS cascade priority. A custom rule does not automatically override every value rendered into the SVG.

**Compose SVG elements** joins the derived stage geometry, root styles, component properties and embedded definitions. `GraphStage`, node and edge components, group components and chart-specific renderers produce **Render the SVG stage**. The main canvas and preview canvases reuse these rendering components.

## 6. Export and concrete examples

The final SVG feeds **Export current SVG** and **Export interactive HTML**. Embedded styles and root SVG properties travel with the prepared visible snapshot. The HTML export also captures the matching graph document before dynamically loading the exporter. It cannot expand descendants omitted from a collapsed projection.

Three edits illustrate the branches:

1. Change node width: validate and commit the value, extract new geometry inputs, debounce, recompute layout, then draw the updated stage.
2. Change shadow opacity: validate and commit the value, derive new root SVG shadow properties and redraw; this property is not included in `StageAppearance`.
3. Change title font size through its registered setting: update both geometry typography and SVG CSS variables. Font readiness and text measurement keep the eventual layout aligned with rendered text.

Implementation paths are attached to individual nodes. They refer to the Graph Studio repository; the source files themselves are not bundled into this example. Maintain the shared node definitions consistently in both canvases when the pipeline changes.
