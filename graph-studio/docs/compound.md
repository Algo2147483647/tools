# Nested node-link

The `compound` chart type displays the relationship graph G together with an independent containment forest H. Ordinary node-link continues to render G alone. Switching chart type, expanding a group, and entering a group never change the graph document.

## Protocol v3

Only version 3 graph documents are accepted. Workspace manifests retain their own version 1 format. A minimal example of `a` inside `b`, and `b` inside `c` is:

```json
{
  "format": "graph-studio",
  "version": 3,
  "nodes": { "a": { "title": "Order service" }, "x": { "title": "Bank" } },
  "edges": [{ "id": "call-bank", "source": "a", "target": "x", "value": "request" }],
  "hierarchy": {
    "id": "business-domains",
    "groups": { "b": { "title": "Checkout" }, "c": { "title": "Commerce" } },
    "parentById": { "a": "b", "b": "c" }
  }
}
```

`nodes` and `edges` are G. `hierarchy.groups` contains only subgraphs, which cannot share IDs with G nodes. `parentById` maps a member ID to its immediate group parent. Each member has at most one parent; a missing entry means a root. Nodes outside a group are therefore root leaves of H. Only groups can be parents. Cycles, unknown members/parents, empty groups, unknown hierarchy fields and invalid IDs are rejected. There is no fixed nesting-depth limit. Validation and hierarchy indexing are iterative; practical rendering still depends on visible graph size.

Deleting or renaming a G node repairs its membership. Moving the last member out removes empty ancestor groups. Grouping, moving, renaming and dissolving groups modify only H; undo/redo snapshots include H. Dissolving a group promotes its children to its parent and preserves all nodes and relationships.

## Exploration and editing

Select **Nested node-link** in Settings → Chart type. Documents containing H select it on opening. Initial groups are collapsed into domain summaries. The Subgraphs panel and each group provide **+ / −** to expand or collapse and **↗** to enter. Entering a group scopes the view to all of its descendants, including isolated nodes. Breadcrumbs, Up, Back and Show all navigate containment. Double-click a group to enter, or a leaf to open its details.

Select sibling members in the panel, enter a group name and choose **Group**. **Move** changes their parent. Selecting one group exposes **Rename** and **Ungroup**. Invalid cycles fail without partially modifying the document. Toggle the workspace explorer to switch between graph/note files and the Subgraphs panel.

Right-click a node, subgraph summary, group header/border or panel member to open its context menu. Node menus separate **Connections** (G) from **Subgraph membership** (H). Group menus include enter/fold, rename, **Members**, membership and ungrouping. **Members → Group members** creates a child group from selected members; **Subgraph membership → Group with siblings** wraps the target and selected siblings in a new parent. Move dialogs omit self/descendant destinations. Adding a node inside a group is one atomic, undoable operation with no automatic G edge. External summaries offer entry rather than an ineffective local expansion.

Collapse state and focus are local preferences keyed by workspace document and hierarchy identity. They are not exported into G or H and do not mark a document dirty. Folding preserves zoom and anchors the operated group where scrolling bounds allow. Entering another scope fits its new view. **Fit** explicitly fits the whole visible projection.

## Relationships and layout

The visible projection maps each G node to itself or its outermost collapsed ancestor. Edges are mapped through these representatives. Internal edges become an internal relationship count on a collapsed group. Remaining edges are grouped by directed visible endpoints and relationship value/type; numeric edges share a bucket, whose label is a relationship count rather than an invented sum. Every visible edge retains all original edge IDs. Hover its line to inspect source, target and value for each original edge.

Inside a focused subgraph, incident relationships to outside members remain visible through external summaries. Only those incident connections are shown. External summaries are marked **External** and offer entry to their group. Type filtering retains matching leaves and necessary ancestor containers; it does not invent transitive relationships.

ELK Layered lays out nested containers with cross-boundary, orthogonal edge routing. Bends use rounded quadratic corners, capped at half of each adjacent segment so short routes retain their endpoints and arrow direction. The browser uses a dedicated Worker, cancels obsolete requests, and caches up to 24 projections per immutable document. Existing geometry remains on screen while a fold is arranged. Expanded parents contain child rectangles; headers and controls render above edges and nodes. SVG export uses the same visible geometry.

## Classic business example

Open **Commerce operations** from the home page. Its fictional order-to-delivery architecture has 32 nodes, 45 directed relationships and 14 groups. It includes checkout, payment risk and settlement, warehouse and delivery, after-sales, platform services and external partners. The workspace also includes independent order and return journeys, plus linked operating notes. Try Commerce → Payments → Settlement, then follow refund requests to the external payment provider.

Run `npm run examples:commerce` after editing `scripts/build-commerce.mjs`. `npm run examples:commerce:check` checks reproducibility and is included in `npm run check`.
