# Graph Studio workflow

This workspace describes Graph Studio's core application workflow in English. Open **core-workflow.json** to explore 73 nodes, 78 directed relationships and 15 groups across six process domains. Switch to **appearance-pipeline.json** for a focused view of the complete Appearance pipeline: 49 nodes, 48 relationships and 11 groups.

## Read the graph

Start at **01 · Open a graph**, then follow the current document into layout, rendering and output. Appearance supplies a parallel input to both geometry and rendering. Editing and arrangement feed changes back into the current document, so the graph deliberately contains feedback cycles.

Group frames represent ownership. Arrows represent data or control flow; their labels distinguish optional branches. They are not a strict execution trace, a timing model or a complete call graph. The six numbered domains provide a reading order, not six mandatory sequential operations.

Use the chart-controls button to expand, collapse or focus groups. **02 · Edit the document** contains **Editing entry points** and **Document transactions**. **04 · Compute layout** contains **Stage construction** and **Layout declarations**. Select a node to read its explanation and implementation path. Paths refer to the Graph Studio source repository; the source files are not bundled into this example.

The linked **workflow.style.json** enables group borders and relationship labels. Each graph references an independent `.layout.json` file through `metadata.layout`. These files contain direction preferences only; geometry is computed live.

## 01 · Open a graph

Choose a file, local workspace, recent location or bundled example. Workspace discovery reads the manifest and identifies the active graph. A standalone file can skip discovery. The opening pipeline parses and normalizes the document, then resolves its optional linked style before the application replaces the session.

Unsaved changes are handled before replacement. The committed document receives a new generation and document-specific state is reset. Invalid documents do not replace the current graph. An unavailable linked style produces a notice and permits graph opening to continue. Bundled examples have in-memory files and no writable source handles.

## 02 · Edit the document

Visual editors produce graph commands. Console input is parsed and evaluated on an isolated graph. Queries produce output; successful mutations flow into a document transaction. Graph commands repair durable references and validate the resulting document before it is committed.

AI editing first builds context and requests a command plan. Proposed commands undergo preflight validation and the configured execution policy. A plan may require review; an allowed batch executes through the console pipeline. An AI response does not directly overwrite the document.

The committed state includes the normalized graph, source identity, revision, selection and dirty state. Undo and redo restore graph snapshots with their selections. Appearance changes maintain separate history. Containment uses `hierarchy_edges`; moving a node into a group does not turn membership into an ordinary relationship.

## 03 · Resolve appearance

The Appearance domain now expands into **Default construction**, **Style loading and validation**, and **Active style and history**. Follow explicit nodes for field JSON imports, chart-default composition, browser preferences, presets, imported files and document-linked styles. Validation leads to either style activation or a user-initiated commit; editing, undo/redo and guarded persistence are shown as separate paths.

Its output branches into **Appearance layout inputs** inside Stage construction and **Appearance SVG rendering** inside the canvas domain. These groups expose StageAppearance extraction, font readiness, memoization and debounce, root CSS variable conversion, component properties, GraphDefs and all three CSS layers. Stage geometry and visual styling meet at **Compose SVG elements** before rendering and export.

Use the [Appearance pipeline guide](./appearance-pipeline.md) for exact source selection, failure behavior, update paths and concrete examples. The focused canvas retains the same node definitions and relationships as the core graph while omitting unrelated editing and AI workflows.

## 04 · Compute layout

The ordinary stage pipeline prepares visible graph input, measures content, runs the chosen chart algorithm and assembles renderable stage data. Node-link, Nested, Timeline, Sankey and Spatial have separate pipelines. Nested layout arranges inner scopes before placing them in their parent.

Stage data contains derived node boxes, routes, labels and bounds. It is separate from the editable document. Browser font measurements are used where available; workers and static consumers have a deterministic fallback, with measured dimensions carried into worker jobs where implemented.

Nested **Automatic** jointly arranges nodes, groups, connections and labels. **AI** uses a dedicated compact declaration protocol and local validation, then installs the computed result directly. Direction and objective are shared controls. There is no adjustment range, position lock or Nested review step. Quality metrics and diagnostics appear in Layout. Timeline uses the same bounded request framework with its own ordering schema and review flow.

Workers use job IDs, timeout and cancellation. Controllers also check document and view freshness. Review compares the current layout with a candidate; applying a current candidate commits chart-specific layout data. Dismissing a preview leaves the document unchanged. Saved arrangement metadata is separate from reusable appearance.

## 05 · Render and explore

Shared SVG components render stage geometry for the main canvas and previews. Selection and highlighting lead to node details and, when requested, an edit. Zoom, pan, fit and locate change the view without rewriting graph relationships.

Nested expansion, collapse and focus rebuild the visible projection. Hidden endpoints map to visible representatives while the original graph remains intact. These view operations differ from grouping or moving nodes, which are document edits.

## 06 · Save and export

**Save graph JSON** serializes the complete editable graph, including hidden descendants and original relationships. Overwriting requires a writable source handle and permission. Saving a copy downloads a new JSON file and does not mean the original source has been overwritten. To save changes to this bundled example, save a new copy.

**Export current SVG** captures the visible projection. **Export interactive HTML** snapshots the graph and SVG together before loading the standalone exporter. Collapsed descendants are not individually drawn in either snapshot, and the offline HTML viewer cannot expand omitted descendants. Expand groups first when their members should appear in an export.

Browser persistence remembers chart preferences, recent locations and AI session state. It is separate from explicitly saving the graph document.

## Workspace files

- `core-workflow.json`: editable v3 nested graph with complete node explanations and implementation references.
- `appearance-pipeline.json`: focused nested view of Appearance loading, validation, state, layout and SVG rendering.
- `appearance-pipeline.md`: detailed guide to source selection and the two rendering branches.
- `workflow.style.json`: complete compound-chart appearance document used by this example.
- `graph-studio.workspace.json`: workspace entry point and asset list.
- `README.md`: this reading guide.

The example is an architectural snapshot of the current source organization. Update node explanations and implementation paths when the corresponding application workflows change.
