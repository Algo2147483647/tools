# Service Atlas

A local SVG editor for service relationships, directed data flows, and the architecture inside each service. The interface, source code, documentation, and example content are in English.

The project lives in `tools/service-flow-editor`.

Each workspace is an ordinary folder containing one `workspace.json` and one `<service key>.md` document per service. The JSON contains every graph, node, edge, position, size, and saved path, including all nested levels.

## Run the editor

Requires **Node.js 22.12 or later** and npm. Check `node --version` if more than one Node installation is on your PATH.

On Windows, double-click **`launch.cmd`**. The PowerShell launcher locates a compatible Node installation, installs dependencies when needed, checks TypeScript, builds the application, and opens **http://127.0.0.1:4319/** in your browser. Keep its terminal running while editing. Stop it with `Ctrl+C`.

On macOS, double-click **`launch.command`**. It finds Node.js on your PATH or in standard Homebrew, Volta, and nvm locations, installs missing or incompatible dependencies, builds the editor, and opens the browser after the server is ready. Keep Terminal open while editing; press `Ctrl+C` to stop.

If a downloaded or copied folder has lost executable permissions, run this once from the project folder:

```sh
chmod +x launch.command
./launch.command
```

Alternatively, run `bash launch.command` without changing permissions. Use `bash launch.command --dev` for the development editor on port `4320`. On macOS, enter the workspace folder path in the editor; the native **Browse** folder picker is currently Windows-only.

To run manually from the project folder:

```sh
npm ci
npm run build
npm start
```

Then open **http://127.0.0.1:4319/**. The server binds to the local machine and saves files through a local Node process.

