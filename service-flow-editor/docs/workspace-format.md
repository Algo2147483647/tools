# Workspace format

The canonical graph file is **`workspace.json`** in the workspace folder. It stores the entire workspace, including every nesting level. Each service additionally has a Markdown document named exactly `<key>.md` in the same folder. Markdown text is not embedded in the JSON.

The authoritative TypeScript types and validation rules are in [`src/model.ts`](../src/model.ts). The current schema version is `3`. Version 1 and 2 workspaces remain readable and are migrated in memory; the next successful save writes version 3.

## Workspace object

```json
{
  "version": 3,
  "name": "Commerce platform",
  "rootGraphId": "root",
  "graphs": [{ "id": "root", "parentNodeId": null }],
  "nodes": [],
  "edges": [],
  "canvas": { "gridSize": 24, "gridStyle": "dots", "snapToGrid": false, "nodeFontSize": 20 },
  "revision": 0
}
```

| Field         | Type                     | Meaning                                                                      |
| ------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `version`     | `3`                      | File format version. Versions 1/2 are migrated; other versions are rejected. |
| `name`        | nonempty string          | Workspace display name.                                                      |
| `rootGraphId` | string                   | ID of the single top-level graph.                                            |
| `graphs`      | graph array              | All graphs, including empty internal graphs.                                 |
| `nodes`       | service-node array       | Services from every graph.                                                   |
| `edges`       | flow-edge array          | Directed flows from every graph.                                             |
| `revision`    | nonnegative safe integer | Concurrency version incremented after each successful graph save.            |

Arrays are flat. Nesting is expressed through graph and node references, rather than recursively embedded JSON objects. There is no fixed depth limit. Validation follows graph membership iteratively and rejects unreachable or cyclic graph hierarchies.

`canvas` is an optional workspace-wide preference object shared by every graph. Its fields are `gridSize` (integer 8–128), `gridStyle` (`dots` or `lines`), `snapToGrid` (boolean), and `nodeFontSize` (number 12–48). The example above gives the defaults used when an older workspace omits the object. Changing preferences does not move existing geometry. Grid spacing uses world coordinates, independent of zoom and pan.

`nodeAppearance` is an optional workspace-wide style shared by all nested graphs and both node types. Shape and shadow settings apply to collapsed nodes; typography also applies to expanded container headers:

```json
{
  "nodeAppearance": {
    "fillColor": "#eff6ff",
    "borderColor": "#8b5cf6",
    "borderEnabled": true,
    "borderWidth": 1.3,
    "shadow": true,
    "shadowOpacity": 0.32,
    "shadowBlur": 5,
    "shadowOffsetY": 5,
    "fontFamily": "sans",
    "fontColor": "#172033",
    "fontWeight": 700,
    "fontItalic": false,
    "lineHeight": 1.25,
    "cornerRadius": 0.15
  }
}
```

All three colors are optional six-digit hex values; omit a color to inherit its current theme color. `borderEnabled` and `shadow` are booleans; `borderWidth` is finite from 0 to 12; `cornerRadius` is finite from 0 to 0.5 and multiplies the shorter rectangle side. Omitting the entire object gives theme colors, enabled borders at 1.3 px, enabled shadows, and radius 0.15. Expanded containers retain structural styling and circles remain circles. Selection highlights are separate presentation geometry. Changes do not alter node geometry or route anchors.

Shadow and typography fields are individually optional for compatibility with existing version 3 files. Missing fields receive the defaults shown above, except `fontColor`, which inherits the theme. Shadows are pure black: `shadowOpacity` is finite from 0 to 1; `shadowBlur` is the SVG Gaussian standard deviation from 0 to 24 world units; `shadowOffsetY` is a downward offset from 0 to 24 world units. The SVG filter region grows to contain the blur, including on small nodes. Turning shadows off preserves their settings.

`fontFamily` is one of `sans`, `system`, `serif`, or `mono`, mapped to a local font stack; unavailable fonts use the stack's fallback. `fontWeight` is a multiple of 100 from 100 to 900, `fontItalic` is a boolean, and `lineHeight` is a finite multiplier from 1 to 2. Font size remains in `canvas.nodeFontSize` (default) and `nodes[].fontSize` (optional override). These preferences affect rendering and label wrapping only.

