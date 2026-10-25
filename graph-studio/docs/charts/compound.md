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

AI instructions generate direction and routing preferences. The local solver evaluates them, optionally checks one refinement and directly applies the selected declaration. AI cannot supply coordinates or lock positions. Scope, objective and selected preferences are enforced locally.

The **Layout quality** section describes the currently rendered result: validity, elapsed time, crossings, label collisions and bends, with route length, shared length, content area and diagnostics under Details. Quality and geometry are computed together and are not saved. Pan, zoom and selection do not rerun placement.

## Independent Layout protocol

Layout files use `graph-studio-layout` version 1. Opened workspaces resolve a manifest `layouts` mapping first, then an adjacent `<graph-name>.layout.json`. Missing configuration uses defaults; invalid files show a notice and use defaults. Standalone graph files can import Layout through the Layout menu.

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

`method` is `automatic` or `ai`, direction is `AUTO`, `RIGHT` or `DOWN`, and objective is `readability` or `compact`. At most 500 declarative constraints are supported: `direction` with nullable `scopeId`; `prefer-outer-route` with `edgeId`; and `port-side` with `edgeId`, `end` and `side`. All use `strength: "soft"`.

Coordinates, pins, accepted geometry, paths and snapshots are rejected by the Layout parser. Graph `metadata.layout` is discarded on load and omitted on save. Node IDs in Layout are repaired alongside graph renames/deletions; undo restores the graph and configuration together. Layout-only changes do not dirty graph JSON.

**Import Layout**, **Save Layout** and **Reset to default** operate on the independent configuration. Save Layout downloads the configuration; place it beside the graph or associate it in the workspace manifest. A single-file browser open cannot discover sibling files.

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
