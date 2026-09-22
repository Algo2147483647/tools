# Workspace format

The canonical graph file is **`workspace.json`** in the workspace folder. It stores the entire workspace, including every nesting level. Each service additionally has a Markdown document named exactly `<key>.md` in the same folder. Markdown text is not embedded in the JSON.

The authoritative TypeScript types and validation rules are in [`src/model.ts`](../src/model.ts). The current schema version is `2`. Version 1 workspaces remain readable and are migrated in memory; the next successful save writes version 2.

## Workspace object

```json
{
  "version": 2,
  "name": "Commerce platform",
  "rootGraphId": "root",
  "graphs": [{ "id": "root", "parentNodeId": null }],
  "nodes": [],
  "edges": [],
  "canvas": { "gridSize": 24, "gridStyle": "dots", "snapToGrid": false, "nodeFontSize": 20 },
  "revision": 0
}
```

| Field         | Type                     | Meaning                                                                  |
| ------------- | ------------------------ | ------------------------------------------------------------------------ |
| `version`     | `2`                      | File format version. Version 1 is migrated; other versions are rejected. |
| `name`        | nonempty string          | Workspace display name.                                                  |
| `rootGraphId` | string                   | ID of the single top-level graph.                                        |
| `graphs`      | graph array              | All graphs, including empty internal graphs.                             |
| `nodes`       | service-node array       | Services from every graph.                                               |
| `edges`       | flow-edge array          | Directed flows from every graph.                                         |
| `revision`    | nonnegative safe integer | Concurrency version incremented after each successful graph save.        |

Arrays are flat. Nesting is expressed through graph and node references, rather than recursively embedded JSON objects. There is no fixed depth limit. Validation follows graph membership iteratively and rejects unreachable or cyclic graph hierarchies.

