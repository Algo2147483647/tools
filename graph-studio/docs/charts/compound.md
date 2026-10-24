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

The Subgraphs panel separates structural operations from Arrange operations. The latter can preview scoped layout changes. Saved layout plans are document-specific metadata; they are separate from the reusable appearance file.

## Saved Arrange protocol

Applied layout data is stored under graph `metadata.layout.compound`, independently of appearance. This metadata fragment requests a downward root arrangement:

```json
{
  "layout": {
    "compound": {
      "version": 1,
      "constraints": [{ "type": "direction", "scopeId": null, "value": "DOWN", "strength": "soft" }],
      "pins": []
    }
  }
}
```

| Field         | Contract                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| `version`     | Exactly 1.                                                                         |
| `constraints` | Array of at most 500 saved direction/route preferences.                            |
| `pins`        | Array of at most 1,000 captured node positions.                                    |
| `accepted`    | Optional application-generated fingerprint, engine version, and geometry snapshot. |

Saved constraints support `direction` with a nullable `scopeId` and `AUTO`, `RIGHT`, or `DOWN`; `prefer-outer-route` with an `edgeId`; and `port-side` with an `edgeId`, `end: "source" | "target"`, and `side: "east" | "south" | "west" | "north"`. All three have `strength: "soft"`. A null scope means the root.

Each saved pin has `nodeId`, nullable `parentId`, `space: "canvas" | "parent"`, finite `x` and `y` bounded in absolute value by 10,000,000, and optional `projectionKey`. The interactive `pin`/`unpin` request forms are not valid saved constraints; persisted pins need captured coordinates.

The optional accepted snapshot contains `boxes` keyed by visible node ID, `routes` keyed by projected edge ID, and stage `width`/`height`. Boxes have `x`, `y`, `width`, and `height`; routes have a `points` array of `{ x, y }` and `labelPosition`. Snapshots are engine/projection-specific caches and should be generated by Arrange rather than hand-authored. The parser limits snapshots to 10,000 boxes, 20,000 routes, and 2-2,048 points per route.

Unsupported or malformed saved layout data falls back to an empty layout plan with a warning while preserving the source metadata. The graph's nodes and relationships remain authoritative.

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

Implementation: [containment projection](../../src/graph/compound/projection.ts), [saved layout protocol](../../src/layout/compound/layout-plan.ts), [graph types](../../src/graph/types.ts), [stage rendering](../../src/rendering/GraphStage.tsx).