## Graph records

```json
{ "id": "order-internal", "parentNodeId": "node-order" }
```

Graph IDs are unique. The root graph has `parentNodeId: null`. Every other graph belongs to one service node, referenced by its internal `id`; that node's `childGraphId` must point back to the graph. Every service has exactly one internal graph, even when it is empty.

## Service-node records

```json
{
  "id": "node-order",
  "key": "Order Service",
  "graphId": "root",
  "x": 550,
  "y": 140,
  "width": 224,
  "height": 124,
  "type": "service",
  "fontSize": 24,
  "expanded": true,
  "childGraphId": "order-internal"
}
```

| Field             | Meaning                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable internal identity, unique among nodes. It remains unchanged on rename.                                                       |
| `key`             | Human-readable service name, globally unique across all graphs, compared case insensitively. Also determines the Markdown filename. |
| `graphId`         | ID of the graph containing this node.                                                                                               |
| `x`, `y`          | Finite coordinates of the node's collapsed upper-left corner in its owning graph, with every node in that graph collapsed.          |
| `width`, `height` | Positive finite collapsed dimensions. The editor applies practical minimum sizes when resizing.                                     |
| `childGraphId`    | ID of this node's internal graph.                                                                                                   |
| `expanded`        | Optional boolean, default `false`. Whether its internal graph is expanded inline.                                                   |

The example creates `Order Service.md`. All documents remain at the workspace root, so global key uniqueness prevents document collisions even between distant nested graphs.

`type` is optional and defaults to `service` (rounded rectangle). `terminal` represents a traffic source or sink, rendered as a circle; its `width` and `height` must be equal. Both types have identical document ownership, global key uniqueness, nesting, and flow behavior. A terminal's incoming/outgoing flows determine whether it acts as a source, sink, or both. Cardinal ports remain at the bounding-box side centers, which are also points on the circle.

`fontSize` is an optional number from 12 to 48. Omitting it inherits `canvas.nodeFontSize` (20 by default). Old nodes keep their stored positions, dimensions, and routes on migration.

### Canonical coordinates and display geometry

Node `x`/`y` are stable local coordinates in the owning graph's **all-collapsed layout**. `width`/`height` are always collapsed dimensions. Negative coordinates and intentional overlaps are valid. Expansion must not write back neighboring offsets, normalized child coordinates, expanded bounds, or display routes. Only explicit geometry edits change stored geometry. A drag applies `newLocal = initialLocal + pointerDelta / zoom`; it never substitutes a temporary display position. The properties inspector edits these canonical local values.

To transform canonical geometry between graphs, a child graph's origin is its parent's canonical position plus **(32, 56)** in the containing graph. Origins accumulate through ancestors independently of visibility. Focused graph views use that graph as their local origin.

The display is computed from the saved model, bottom-up. First determine each graph's visible node and internally owned route bounds. An expanded node wraps these bounds with 32 units of horizontal padding, a 56-unit header, and 32 units below. Its display position is its baseline position plus the internal bounds' minimum coordinates; its child origin remains the baseline plus (32, 56). Thus leading empty space disappears without rewriting or normalizing child coordinates. Display bounds shrink as well as grow. External flows do not enlarge a container; empty containers use a compact 240 × 144 minimum. Circular nodes use a rectangular container while expanded.

Expansion may temporarily displace siblings and their descendants to make room. This is presentation geometry only; existing manual overlaps remain allowed and there is no general move/resize collision correction. Collapsing removes expansion-induced offsets. Rendering, focusing a graph, and reopening do not alter canonical coordinates or routes. Descendants retain their expansion flags when an ancestor is collapsed. The legacy `expandedSize` cache is discarded on load and is not saved in version 3.

Keys must contain 1–200 characters, must not start or end with whitespace, and must not end with a dot. They must not contain path separators, control characters, or any of `<>:"|?*`. Windows reserved device names are rejected, including their extension variants. Renaming a key updates all `source` and `target` name copies, including cross-hierarchy flows. Endpoint IDs, the node's `id`, graph ownership, and document contents remain stable.

## Flow-edge records

