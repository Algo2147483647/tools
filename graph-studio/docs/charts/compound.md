# Nested Node-link

Nested node-link uses chart ID `compound`. It combines ordinary relationships with independent containment over the same node collection. A group is an ordinary node that has children; it can also participate in relationships.

Use this chart for architecture diagrams, nested systems, teams, or any graph where containment and connectivity carry different meanings.

## Data protocol

Use the [shared v3 envelope](../chart-types.md) and add `hierarchy_edges`:

```json
{
  "format": "graph-studio",
  "version": 3,
  "nodes": {
    "platform": { "title": "Platform", "type": "System" },
    "api": { "title": "API", "type": "Service" },
    "worker": { "title": "Worker", "type": "Service" },
    "database": { "title": "Database", "type": "Storage" }
  },
  "hierarchy_edges": [
    { "id": "platform-api", "source": "platform", "target": "api" },
    { "id": "platform-worker", "source": "platform", "target": "worker" }
  ],
  "edges": [
    { "id": "api-worker", "source": "api", "target": "worker", "value": "dispatches" },
    { "id": "worker-database", "source": "worker", "target": "database", "value": "writes" },
    { "id": "platform-database", "source": "platform", "target": "database", "value": "owns access" }
  ]
}
```

| Membership field        | Rule                                                      |
| ----------------------- | --------------------------------------------------------- |
| `hierarchy_edges[].id`  | Required string, unique within the membership collection. |
| `source`                | Existing parent node ID.                                  |
| `target`                | Existing direct child node ID.                            |
| Other membership fields | Not accepted.                                             |

Each child has at most one parent. Missing endpoints, self-containment, duplicate membership IDs, multiple parents, and containment cycles are rejected. Nodes without parents belong to an implicit root. The old `hierarchy` object is rejected.

Ordinary edges can cross group boundaries or connect a group to its descendant. Ordinary cycles remain valid. Membership is not an ordinary incoming/outgoing relationship and does not imply a dependency.

## Expanded, collapsed, and focused views

An expanded group draws a container around its visible descendants. A collapsed group draws a card representing the group and its hidden descendants. Edges are projected onto visible representatives and aggregated by directed endpoint pair while retaining their underlying edge IDs and values. Internal relationships remain in the document and can contribute to group statistics.

Entering a group focuses its scope; external relationships can appear as boundary summaries. Type filtering retains ancestor containers needed to represent visible members. Collapse and focus are view preferences, not membership edits.

## Layout and routing

Layout proceeds from inner scopes outward. Each scope arranges its immediate children using their actual rectangles, then supplies its size to the containing scope. Cross-boundary relationships contribute ordering at their common scope. Cycles are handled without reversing the source document's edges.

Routing occurs after node and container placement. Orthogonal routes avoid cards and unrelated containers; labels may require additional routing space. A parent can be a real edge endpoint, so container boundaries and ordinary card geometry must remain distinct.

The Layout panel offers **Automatic** and **AI**. Automatic jointly arranges nodes, container sizes, connections and labels whenever graph data, the visible projection or layout settings change. Direction and the Readability/Compactness objective are declarative inputs. Internal alternatives are ranked automatically; there is no adjustment-range selector, candidate picker, preview or confirmation dialog.

AI instructions guide an iterative layout session. The model submits typed direction, partial flow-order and routing declarations to the local solver, observes their results, and explicitly chooses the final arrangement. Only that selected result is installed. AI cannot supply coordinates or lock positions. Scope, objective and user settings are enforced locally.

The **Layout quality** section describes the currently rendered result: validity and elapsed time, followed by one table containing crossings, label collisions, bends, shared route length, route length and content area. Additional diagnostics appear only when present. Quality and geometry are computed together and are not saved. Pan, zoom and selection do not rerun placement.

## Independent Layout protocol

Layout files use `graph-studio-layout` version 1. The only association is the graph's `metadata.layout` string, for example `"layout": "layouts/process.layout.json"`. Paths resolve relative to the graph, inside the opened workspace. An absent association uses built-in defaults and does not search neighboring files. A missing or invalid referenced file shows a notice and uses defaults. Open the containing workspace to resolve files; standalone browser file access cannot read siblings.

```json
{
  "format": "graph-studio-layout",
  "version": 1,
  "charts": {
    "compound": {
      "method": "automatic",
      "direction": "DOWN",
      "objective": "readability",
      "constraints": []
    }
  }
}
```