`canvas` is an optional workspace-wide preference object shared by every graph. Its fields are `gridSize` (integer 8–128), `gridStyle` (`dots` or `lines`), `snapToGrid` (boolean), and `nodeFontSize` (number 12–48). The example above gives the defaults used when an older workspace omits the object. Changing preferences does not move existing geometry. Grid spacing uses world coordinates, independent of zoom and pan.

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
  "expandedSize": { "width": 640, "height": 420 },
  "childGraphId": "order-internal"
}
```

| Field             | Meaning                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable internal identity, unique among nodes. It remains unchanged on rename.                                                       |
| `key`             | Human-readable service name, globally unique across all graphs, compared case insensitively. Also determines the Markdown filename. |
| `graphId`         | ID of the graph containing this node.                                                                                               |
| `x`, `y`          | Finite SVG coordinates of the node's upper-left corner in its own graph.                                                            |
| `width`, `height` | Positive finite collapsed dimensions. The editor applies practical minimum sizes when resizing.                                     |
| `childGraphId`    | ID of this node's internal graph.                                                                                                   |
| `expanded`        | Optional boolean, default `false`. Whether its internal graph is expanded inline.                                                   |
| `expandedSize`    | Derived positive finite `width` and `height` of the expanded content bounds, required when `expanded` is `true`.                    |

The example creates `Order Service.md`. All documents remain at the workspace root, so global key uniqueness prevents document collisions even between distant nested graphs.

`type` is optional and defaults to `service` (rounded rectangle). `terminal` represents a traffic source or sink, rendered as a circle; its `width` and `height` must be equal. Both types have identical document ownership, global key uniqueness, nesting, and flow behavior. A terminal's incoming/outgoing flows determine whether it acts as a source, sink, or both. Cardinal ports remain at the bounding-box side centers, which are also points on the circle. Routes conservatively avoid the circle's bounding box.

`fontSize` is an optional number from 12 to 48. Omitting it inherits `canvas.nodeFontSize` (20 by default). Old nodes keep their stored positions, dimensions, and routes on migration.

Expanded nodes are containers on the same canvas. Child coordinates remain local to their containing graph. The child graph's origin is offset from its parent node's upper-left corner by **32 units horizontally and 56 units vertically**; these offsets accumulate through nested containers. Expanded size is derived from visible child rectangles and routes owned by that child graph, plus padding. External cross-level routes do not enlarge the container. The editor removes both positive and negative leading offsets by translating child positions and local paths while counter-translating the container; existing content keeps its world position. Dimensions shrink or grow when contents move, resize, disappear, or collapse. Conflicting siblings move aside. Empty containers use a compact minimum of 240 × 144 to fit their controls. Expanded dimensions cannot be resized manually and are independent of the collapsed width and height. Opening an older file refits expanded containers and autosaves only if the layout changed; it does not add an undo step. Descendants retain their expansion state when an ancestor is collapsed. Expanded circular source/sink nodes use a container outline while their original circular collapsed geometry remains stored.

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

Flows may connect any two nodes in the workspace, including a parent and its own descendant or nodes inside different nested services. Self loops are allowed. IDs are authoritative identities; a file whose name copies disagree with the referenced IDs is rejected instead of guessing which endpoint was intended. No boundary proxy nodes or synthetic edges are stored.

An edge is owned by the lowest common ancestor of its endpoint **membership graphs**. A same-graph edge retains that graph's ID. For `API Gateway` in `root` connected to `Validator` in `order-internal`, the owner is `root`. For `Order Service` connected to its own internal `Validator`, the owner is also `root`, since Order Service itself belongs to root. For two descendants of Order Service in separate internal branches, the owner is `order-internal`.

Ports are the centers of the selected node sides:

| Side     | Anchor                        |
| -------- | ----------------------------- |
| `left`   | `(x, y + height / 2)`         |
| `right`  | `(x + width, y + height / 2)` |
| `top`    | `(x + width / 2, y)`          |
| `bottom` | `(x + width / 2, y + height)` |

The first and last canonical path points are the true endpoint anchors, transformed into the owning graph's coordinates by adding the intervening ancestor origins. Canonical geometry uses a node's derived expanded dimensions when present, independent of whether it is currently collapsed; otherwise it uses its collapsed dimensions. It does not force all descendants to expand. Every pair of consecutive points shares an `x` or `y` coordinate. Coordinates can be fractional. The SVG renderer rounds corners visually; it does not store quadratic curve commands in the workspace. Arrow markers place their tip at the final path point without adjusting for port radius. A stored route contains endpoint positions and all straight-line turns, so the same path can be rendered again after reopening.

The model accepts an empty `points` array as an unrouted edge; normal editor-created edges contain a complete route. A nonempty route must contain at least two points. Preserve full routes when editing files outside the application.

Moving or resizing a node reattaches its routes to their port anchors while preserving existing bends where possible. Moving an expanded ancestor also updates cross-boundary flows attached to its descendants. Manual geometry is preserved exactly when its canonical anchors have not changed and its path remains clear of obstacles. A route can be regenerated if its old geometry cannot support valid connections. Changing a port or selecting **Reset path** generates a new route. Routes are orthogonal; layout moves overlapping sibling containers so their contents remain separate.

## Expansion and connection display

Expansion controls visible representatives without changing endpoint identity or graph ownership. A node's representative on the current canvas is the node itself if visible, or its nearest visible collapsed ancestor if hidden.

| Endpoint visibility                                         | Display rule                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Both true endpoints are visible                             | Draw a solid directed flow between their actual anchors.                                                                                 |
| One or both endpoints are hidden by collapsed containers    | Draw a dashed proxy flow between their visible representatives. Keep the true endpoint names available in flow details.                  |
| Both endpoints resolve to the same collapsed representative | Hide the flow; it is internal to that container. A visible node's own self loop remains visible.                                         |
| Expanding a previously collapsed ancestor                   | Replace its proxy attachment with the newly visible endpoint or next visible collapsed descendant, without changing stored endpoint IDs. |

Proxy paths are derived presentation geometry. They must never replace `sourceNodeId`, `targetNodeId`, or canonical `points` in the file. Automatic layout may reconnect canonical routes when element bounds change; it never saves a proxy in their place. Route editing is available when the visible path matches the canonical path: expand containers before adjusting a hidden endpoint or an endpoint whose collapsed size differs from its expanded dimensions. Parallel flows remain separate records with their own weights even when they share visible proxy endpoints.

Port degree labels aggregate the node and all descendants, using stable endpoint IDs. Each edge contributes once to incoming degree for its target and every target ancestor, and once to outgoing degree for its source and every source ancestor. An edge internal to a subtree contributes one incoming and one outgoing count to its root; it is not counted twice in either direction. Self loops follow the same rule. This is independent of expansion, projection, or focused view.

## Editing history

Undo/redo snapshots are session state and are not serialized in `workspace.json`. The client keeps up to 100 graph operations; pointer gestures and successive field edits are grouped. Restoring a snapshot keeps the latest acknowledged `revision` and schedules a normal transactional autosave. Deleted Markdown contents are cached by stable node ID in the local server process and restored transactionally with the graph. Missing recovery contents or unrelated filename collisions cause an explicit save failure instead of silently losing or replacing documents. Opening another workspace, reopening the current workspace, or reloading clears the graph history; server restart clears deleted-document recovery. Multi-selection and canvas viewport state are also transient.

## Version 1 migration

Version 1 edges use exact node keys and may only connect nodes in the same graph. Migration resolves each existing key to its stable node ID, adds `sourceNodeId` and `targetNodeId`, and sets `version` to `2`. It preserves graph ownership, node positions and dimensions, routes, weights, document contents, and the revision. Missing expansion fields mean collapsed. Invalid legacy cross-graph flows remain errors, so migration does not silently reinterpret an invalid old file.

Opening does not rewrite the main JSON solely to migrate it. The next ordinary successful graph save persists version 2 through the existing transaction and increments the revision once. New workspaces use version 2 immediately. External producers must include valid endpoint IDs and synchronized name copies for every version 2 flow.

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
