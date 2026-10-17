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

Settings → Appearance → Visible details → **Group statistics** controls both the node/internal-edge counts on collapsed cards and the node count in expanded group headers. It defaults to on and persists with the independent nested-chart appearance. It is separate from **Node descriptions** and **Edge labels**. Hiding statistics centers collapsed titles vertically without moving cards or routes; SVG export uses the same visibility setting.

## Relationships and layout

The visible projection maps each G node to itself or its outermost collapsed ancestor. Edges are mapped through these representatives. Internal edges become an internal relationship count on a collapsed group. Each pair of directed visible endpoints has one edge, combining all relationship values and types; the opposite direction remains a separate edge. A combined edge shows the relationship count rather than an invented numeric sum, while a single relationship keeps its value as the label. Every visible edge retains all original edge IDs. Hover its line to inspect source, target and value for each original edge. Expanding groups restores the individual relationships between their visible members without changing the document.

Inside a focused subgraph, incident relationships to outside members remain visible through external summaries. Only those incident connections are shown. External summaries are marked **External** and offer entry to their group. Type filtering retains matching leaves and necessary ancestor containers; it does not invent transitive relationships.

Layout is computed independently at each containment level, from the innermost containers upward. Each local ELK Layered graph contains only direct members; a child container is a fixed rectangle with fixed boundary ports. Original relationships are split at each crossed boundary and joined in their original source-to-target order at their lowest common ancestor. Container aggregation can produce cycles even when the leaf graph is acyclic; local cycle handling never changes the original arrow direction. Virtual ports and segments are disposable layout objects, not document edits.

Direction is adaptive at every level, including the root. The search compares horizontal and vertical layouts using occupied area, a soft aspect-ratio preference, route length, bends and crossings. It retains balanced, narrow and short alternatives so a parent can choose different internal layouts for its children. Container placement also compares centered and port-aligned arrangements to avoid expanding a chain of containers into a staircase merely to straighten an edge. Disconnected components are packed by ELK. Search is bounded to at most twelve candidates per container per pass (usually fewer after deduplication), with three alternatives retained. One optional second pass coordinates boundary port sides and order with external neighbors; the first solution is retained if refinement scores worse. This is a bounded heuristic, not a guarantee of a globally optimal drawing or a fixed aspect ratio.

Temporary boundary ports use the sides and bottom to keep the placement-stage routes out of group headers. They are transit points, not visible node attachments. After node positions are fixed, the final orthogonal router permits exactly four attachment locations on each leaf or collapsed group: the midpoint of its top, bottom, left or right side. Endpoints never slide to make a shorter route, including when retaining an ELK candidate. Each midpoint has 20 px and 8 px outward approach candidates so narrow gaps remain usable. A direct connection between facing midpoints may be shorter than two approach segments. Source departure and target arrival are perpendicular to their respective sides; immediate reversals are rejected. If no midpoint route exists, layout reports an error instead of reverting to an off-center attachment.

The router compares simple straight/one-/two-bend candidates with a directional visibility-grid search. Its score is Manhattan length + 20 per bend + twice the deficit below 20 px for each short segment in a bent route. Reusing an attachment within 16 px adds four times that distance deficit; parallel reverse-direction segments closer than 16 px add a cost proportional to their shared length. These are soft preferences, not guarantees that all edges use distinct sides or that lines never cross. Four fixed ports may be shared by several edges. Edges are routed in stable ID order. Routes stay within their lowest common ancestor and avoid nodes, 50 px group-header bands and unrelated containers, with 8 px obstacle clearance on searched trunks. An unrelated container replaces its descendants in the obstacle set. All four midpoints remain fixed even when a different route would be shorter.

