# Workspace format

The canonical graph file is **`workspace.json`** in the workspace folder. It stores the entire workspace, including every nesting level. Each service additionally has a Markdown document named exactly `<key>.md` in the same folder. Markdown text is not embedded in the JSON.

The authoritative TypeScript types and validation rules are in [`src/model.ts`](../src/model.ts). The current schema version is `1`.

## Workspace object

```json
{
  "version": 1,
  "name": "Commerce platform",
  "rootGraphId": "root",
  "graphs": [{ "id": "root", "parentNodeId": null }],
  "nodes": [],
  "edges": [],
  "canvas": { "gridSize": 24, "gridStyle": "dots", "snapToGrid": false, "nodeFontSize": 20 },
  "revision": 0
}
```

| Field         | Type                     | Meaning                                                           |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| `version`     | `1`                      | File format version. Unsupported versions are rejected.           |
| `name`        | nonempty string          | Workspace display name.                                           |
| `rootGraphId` | string                   | ID of the single top-level graph.                                 |
| `graphs`      | graph array              | All graphs, including empty internal graphs.                      |
| `nodes`       | service-node array       | Services from every graph.                                        |
| `edges`       | flow-edge array          | Directed flows from every graph.                                  |
| `revision`    | nonnegative safe integer | Concurrency version incremented after each successful graph save. |

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
  "childGraphId": "order-internal"
}
```

| Field             | Meaning                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable internal identity, unique among nodes. It remains unchanged on rename.                                                       |
| `key`             | Human-readable service name, globally unique across all graphs, compared case insensitively. Also determines the Markdown filename. |
| `graphId`         | ID of the graph containing this node.                                                                                               |
| `x`, `y`          | Finite SVG coordinates of the node's upper-left corner in its own graph.                                                            |
| `width`, `height` | Positive finite dimensions. The editor applies practical minimum sizes when resizing.                                               |
| `childGraphId`    | ID of this node's internal graph.                                                                                                   |

The example creates `Order Service.md`. All documents remain at the workspace root, so global key uniqueness prevents document collisions even between distant nested graphs.

`type` is optional and defaults to `service` (rounded rectangle). `terminal` represents a traffic source or sink, rendered as a circle; its `width` and `height` must be equal. Both types have identical document ownership, global key uniqueness, nesting, and flow behavior. A terminal's incoming/outgoing flows determine whether it acts as a source, sink, or both. Cardinal ports remain at the bounding-box side centers, which are also points on the circle. Routes conservatively avoid the circle's bounding box.

`fontSize` is an optional number from 12 to 48. Omitting it inherits `canvas.nodeFontSize` (20 by default). These additions are backward compatible with version 1: old nodes keep their stored positions, dimensions, and routes.

Keys must contain 1–200 characters, must not start or end with whitespace, and must not end with a dot. They must not contain path separators, control characters, or any of `<>:"|?*`. Windows reserved device names are rejected, including their extension variants. Renaming a key also updates all `source` and `target` references using the old key. The node's `id`, graph ownership, and document contents remain stable.

## Flow-edge records

```json
{
  "id": "flow-orders",
  "graphId": "root",
  "source": "API Gateway",
  "target": "Order Service",
  "weights": ["POST /orders", "OrderRequest"],
  "sourceSide": "right",
  "targetSide": "left",
  "points": [
    { "x": 304, "y": 202 },
    { "x": 550, "y": 202 }
  ]
}
```

| Field                      | Meaning                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                       | Unique edge identity.                                                                                  |
| `graphId`                  | Graph containing the flow and both endpoint services.                                                  |
| `source`, `target`         | Exact, case-sensitive spellings of the endpoint service **keys**, not node IDs.                        |
| `weights`                  | Array of strings, including an empty array when the flow has no descriptions.                          |
| `sourceSide`, `targetSide` | One of `left`, `right`, `top`, or `bottom`.                                                            |
| `points`                   | Full ordered route from source anchor to target anchor. Each point contains finite `x` and `y` values. |

Flows connect services within the same graph. Self loops are allowed. An interface between a parent service and an internal component is represented by the service's separate external and internal graphs; an edge does not cross graph boundaries.

Ports are the centers of the selected node sides:

| Side     | Anchor                        |
| -------- | ----------------------------- |
| `left`   | `(x, y + height / 2)`         |
| `right`  | `(x + width, y + height / 2)` |
| `top`    | `(x + width / 2, y)`          |
| `bottom` | `(x + width / 2, y + height)` |

The first and last path points are these anchors. Every pair of consecutive points shares an `x` or `y` coordinate. Coordinates can be fractional. The SVG renderer rounds corners visually; it does not store quadratic curve commands in the workspace. A stored route contains endpoint positions and all straight-line turns, so the same path can be rendered again after reopening.

The model accepts an empty `points` array as an unrouted edge; normal editor-created edges contain a complete route. A nonempty route must contain at least two points. Preserve full routes when editing files outside the application.

Moving or resizing a node reattaches its routes to their port anchors while preserving existing bends where possible. Manual geometry is preserved exactly when its anchors have not changed. A route can be regenerated if its old geometry cannot support valid connections. Changing a port or selecting **Reset path** generates a new route. Automatic routing considers the endpoint rectangles and has no global avoidance of unrelated nodes.

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
