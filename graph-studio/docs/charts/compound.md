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

AI first designs the purpose, reading path, parallel regions and connection roles. The engine realizes this composition, then AI reviews the resulting coordinates and relationships against its design intent. It can replace the design or make local revisions; every changed candidate is reviewed again. Fixed direction, external nodes, content and containment remain authoritative. Numeric metrics are auxiliary, not an acceptance threshold.

The **Layout quality** section describes the currently rendered result: validity and elapsed time, followed by one table containing crossings, label collisions, bends, shared route length, route length and content area. Additional diagnostics appear only when present. Quality and geometry are computed together and are not saved. Pan, zoom and selection do not rerun placement.

## Independent Layout protocol

Settings files use `graph-studio-layout-settings` version 1. The association is the graph's `metadata.layout` string, for example `"layout": "layouts/process.layout.json"`. Paths resolve relative to the graph, inside the opened workspace. An absent association uses built-in defaults and does not search neighboring files. A missing or invalid referenced file shows a notice and uses defaults. Open the containing workspace to resolve files; standalone browser file access cannot read siblings.

```json
{
  "format": "graph-studio-layout-settings",
  "version": 1,
  "chartType": "compound",
  "settings": {
    "method": "automatic",
    "direction": "DOWN",
    "objective": "readability",
    "portMode": "distributed"
  }
}
```

`method` is `automatic` or `ai`, direction is `AUTO`, `RIGHT` or `DOWN`, and objective is `readability` or `compact`. At most 500 declarative constraints are supported: `direction` with nullable `scopeId`; `flow-order` with `scopeId` and at least two sibling `nodeIds`; `prefer-outer-route` with `edgeId`; and `port-side` with `edgeId`, `end` and `side`. All use `strength: "soft"`. Flow order adds precedence between the named siblings and may leave other siblings unlisted. Real relationships remain part of placement and routing, including branches and feedback. Outer routing prefers a nearby corridor only when its detour is bounded; it does not force a canvas-wide loop.

Chart configuration is independent of graph data. `metadata.layout` links a chart-specific settings JSON. **Update current layout**, beside the title, saves only method, direction, objective and port mode. No positions, routing plans or geometry are persisted. Legacy files contribute configuration only. A new association is saved through normal graph Save.

Selecting **Automatic** clears the session plan and rendering, restores `direction: "AUTO"`, and recomputes locally. Connection ports and objective remain selected. Distributed ports allow boundary positions to reduce overlap; midpoint mode restricts attachments to four side centers.

The final result remains **Schema Layout v4**. Compound AI uses native inspect_graph, compose_layout, edit_layout, inspect_layout, compare_layouts and finish_layout tools. Versioned JSON decision actions have been removed. Paths, branches, relative placement, alignment and spacing execute geometrically without changing business connections. The Schema tab shows complete rendered geometry.

AI can also design region gateways, reserved channels, endpoint sides and alignment between descendant anchors. Required routing intent is checked after every mutation; preferred deviations are reported. Automatic gateways compete with shorter legal routes rather than forcing every inferred boundary point. Related conflicts can be rerouted together while retaining other paths. Text inspection identifies congestion, interface order conflicts, insufficient capacity and verified alternatives, so the next tool call can repair a specific issue. Connection roles describe business meaning and priority; they no longer automatically force support or feedback edges around the canvas.

The selected design remains attached to its rendering in the current page session, including local edits and Resume. Layout settings files still contain configuration only. No image input is sent to the model.

Each invocation allows 16 model requests, 48 tool dispatches, a 20-minute overall limit, a 120-second response idle timeout and cancellable 15-second geometry Workers. Tool inputs and results appear in the panel. All inspection uses text only. Interrupted work can be resumed in the same page session, preserving immutable candidates and completed calls. Changing graph/view/layout/model context invalidates the checkpoint. Only an explicit finish after consuming a global inspection installs a candidate; metrics never select a winner.

See [Layout protocols](../layout-schema.md) for the configuration file and AI result contract.

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

Implementation: [containment projection](../../src/graph/compound/projection.ts), [Layout protocol](../../src/schema/layoutResult.ts), [graph types](../../src/graph/types.ts), [stage rendering](../../src/components/canvas/GraphStage.tsx).
