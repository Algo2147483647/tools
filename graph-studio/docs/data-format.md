# Graph Studio JSON protocol v2

The application accepts only this protocol. Legacy node maps, arrays, field aliases, and stored node-level `parents` / `children` are rejected. Invalid documents do not replace the currently open graph.

## Document structure

```json
{
  "format": "graph-studio",
  "version": 2,
  "id": "demo",
  "title": "Example graph",
  "metadata": { "author": "Alice" },
  "nodes": {
    "A": { "title": "Node A", "define": "Markdown description", "type": "Concept" },
    "B": { "title": "Node B", "type": "Theorem" }
  },
  "edges": [
    { "id": "edge-ab", "source": "A", "target": "B", "value": "supports", "metadata": { "source": "Notes" } }
  ]
}
```

| Field | Rule |
| --- | --- |
| `format` | Required; exactly `"graph-studio"` |
| `version` | Required; the number `2`, not a string or an unknown version |
| `diagram` | Optional `"dag"` or `"sankey"`; omitted means an ordinary graph. Sankey documents automatically select the flow layout |
| `id`, `title` | Optional document identifier and title strings |
| `metadata` | Optional object for document extensions |
| `nodes` | Required object mapping IDs to node objects; may be empty |
| `nodes[id].title`, `define`, `type` | Optional strings for title, description and type filtering; aliases are not inferred |
| Custom node fields | Arbitrary JSON values; stored `key`, `parents` and `children` are forbidden |
| `edges` | Required array; the only stored relationship collection; may be empty |
| `edges[].id` | Required and unique; stable when editing the edge or renaming endpoints |
| `edges[].source`, `target` | Required references to existing nodes |
| `edges[].value` | Optional scalar: string, finite number, boolean or `null`. An omitted value appears as `related_to` without being written into the file |
| `edges[].metadata` | Optional object for edge extensions |
| Unknown top-level or edge fields | Rejected; place extensions in the corresponding `metadata` |

IDs must be nonempty strings without leading/trailing whitespace, commas, carriage returns or newlines. Node IDs are object keys and are not repeated inside their node objects.

Each directed endpoint pair has at most one edge. Self-loops are rejected. Ordinary graphs may contain directed cycles, which layouts display on a best-effort basis. Sankey documents may contain directed cycles; the flow layout preserves their direction using return bands below the chart. Producers must use unique JSON object keys: JSON.parse cannot detect keys overwritten during parsing.

The [JSON Schema](../public/graph.schema.json) describes document shape. Runtime validation additionally checks unique edge IDs, existing endpoints, unique endpoint pairs, self-loops and Sankey values/totals.

## Sankey diagrams

Set `"diagram": "sankey"` at document level. Every edge must have a finite, nonnegative numeric `value`. Missing values, numeric strings, booleans and `null` are rejected. See the [energy example](../public/sankey-example.json), or open an example workspace on the homepage.

```json
{
  "format": "graph-studio",
  "version": 2,
  "diagram": "sankey",
  "nodes": {
    "supply": { "title": "Supply", "color": "#6396d7" },
    "use": { "title": "Use" }
  },
  "edges": [{ "id": "flow", "source": "supply", "target": "use", "value": 42.5 }]
}
```

- Node height uses the larger incoming/outgoing total. Bands share one linear scale. Unequal intermediate totals produce a notice; original values remain unchanged.
- Node `color` accepts a six-digit hex color. Otherwise colors are assigned consistently by type or ID. Bands inherit their source color. Edge `metadata.label` optionally prefixes the displayed value.
- Zero-value edges remain in the document without visible bands. Nodes without positive flows appear below the chart with zero markers. No minimum flow is invented.
- Type filtering retains actual edges between visible nodes without replacement flows across hidden nodes. Focusing a branch recalculates its visible flows and scale.
- Editing and console commands support numeric values, such as `/edge supply use 42.5`. New Sankey relations default to `1`. Invalid values reject the entire mutation. Circular relations are supported. Saving, undo and redo preserve diagram type and quantities.
- Cyclic flows retain their original endpoints, values and direction. Feedback bands run in lanes below the chart with arrows and `Return flow` labels. All bands, including returns, share the same scale and contribute to node totals. Set an edge's `metadata.feedback` to `true` to explicitly route a recycling or catalyst output as a return; other feedback edges are detected automatically. Zero-value edges are saved but have no visible band.
- Ordinary numeric graphs can temporarily use **Settings → Layout → Sankey**. Invalid quantities produce a notice and a layered fallback. Choosing a layout does not change the document's `diagram` field.
- Ordinary graphs and Sankey documents cannot be merged directly; explicitly align their type and quantity semantics first. Older applications may reject the optional `diagram` field.

Use consistent units for conserved flows. The Factorio example is a per-craft recipe atlas with separate ingredient/product roles, mixed units and possible unequal totals; see its included README.

## Relationship indexes and editing

Indexes are derived from `edges`. Runtime `parents` / `children` are read-only conveniences, not protocol fields, and are excluded from serialization.

- Editing node fields preserves incident edges and metadata; renaming a node updates its edge endpoints.
- Parent/child editors and console commands update `edges`, then rebuild both indexes.
- Deleting a node also deletes incident edges as an explicit edit.
- Undo, redo and saving preserve the complete document envelope and metadata.
- Type-filter projections and display-only bridge edges are never saved to the source.
- Empty documents are valid and display an empty canvas.

Node detail Raw JSON and the node clipboard use a separate editing envelope:

```json
{ "id": "A", "data": { "title": "Node A", "type": "Concept" } }
```

This is a single-node editing format, not an importable graph document. `data` contains node fields only; relationships have separate editors.

## Workspaces and multiple files

The interface opens single files or workspaces. Each graph in a workspace is independent; identical IDs in different graphs do not overwrite one another. See the [workspace protocol](workspaces.md) and [example workspaces](examples.md).

### Merge module for programmatic callers

`src/graph/importMerge.ts` retains explicit conflict handling and tests. The current file/workspace opening flow does not call this module.

All files are validated before merging. Invalid JSON, structure or versions reject the batch. Non-JSON files are ignored and counted in status information. Files are processed in order, starting with the first document. Identical nodes/edges with matching IDs are reused. Other conflicts report the filename, JSON path, existing value and incoming value. Results are returned only after every conflict is resolved; source files are not written.

| Strategy | Behavior |
| --- | --- |
| Keep existing | Retains the selected existing value. Keeping a whole node does not import other incoming fields from it; incoming edges are analyzed separately |
| Merge fields | Combines complementary object fields and requests decisions for conflicting children. Explicit array merges retain order and add distinct values; different scalars are not automatically merged |
| Rename incoming | Retains both copies. Node renaming updates that file's edge endpoints. Field renaming creates a sibling field. Edge IDs can be renamed only if their endpoint pairs differ |

Names can be provided or generated uniquely. Duplicate/reserved names block import. Renaming an edge ID cannot create parallel edges with identical endpoints; keep or merge their properties instead.

Document `id` / `title` conflicts require decisions; renamed incoming values are stored in document metadata. Renamed edge `value` / `metadata` fields are stored in that edge's metadata without overwriting original values.

Merged results record source filenames, original IDs, titles and metadata in `metadata.importSources`. A unique suffix avoids overwriting an existing field. This is not a complete source backup. Merged results are saved as new files; sources are not rewritten automatically. Saving to an original single file requires its writable handle.