```json
{
  "id": "flow-orders",
  "graphId": "root",
  "source": "API Gateway",
  "target": "Order Service",
  "sourceNodeId": "node-gateway",
  "targetNodeId": "node-order",
  "weights": ["POST /orders", "OrderRequest"],
  "sourceSide": "right",
  "targetSide": "left",
  "points": [
    { "x": 304, "y": 202 },
    { "x": 550, "y": 202 }
  ]
}
```

| Field                          | Meaning                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `id`                           | Unique edge identity.                                                                                  |
| `graphId`                      | Lowest common containing graph of the two endpoint nodes. Defines the route coordinate space.          |
| `sourceNodeId`, `targetNodeId` | Required stable IDs of the actual endpoint nodes, regardless of visible expansion state.               |
| `source`, `target`             | Required exact, case-sensitive copies of the endpoint service **keys**, for human readability.         |
| `weights`                      | Array of strings, including an empty array when the flow has no descriptions.                          |
| `sourceSide`, `targetSide`     | One of `left`, `right`, `top`, or `bottom`.                                                            |
| `points`                       | Full ordered route from source anchor to target anchor. Each point contains finite `x` and `y` values. |
| `routing`                      | Optional `auto` or `manual`. Missing values preserve legacy manual paths.                              |

Flows may connect any two nodes in the workspace, including a parent and its own descendant or nodes inside different nested services. Self loops are allowed. IDs are authoritative identities; a file whose name copies disagree with the referenced IDs is rejected instead of guessing which endpoint was intended. No boundary proxy nodes or synthetic edges are stored.

An edge is owned by the lowest common ancestor of its endpoint **membership graphs**. A same-graph edge retains that graph's ID. For `API Gateway` in `root` connected to `Validator` in `order-internal`, the owner is `root`. For `Order Service` connected to its own internal `Validator`, the owner is also `root`, since Order Service itself belongs to root. For two descendants of Order Service in separate internal branches, the owner is `order-internal`.

Ports are the centers of the selected node sides:

| Side     | Anchor                        |
| -------- | ----------------------------- |
| `left`   | `(x, y + height / 2)`         |
| `right`  | `(x + width, y + height / 2)` |
| `top`    | `(x + width / 2, y)`          |
| `bottom` | `(x + width / 2, y + height)` |

The first and last canonical path points are the true endpoint anchors in the **all-collapsed** geometry, transformed into the edge's owning graph by adding the canonical ancestor origins. Every pair of consecutive points shares an `x` or `y` coordinate. Coordinates can be fractional. The SVG renderer rounds corners visually; quadratic curves and display-only endpoint adjustments are not stored. Arrow tips meet the final rendered path point without offsets for port radius.

The model accepts an empty `points` array as an unrouted edge; normal editor-created edges contain a complete route. A nonempty route must contain at least two points. Preserve full routes when editing files outside the application.

New flows and reset paths use `routing: "auto"`; their routes are regenerated from current anchors instead of accumulating old endpoint detours. An explicit path edit switches to `manual`. Equal endpoint displacement translates every manual path point rigidly. Otherwise, manual bends survive where they can reconnect with outward ports and without self-intersections, retraced segments, or cutting through an endpoint. Invalid reconnections fall back to a fresh orthogonal route. Automatic display routes still never overwrite stored points solely because a node expands or collapses.

Explicitly moving or resizing a node reattaches canonical routes to the collapsed port anchors while preserving existing bends where possible. Moving an ancestor also updates cross-boundary flows attached to its descendants. Unchanged endpoint geometry preserves a manual route, including intentional overlaps. A route can be regenerated if its old bends cannot reconnect orthogonally. Changing a port or selecting **Reset path** generates a new route. Expanding or collapsing alone never changes canonical paths.

## Expansion and connection display

Expansion controls visible representatives without changing endpoint identity or graph ownership. A node's representative on the current canvas is the node itself if visible, or its nearest visible collapsed ancestor if hidden.

| Endpoint visibility                                         | Display rule                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Both true endpoints are visible                             | Draw a solid directed flow between their actual anchors.                                                                                 |
| One or both endpoints are hidden by collapsed containers    | Draw a solid proxy flow between their visible representatives. Keep the true endpoint names available in flow details.                   |
| Both endpoints resolve to the same collapsed representative | Hide the flow; it is internal to that container. A visible node's own self loop remains visible.                                         |
| Expanding a previously collapsed ancestor                   | Replace its proxy attachment with the newly visible endpoint or next visible collapsed descendant, without changing stored endpoint IDs. |

