# Nested node-link

The `compound` chart displays ordinary relationships (`edges`) and independent containment (`hierarchy_edges`) over one shared `nodes` collection. Switching chart types, expanding and entering nodes does not change the document.

## Protocol

Documents use `format: "graph-studio"`, `version: 3`. The old `hierarchy` object is rejected; there is no compatibility conversion.

```json
{
  "format": "graph-studio",
  "version": 3,
  "nodes": {
    "commerce": { "title": "Commerce", "type": "Domain", "define": "Owns order processing." },
    "checkout": { "title": "Checkout", "type": "Service" },
    "bank": { "title": "Bank", "type": "Partner" }
  },
  "hierarchy_edges": [
    { "id": "contains-checkout", "source": "commerce", "target": "checkout" }
  ],
  "edges": [
    { "id": "commerce-bank", "source": "commerce", "target": "bank", "value": "contract" },
    { "id": "checkout-bank", "source": "checkout", "target": "bank", "value": "payment" }
  ]
}
```

A hierarchy edge points from parent (`source`) to direct child (`target`). Both endpoints must exist in `nodes`. A node with children acts as a Group; no separate group record or group ID namespace exists. Parent nodes accept the same title, description, type and custom fields as any other node, and can be sources or targets of ordinary edges—including relationships with their own descendants.

`hierarchy_edges` is optional. Each entry contains only `id`, `source` and `target`. Its IDs must be unique within that collection. Each child has at most one parent. Missing endpoints, duplicate IDs, multiple parents, self-containment and containment cycles are rejected. Ordinary relationship cycles remain supported. Nodes without a parent belong to the implicit root. Membership is not included in ordinary incoming/outgoing relationship lists.

## Editing

Grouping creates a normal parent node plus membership edges. Moving changes membership only; any node may become a parent. Renaming a node ID updates both edge collections. Removing the last child leaves its former parent node and all ordinary relationships intact. Ungroup promotes direct children to the former parent's parent, retaining the former parent node and its relationships. Deleting a node removes its incident ordinary and membership edges; its children survive as roots. Changes are atomic and undoable.

Group context menus expose the same details, rename-ID, incoming/outgoing relationship editors and copy operations as normal nodes, together with containment controls. Double-click a card to open details. Use **+ / −** to fold and **↗** to enter a parent. Collapse and focus are local preferences keyed by document, not exported fields.

## Projection and routing

Collapsed parents represent their descendants; ordinary edges map to those visible endpoints, aggregating each directed pair while preserving original edge IDs and values. Internal edges remain recorded in summary statistics. Expanded parents can be actual ordinary-edge endpoints. Type filtering uses each node's own type and retains necessary ancestor containers. Entering a parent keeps incident external relationships as boundary summaries, including edges involving the focused parent itself.

Placement runs from the innermost scope outward. Each scope orders its immediate children by topology and packs their actual rectangles before freezing its result for the parent. A node starts downstream of its own predecessors; unrelated wide nodes do not push it into a shared column. Cross-axis positions follow occupied contours, favor branch centerlines, and are compacted in forward/backward passes. Independent siblings are tried in different orders without violating dependencies. Cross-boundary edges contribute ordering only at their lowest common containing scope; they never change a finished child's internal layout. Parent-to-descendant edges do not introduce artificial outer self-loops. Cycles are identified before ranking: edges between strongly connected components retain downstream order, while unavoidable feedback edges keep their original direction.

Each connected component first compares compacted horizontal and vertical arrangements using occupied footprint including outer half-gaps, then branch alignment, then perimeter. There is no target aspect ratio. Before freezing the result, a bounded local pass tries moving rectangles into free slots aligned with their neighbors. It minimizes rectangle separation and centerline offsets within the original bounds, without changing sizes or minimum gaps. Topological order is a hard constraint: horizontal components read left to right by center, then bottom to top within the same column; vertical components read top to bottom, then right to left within the same row. Every forward dependency must advance in that order. For example, a second source can move below a shared successor, replacing an offset connection with a vertically aligned one. Equal-cost alternatives retain their existing positions.

This refinement uses node geometry and adjacency only; it does not select ports, invoke routing, or let routes move nodes. The search is deterministic and limited to four passes and 4,096 candidate evaluations per component. Disconnected components are then packed against rectangle contours, so several small components can sit alongside a large one without sharing its row height. There are no boundary-port refinement passes or parent-selected child alternatives. Changes to a scope may still move its rectangle in its parent; unchanged child internals remain fixed relative to their own container.

Only after all node and container positions are fixed does the orthogonal router choose side attachments and approach lengths. Nodes with multiple connections offer separated ports on each side. Routing avoids visible cards, unrelated expanded containers and ancestor header bands, penalizes crossings/shared runs, and places labels without moving nodes. Related container content areas remain traversable. A label too wide for an existing segment receives an outer routing lane, which can enlarge the canvas. Avoiding containers can add bends and distance; the Arrange preview reports these trade-offs. Ordinary node-link renders all nodes and ordinary edges without applying containment. SVG and HTML exports use the visible scene; HTML node details come from the same node records.

## Subgraphs and Arrange panel

The topbar Subgraphs button opens one independent floating panel with Structure and Arrange tabs. Structure holds group navigation and member edits; Arrange holds scoped direction changes, selected-node locks, route-only edits, and an Ask AI input. Its translucent surface matches the topbar, and the file explorer contains no subgraph controls. Preview candidates before applying; accepted layouts are saved in `metadata.layout.compound` and create one undoable document edit. The existing canvas and exports continue to show the committed scene during preview.

The AI console supports natural-language layout requests through typed `propose_layout` responses. Manual operations use `/compound-layout inspect`, `diagnose`, `propose`, `compare`, `apply`, and `cancel`. See [AI Assisted Nested Layout and Routing](ai-compound-layout.md) for scope semantics, the JSON intent protocol, saved locks, and validation rules.

## Defaults and examples

The default collapsed-card style is 200 × 100 px, 20 px corners, centered titles with up to two lines, Times New Roman 22 px and no dots. Default column/row spacing is 24 px; expanded borders, node descriptions and group statistics are hidden. Preset 2 retains the previous larger-width card style. Text uses font measurements and its own content bounds independently of the upper-right controls.

The Commerce workspace contains 46 nodes, including 14 parents, and 45 ordinary relationships. All three checked-in commerce documents and the settings schema/preview examples use `hierarchy_edges`.
