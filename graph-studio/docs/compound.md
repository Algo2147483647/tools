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

Placement runs from the innermost scope outward. Each scope ranks its immediate children by topology, aligns them on compact row/column tracks, and freezes the resulting rectangle before its parent is arranged. Cross-boundary edges contribute ordering only at their lowest common containing scope; they never change a finished child's internal layout. Parent-to-descendant edges do not introduce artificial outer self-loops. Cycles are identified before ranking: edges between strongly connected components retain downstream order, while unavoidable feedback edges keep their original direction.

Each connected component chooses horizontal or vertical flow using only its local fixed rectangles. Disconnected components are packed together. There are no boundary-port refinement passes or parent-selected child alternatives. Changes to a scope may still move its rectangle in its parent; unchanged child internals remain fixed relative to their own container.

Only after all node and container positions are fixed does the orthogonal router choose side-midpoint attachments and approach lengths. It avoids visible cards, reduces crossings/shared runs, and places labels without moving nodes. A label too wide for an existing segment receives an outer routing lane, which can enlarge the canvas. Expanded container rectangles remain excluded from collision detection. Ordinary node-link renders all nodes and ordinary edges without applying containment. SVG and HTML exports use the visible scene; HTML node details come from the same node records.

## Defaults and examples

The default collapsed-card style is 200 × 100 px, 20 px corners, centered titles with up to two lines, Times New Roman 22 px and no dots. Default column/row spacing is 24 px; expanded borders, node descriptions and group statistics are hidden. Preset 2 retains the previous larger-width card style. Text uses font measurements and its own content bounds independently of the upper-right controls.

The Commerce workspace contains 46 nodes, including 14 parents, and 45 ordinary relationships. All three checked-in commerce documents and the settings schema/preview examples use `hierarchy_edges`.