`method` is `automatic` or `ai`, direction is `AUTO`, `RIGHT` or `DOWN`, and objective is `readability` or `compact`. At most 500 declarative constraints are supported: `direction` with nullable `scopeId`; `flow-order` with `scopeId` and at least two sibling `nodeIds`; `prefer-outer-route` with `edgeId`; and `port-side` with `edgeId`, `end` and `side`. All use `strength: "soft"`. Flow order adds precedence between the named siblings and may leave other siblings unlisted. Real relationships remain part of placement and routing, including branches and feedback. Outer routing prefers a nearby corridor only when its detour is bounded; it does not force a canvas-wide loop.

Coordinates, pins, accepted geometry, paths and snapshots are rejected by the Layout parser. Graph JSON preserves only the `metadata.layout` association. Legacy embedded layout objects must be migrated; they are never silently treated as geometry. Run `node --loader ts-node/esm --experimental-specifier-resolution=node scripts/migrate-layout.ts graph.json` with Node 22.12+ to create `graph.migrated.json` and `graph.migrated.layout.json` beside the original. Existing outputs are never overwritten; coordinates and pins are discarded. Node IDs in Layout are repaired alongside graph renames/deletions; undo restores the graph and declaration together. Layout-only changes do not dirty graph JSON.

The Layout panel edits session declarations and displays quality. It has no source badge or import/save controls. Associated files are loaded inputs; changes in the panel do not overwrite them. Maintain a reusable declaration in the associated JSON file.

Selecting **Automatic** clears the current structural/routing plan, restores `direction: "AUTO"` and recomputes locally. The objective and connection-port setting remain selected. **Connection ports** stores `portMode: "distributed"` (default, several side attachments to reduce overlap) or `"midpoints"` (only the four side centers, allowing shared attachments). Both Automatic and AI obey this setting, and changing it recomputes the layout immediately.

AI controls an evaluate/observe/select cycle. `evaluate` submits a versioned plan with direction preference, structural/routing constraints and optional exact `placements: [{nodeId,x,y}]`. Positions are measured pixels relative to the parent's content origin: (36,36) for root items, or (parent.x+24,parent.y+58) inside a group. The executor retains unlisted observed local positions, fits groups and routes edges without moving specified positions. Omitting placements delegates positioning to the topology solver; an empty placements array preserves positions while rerouting. Geometry errors are returned to AI for revision. Exact coordinates remain transient in the selected live view and are recomputed from declarations on graph/view/settings changes, never saved in graph JSON, Layout or undo.

Every solve returns metrics, deltas and concrete routing diagnostics, allowing the model to revise its design. `finish` explicitly selects a successful evaluated candidate or the starting layout and supplies a user-facing assessment. The harness checks references, geometry and execution budgets, but does not substitute its preferred candidate. There are at most four evaluations and six decisions within four minutes. Without a valid final selection, the current canvas remains unchanged. No Review step or saved geometry is introduced. The Layout panel retains the run's responses, evaluations, selected candidate and before/after metrics after completion, including an explicit indication when geometry did not change. A new run or document clears this transient record.

Each plan replaces preferences for supplied editable scopes and edges; omitted preferences are removed there. AI-chosen directions are revisable plan constraints, separate from the user's direction selector. Commands, coordinates in saved declarations, unknown IDs and extra fields are rejected before computation; runtime coordinates use the dedicated placements field. A malformed, truncated or semantically invalid decision can be regenerated once; refusal, cancellation and network failures do not enter JSON repair. DeepSeek planning uses thinking mode and an independent output budget. Error details identify the category, field path and provider completion metadata when available.

## Editing semantics

- Grouping creates a parent node and membership edges.
- Moving a member updates containment without changing ordinary relationships.
- Renaming a node updates references in both edge collections.
- Ungrouping promotes direct children to the former parent's parent; the former parent node and its ordinary relationships remain.
- Deleting a node removes its incident ordinary and membership edges. Its children survive as roots.
- Expanding, collapsing, entering, and switching chart type do not modify containment.

Structural edits use graph undo/redo. Appearance changes have their own history.

## Appearance and export

Ordinary cards, collapsed cards, expanded frames, and group titles are distinct visual elements. `nodeCornerRadius` applies to cards; it is not a general expanded-frame radius. Group borders and statistics have dedicated display flags. See [Nested node-link appearance](../appearance/compound.md).

Graph JSON preserves all members and original relationships. SVG and interactive HTML capture the visible projection. Expand groups before exporting if their individual members must be included; the offline HTML snapshot cannot expand a collapsed group.

Implementation: [containment projection](../../src/graph/compound/projection.ts), [Layout protocol](../../src/schema/layoutProtocol.ts), [graph types](../../src/graph/types.ts), [stage rendering](../../src/components/canvas/GraphStage.tsx).