Proxy paths and expanded endpoint adaptations are presentation geometry. They never replace endpoint IDs or canonical `points`. Route editing is available when both true endpoints are visible. A deliberate path edit is transformed from display space back into the owner's canonical frame and reattached to the collapsed anchors before saving. Hidden proxy paths cannot be edited. Parallel flows remain separate records with their own weights even when they share visible proxy endpoints.

Port degree labels aggregate the node and all descendants, using stable endpoint IDs. Each edge contributes once to incoming degree for its target and every target ancestor, and once to outgoing degree for its source and every source ancestor. An edge internal to a subtree contributes one incoming and one outgoing count to its root; it is not counted twice in either direction. Self loops follow the same rule. This is independent of expansion, projection, or focused view.

## Editing history

Undo/redo snapshots are session state and are not serialized in `workspace.json`. The client keeps up to 100 graph operations; pointer gestures and successive field edits are grouped. Restoring a snapshot keeps the latest acknowledged `revision` and schedules a normal transactional autosave. Deleted Markdown contents are cached by stable node ID in the local server process and restored transactionally with the graph. Missing recovery contents or unrelated filename collisions cause an explicit save failure instead of silently losing or replacing documents. Opening another workspace, reopening the current workspace, or reloading clears the graph history; server restart clears deleted-document recovery. Multi-selection and canvas viewport state are also transient.

## Version 1 and 2 migration

Version 1 edges use exact node keys and may only connect nodes in the same graph. Migration resolves each key to its stable node ID and adds `sourceNodeId` and `targetNodeId`. Version 2 already has these identities. Both migrate to version 3, retaining recorded positions and dimensions as the collapsed baseline, graph ownership, routes, weights, documents, and revision. Legacy `expandedSize` caches are discarded. The previous format did not retain pre-expansion positions, so coordinates already rewritten by older editors cannot be recovered reliably; migration does not guess them. Legacy route anchors are reattached in canonical coordinates on an explicit geometry edit. Missing expansion flags mean collapsed; invalid legacy cross-graph flows remain errors.

Opening does not rewrite the main JSON solely to migrate or fit its display. The next ordinary successful graph save persists version 3 through the existing transaction and increments the revision once. New workspaces use version 3 immediately. External producers must include valid endpoint IDs and synchronized name copies for every version 2 or 3 flow.

## Documents and disk operations

Creating a node associates an existing same-name Markdown document or creates a starter file. On rename, the repository follows the stable node `id` to retain the original document content under the new filename. It refuses to overwrite an unrelated document at the destination. A case-only rename updates the filename spelling.

Deleting a service removes its document, descendants, descendant documents, internal graphs, and affected flows. Files unrelated to any managed service are preserved. Missing managed Markdown files are recreated during workspace opening. Symbolic links and directories cannot replace the main JSON or managed document files.

The repository serializes operations per workspace directory. Graph saves validate the entire proposed workspace and compare its revision against the current disk revision. A successful save writes revision `previous + 1`; stale revisions receive a conflict error. Markdown text edits use their own writes and do not increment the graph revision. This is a local editor, not a simultaneous multi-user document collaboration system.

Graph and document filename mutations are staged together in `.service-flow-transaction`. Backups and a journal support rollback before commit and recovery on the next open or save. This directory is temporary transaction metadata, not an additional authoritative graph file. Do not remove it if the application reports that recovery is required.

When manually editing `workspace.json`, close the editor and back up the whole workspace folder first. Keep references, filenames, anchors, and orthogonal path coordinates consistent. Opening validates the complete file and reports errors instead of silently dropping invalid records.

## Example hierarchy

The supplied [`commerce-platform`](../examples/commerce-platform/workspace.json) example contains five services and six graph records:

```text
Overview
├── API Gateway
└── Order Service
    ├── Validator
    └── Event Publisher
        └── Retry Queue
```

The root flow is `API Gateway → Order Service`. Inside Order Service, `Validator → Event Publisher` describes the validated event stream. Inside Event Publisher, Retry Queue has a self loop representing scheduled redelivery. The remaining internal graphs are empty and ready for further decomposition.