Only visible edge labels reserve geometry, once per projected edge at its lowest common ancestor; changing label visibility invalidates the compound layout cache. Routed paths relocate labels onto a free segment, clear of nodes, previously placed labels and already routed lines. Label candidates try longer segments first, at their midpoint, quarter and three-quarter positions. If no candidate can carry the label, its placement-stage reserved position is retained with the best midpoint route. Unplaced labels do not block earlier routes using their obsolete positions. Paths are checked for continuous boundary joins before bends are rounded, with a default corner radius of 12 px capped at half of each adjacent segment; rounding never moves an endpoint. The browser uses a dedicated Worker for ELK, cancels obsolete requests, and caches up to 24 projections per immutable document. Existing geometry remains on screen while a fold is arranged. Expanded parents contain child rectangles; headers and controls render above edges and nodes. SVG export uses the same visible geometry.

### Placement dimensions and limits

- Every leaf and collapsed group uses the configured node height (default 74 px). Leaf widths are estimated from title and visible description, clamped to the configured minimum/maximum (defaults 188/280 px); equal-width mode uses the configured maximum. Collapsed group widths use `100 + 9 × title.length`, clamped to the same bounds. Group statistics do not affect width.
- Expanded containers reserve 58 px at the top and 24 px on the other sides, and are at least 260 px wide (or the group's requested width if larger) and 120 px high. The root reserves 36 px on all four sides. Sibling separation is at least `max(16, rowGap)`; disconnected component separation is `max(24, rowGap)`.
- Horizontal layer spacing is `columnGap` (default 116 px); vertical layer spacing is `max(32, rowGap)` (default 32 px). Placement uses 12 px edge-to-node, 10 px edge-to-edge and 12 px port spacing. These ELK placement settings are separate from the final router's clearance and lane costs.
- Local node placement compares `RIGHT` and `DOWN`; it uses `BRANDES_KOEPF` and also tries `SIMPLE` when direct children include expanded groups. The aspect-ratio hint is 1.6, model order is considered, and the random seed is 1. Layouts are scored by `log(area) + 0.35 × abs(log(width/height/1.6)) + 0.18 × length/(sqrt(area) × sqrt(segmentCount)) + 0.12 × bends/segmentCount + 0.25 × crossings/segmentCount`. Child metrics are included; only proper crossings count, not shared endpoints/trunks. Root scoring respects minimum stage size.
- Boundary-port refinement runs at most once. Ports face south if the peer is below the container, otherwise west/east according to peer center; their order follows peer position clockwise. Refinement is accepted only when its complete layout scores better.
- The final stage is at least the configured minimum width/height (defaults 980 × 600 px); smaller layouts retain surrounding space. Nested layout does not use the ordinary node-link engine, `edgeLaneGap`, or `stagePaddingX/Y`; the values above govern its own spacing.
- Color families follow the original root group, including after entering a deeper group. Containers render from shallow to deep, followed by edges, nodes and group headers/controls. Titles truncate and details wrap to at most two lines; they do not expand node height. Hiding a border does not remove the node's routing obstacle.

The compound layout regression suite covers mixed local directions at the same depth, nested chains, cycles introduced by grouping, reverse edges, disconnected nodes, hidden labels, folding and focused external summaries. Geometry checks verify sibling separation, containment, side-midpoint endpoints, continuous orthogonal routes, and avoidance of nodes, headers and unrelated containers. Four rotated fixtures verify midpoint selection on every side, including replacement of a shorter off-center route. The expanded Commerce experience checks a one-bend storefront connection, and rendering tests cover group-statistics visibility without geometry changes.

## Classic business example

Open **Commerce operations** from the home page. Its fictional order-to-delivery architecture has 32 nodes, 45 directed relationships and 14 groups. It includes checkout, payment risk and settlement, warehouse and delivery, after-sales, platform services and external partners. The workspace also includes independent order and return journeys, plus linked operating notes. Try Commerce → Payments → Settlement, then follow refund requests to the external payment provider.

Edit the checked-in files under `public/examples/commerce/`. Run `npm run check` to validate hierarchy structure, relationships, workspace loading and layout behavior.