For development:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4320/**. Vite serves the interface on port `4320` and proxies requests to the local backend on port `4319`. The Windows alternative is `powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1 -Dev`. Stop an existing production server before starting development, because both use backend port `4319`.

## Open a workspace

- Choose **Create workspace** to initialize an existing folder or create a new folder path. Enter an optional workspace name, then use **Browse** or type the full folder path.
- Choose **Open workspace** for a folder containing `workspace.json`. The editor restores the complete saved graph structure and geometry.
- The native folder picker is available on Windows; entering a folder path also works without that picker.
- Creating a workspace in a folder that already contains a valid `workspace.json` opens that workspace instead of replacing it.

To explore the included example, open `examples/commerce-platform` as a workspace. It contains **API Gateway → Order Service**, an internal **Validator → Event Publisher** flow, and a **Retry Queue** inside Event Publisher. Copy the example folder first if you want to keep the supplied files unchanged.

## Edit services and flows

Use the **Color theme** menu in the top bar to choose **Ocean**, **Violet**, **Amber**, **Rose**, **Slate**, or **Emerald**. Ocean blue is the default. The palette applies to the entire editor, including the sidebar, canvas, nodes, connectors, and dialogs. The selected theme is remembered in this browser and restored on the next visit. Changing a theme does not modify workspace data.

Use **Add service** to create a rounded rectangular service node. Drag the node to move it; drag its lower-right resize handle to change its dimensions. Its inspector also provides exact position and size fields.

Each service key is unique across the entire workspace, including every nested graph. Comparison is case insensitive, so `Orders` and `orders` cannot coexist. Keys must be valid Windows filenames: no path separators, control characters, `<>:"|?*`, leading or trailing whitespace, trailing dots, or reserved device names such as `CON` and `LPT1`. The maximum key length is 200 characters. Spaces within names are allowed.

Use **Add flow** to choose a source and destination from any level, or drag a white node anchor onto another visible service or anchor. Anchors appear when you hover over or select a node; connection targets also reveal their anchors during a drag. Selection, movement, and connection share the same interaction mode. The source is the service where the drag starts; release on empty space or press `Escape` to cancel. The left anchor shows incoming flows for the node and all its descendants; the right anchor shows outgoing flows for the same subtree. Each flow contributes once per direction, so an internal flow or self loop contributes one incoming and one outgoing count to its ancestors. Counts do not change when expanding, collapsing, or focusing a subgraph. Self loops and connections across nested levels are supported. Arrow tips meet their path endpoints without offsets for anchor visibility or counts. Select a flow to:

- Enter weights, one string per line, such as an HTTP interface, event name, or data type.
- Choose left, right, top, or bottom attachment ports.
- Drag square segment handles to move horizontal or vertical segments parallel to themselves.
- Choose a **Path segment** and click **Add bend** to insert a rectangular detour.
- Click **Reset path** to replace manual bends with an automatic route, or **Reverse direction** to swap the endpoints.

Straight path sections stay horizontal or vertical; SVG curves round their corners. Moving or resizing a service reconnects its edges to the selected ports, including connections to descendants of a moved container. Existing bends are preserved when they can reconnect cleanly. Moving or resizing nodes does not push other nodes away; manual overlaps are allowed. Use segment handles and bends to refine routes when their true endpoints are visible.

New flows and **Reset path** use automatic routing, recalculated from the current endpoints when nodes move. Editing a path or adding a bend switches that flow to manual routing. Moving both endpoints by the same amount translates the complete manual path, including its bends. Moving one endpoint retains usable bends and rebuilds routes that would double back, cross themselves, or cut through an endpoint. Legacy saved paths remain manual unless reset.

Use **Canvas → Node appearance** to set one style for every collapsed node in every graph. Set fill and border colors, enable or hide borders, adjust border width from 0 to 12 px, toggle shadows, and choose a corner radius from 0% to 50% of the shorter side. Circles remain circular. Colors inherit the selected theme until customized; each color can return to its theme default, and **Reset node appearance** restores all defaults. Expanded containers keep their structural styling. Selected nodes have a separate highlight even with borders disabled. Appearance is saved in `workspace.json` and supports undo/redo.

## Explore nested architecture

Double-click a service, select it and press `Enter`, or choose **Expand subgraph** / **Collapse subgraph** to show or hide its internal graph **on the current canvas**. Expanded services become containers; nested services can be expanded the same way. Container bounds fit visible child nodes and internal routes, with padding and a header. They shrink as well as grow after moving, resizing, deleting, or collapsing contents. The boundary wraps the contents without saving leading empty margins. Expanded containers have no manual resize handle; resize the internal nodes instead. Empty containers retain enough space for their add button. Choose **Add service inside** to create a child directly in a service's internal graph.

**Stored X/Y always describe the node in its owning graph with every node collapsed.** Expansion calculates container boundaries, temporary neighboring offsets, and rendered routes without changing stored positions, dimensions, or paths. Collapse removes those display offsets and restores the saved layout. Dragging saves the node's original local coordinate plus the drag delta, never its temporary screen position. The inspector shows the saved coordinates. Manual node overlaps are allowed; only expanded content causes temporary layout adaptation, and existing manual overlaps are preserved. Opening a workspace calculates its display without rewriting coordinates.

To focus on one internal graph, use **Focus subgraph**. Every level has the same service, flow, document, and layout controls. Use **Up one level** or the breadcrumb trail to return.

Right-click an expanded container's header or its empty interior to use **Focus subgraph**. Empty space resolves to the innermost expanded container under the pointer; nodes and flows keep their own context menus. Right-drag still pans without opening a menu.

Drag from a visible external node to a child inside an expanded container to create a cross-level flow. A solid line connects visible true endpoints. When an endpoint is hidden by a collapsed container, a dashed line attaches to that container as a visual proxy; its original service names remain in the flow details. Flows entirely inside the same collapsed container are hidden, including hidden internal self loops. A visible service's own self loop remains visible. Expand the affected containers before editing a proxy path. Expanding and collapsing never replace the stored endpoints or overwrite the canonical saved path with proxy geometry.

The data model has no fixed nesting-depth limit. Graphs are stored as flat records with parent references, so nested graphs do not create separate JSON files. Version 3 defines invariant collapsed graph coordinates, retains stable endpoint IDs and readable service names, and stores each flow in the lowest graph containing both endpoints. Version 1/2 files and recovery drafts migrate in memory; the next successful save writes version 3. Their existing coordinates become the baseline and obsolete `expandedSize` caches are discarded. Historical positions already overwritten by an older editor cannot be reconstructed. See [Workspace format](docs/workspace-format.md) for coordinate and visibility rules. Search in the sidebar finds services across all levels.

## Service documents

The **Document** tab edits the selected service's Markdown file directly. Creating a service creates `<key>.md` automatically. If that file already exists, the service uses its contents. A missing managed document is recreated when opening the workspace.

Renaming a service updates its key, every connected edge reference, and the Markdown filename while retaining the document contents and internal node identity. A rename that would overwrite an unrelated existing document fails with a specific collision message; resolve the file conflict and retry the save.

**Deleting a service deletes its Markdown file, all descendant services and their documents, their internal graphs, and affected flows.** The confirmation dialog describes this action. **Undo** restores the deleted subtree and its original Markdown during the current editing session. Deleting a flow removes only that flow. Unrelated files in the workspace are preserved.

## Undo and multiple selection

Use the top-bar **Undo** and **Redo** buttons, or `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` (`Ctrl+Y` also redoes). Graph history includes additions, deletion, rename, weights, geometry, expansion, and canvas settings. One drag is one step; consecutive edits to the same field are grouped briefly. Undo and redo save automatically using the latest disk revision. A new edit clears the redo stack. The last 100 graph operations are retained while this workspace remains open; reopening, switching workspaces, or reloading resets history. Text fields keep their normal text undo shortcuts.

Deleted Markdown is retained by stable node ID in the local server's memory so undo restores its exact contents. Restarting that server expires deleted-document recovery; an attempted restore then fails clearly and preserves the graph draft instead of creating empty notes. Move any conflicting unrelated Markdown file before retrying a restoration.

Drag empty canvas with the left mouse button to draw a selection box, including blank space inside expanded containers. Move an expanded container by dragging its header. Fully enclosed nodes and flow segments intersecting the box are selected. Hold `Shift` while drawing to add to the selection, or Shift-click a node or flow to toggle it. `Ctrl/Cmd+A` selects all visible elements. Drag a selected service to move selected services as a group; selecting both a container and its children moves them only once. Delete removes the selected elements in one undoable operation, including descendants and incident flows of selected services. Flow paths follow their endpoints during group moves. Pan with right-drag, middle-drag, or `Space` + drag. Right-click without moving opens the context menu; dragging does not open it. On a Mac trackpad, use secondary click and drag, or `Space` + drag.

## Saving and recovery

Graph changes save automatically after a brief editing pause. Document text also saves automatically. The header reports **Unsaved changes**, **Saving changes…**, **All changes saved**, or **Save failed**. The document editor has its own save indicator. Press `Ctrl+S` (`Cmd+S` on macOS) to flush pending changes immediately.

If a graph save fails, the current canvas stays editable and its content stays in memory. Read the error, fix the cause, and choose **Retry save**. Further changes remain pending until retry succeeds. **Download current JSON** exports the current graph as a recovery file. It does not include Markdown contents. If a document save fails, its text remains in the editor and the header reports the error. Use **Retry save** or **Retry document**, or **Download current notes** in the Document tab to keep a Markdown copy. Switching away from unsaved notes waits for the document to save.

The editor also keeps browser graph drafts when browser storage is available. Reopening the same folder restores a draft automatically only when its base revision still matches the disk version. A draft from another revision is offered as **Download recovery JSON** so it does not overwrite newer disk content. Keep the tab open until saving succeeds; browser storage is a recovery aid, not the workspace itself.

Markdown drafts use the workspace path and stable service identity. A matching draft restores automatically. If the document changed on disk, the editor keeps the recovered notes available for download and shows the disk version. Replacing that version with recovered notes requires the explicit recovery button. Temporary session expiry reconnects without replacing unsaved editor text.

Saving compares revisions to detect another editor's committed changes. On a revision conflict, download the current JSON first, reload the editor, and reopen the folder to inspect the saved version. Reconcile the recovery file with that version before replacing anything. For a manual recovery, close the workspace and copy its entire folder before replacing `workspace.json`; keep the corresponding Markdown files with it.

File changes use a transaction journal so the main graph and managed documents can recover together after an interrupted write. If an error mentions `.service-flow-transaction`, preserve that directory and retry after fixing filesystem access. Normal successful saves remove the transaction directory.

## Keyboard and canvas controls

The canvas fills the window. The top bar, service list, and inspector float above it as translucent glass panels. **Fit graph** uses the visible area between the panels; opening or closing a panel does not resize the SVG or change graph coordinates.

Open **Canvas** in the top bar to choose a **Dots** or **Lines** grid, set its spacing from 8 to 128 pixels, enable **Snap to grid**, and set the default node font size from 12 to 48 pixels. Settings save automatically in `workspace.json` and apply to every nested graph. Snapping starts disabled so existing free-form layouts remain unchanged. When enabled, new nodes, dragged positions, resized dimensions, and manually moved flow segments snap to world-space grid coordinates at any zoom level. Numeric property fields still accept exact values.

New and existing nodes have a **Node type** selector. **Service** uses a rounded rectangle; **Source / sink** uses a circle to represent traffic entering or leaving a graph. Circles keep equal width and height and expose a **Diameter** property. They support the same ports, degree counts, documents, nesting, and autosave as service nodes. Direction comes from their connected flows. Nodes no longer contain icons. Labels start at 20 pixels, wrap when possible, and have an individual **Font size (px)** override in Properties; **Use workspace font size** restores inheritance.

Mouse wheel, Ctrl/Command + wheel, and trackpad pinch over the canvas zoom only the graph. While the canvas has keyboard focus, Ctrl/Command + `+`, `-`, and `0` zoom in, zoom out, and reset to 100%. Browser zoom remains available outside the canvas.

| Action                                  | Control                                           |
| --------------------------------------- | ------------------------------------------------- |
| Add service                             | `N`                                               |
| Search all service levels               | `/`                                               |
| Editor guide                            | `?`                                               |
| Expand or collapse selected service     | `Enter`                                           |
| Delete selected elements                | `Delete` or `Backspace`, followed by confirmation |
| Undo / redo                             | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`                 |
| Select visible elements                 | `Ctrl/Cmd+A`                                      |
| Box selection                           | Left drag on empty canvas; `Shift` adds           |
| Fit the current graph                   | `1`                                               |
| Cancel a connection and clear selection | `Escape`                                          |
| Save immediately                        | `Ctrl+S` / `Cmd+S`                                |
| Pan                                     | Right / middle drag or `Space` + drag             |
| Zoom                                    | Scroll, or use the zoom buttons                   |

Use the top-left **Collapse sidebar** / **Expand sidebar** button to toggle the service list; the choice is remembered in this browser. Workspace actions, navigation, and zoom controls share the top bar. Right-click empty canvas to add a service at that location or fit/reset the view. Right-click a service to inspect it, open its document, expand/collapse its subgraph, add a child, focus its subgraph, or delete it; right-click a flow to edit, reverse, reset its path, or delete it.

The toolbar's **Toggle inspector** button shows or hides the properties panel. Compact windows start with it closed to leave more room for the graph. Fonts and application assets load locally; no external account or network connection is needed after installing dependencies.

## Checks and project structure

```sh
npm test
npm run build
npm run test:e2e
npm run format:check
```

The unit tests cover the model, persistence, autosave, and orthogonal routing. Browser tests exercise the editor and are configured to use a locally installed Google Chrome browser.

| Location                                             | Purpose                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `src/`                                               | React interface, SVG canvas, workspace model, routing, and autosave |
| `server/`                                            | Local HTTP API and transactional workspace repository               |
| `tests/`                                             | Unit and browser tests                                              |
| `examples/commerce-platform/`                        | Ready-to-open nested workspace with service documents               |
| [docs/workspace-format.md](docs/workspace-format.md) | JSON fields, references, and persistence behavior                   |
