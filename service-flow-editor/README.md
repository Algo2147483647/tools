# Service Atlas

A local SVG editor for service relationships, directed data flows, and the architecture inside each service. The interface, source code, documentation, and example content are in English.

The project lives in `tools/service-flow-editor`.

Each workspace is an ordinary folder containing one `workspace.json` and one `<service key>.md` document per service. The JSON contains every graph, node, edge, position, size, and saved path, including all nested levels.

## Run the editor

Requires **Node.js 22.12 or later** and npm. Check `node --version` if more than one Node installation is on your PATH.

On Windows, double-click **`launch.cmd`**. The PowerShell launcher locates a compatible Node installation, installs dependencies when needed, checks TypeScript, builds the application, and opens **http://127.0.0.1:4319/** in your browser. Keep its terminal running while editing. Stop it with `Ctrl+C`.

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

Use **Add flow** to choose a source and destination, or enable **Connect** and click a source followed by a destination. Self loops are supported. Select a flow to:

- Enter weights, one string per line, such as an HTTP interface, event name, or data type.
- Choose left, right, top, or bottom attachment ports.
- Drag square segment handles to move horizontal or vertical segments parallel to themselves.
- Choose a **Path segment** and click **Add bend** to insert a rectangular detour.
- Click **Reset path** to replace manual bends with an automatic route, or **Reverse direction** to swap the endpoints.

Straight path sections stay horizontal or vertical; SVG curves round their corners. Moving or resizing a service reconnects its edges to the selected ports. Saved manual points remain unchanged when the endpoints have not moved. A substantial geometry change can require a fresh route if the old bends cannot reconnect cleanly. Automatic routing considers the two endpoint rectangles; it does not avoid every unrelated node. Use segment handles and bends to route around other services.

## Explore nested architecture

Double-click a service, select it and press `Enter`, or choose **Explore inside** to enter its internal graph. Every level has the same service, flow, document, and layout controls. Use **Up one level** or the breadcrumb trail to return.

The data model has no fixed nesting-depth limit. Graphs are stored as flat records with parent references, so nested graphs do not create separate JSON files. Search in the sidebar finds services across all levels. Canvas pan and zoom are viewing controls; node geometry and edge routes are the persisted layout.

## Service documents

The **Document** tab edits the selected service's Markdown file directly. Creating a service creates `<key>.md` automatically. If that file already exists, the service uses its contents. A missing managed document is recreated when opening the workspace.

Renaming a service updates its key, every connected edge reference, and the Markdown filename while retaining the document contents and internal node identity. A rename that would overwrite an unrelated existing document fails with a specific collision message; resolve the file conflict and retry the save.

**Deleting a service deletes its Markdown file, all descendant services and their documents, their internal graphs, and affected flows.** The confirmation dialog describes this action. There is no undo command. Deleting a flow removes only that flow. Unrelated files in the workspace are preserved.

## Saving and recovery

Graph changes save automatically after a brief editing pause. Document text also saves automatically. The header reports **Unsaved changes**, **Saving changes…**, **All changes saved**, or **Save failed**. The document editor has its own save indicator. Press `Ctrl+S` (`Cmd+S` on macOS) to flush pending changes immediately.

If a graph save fails, the current canvas stays editable and its content stays in memory. Read the error, fix the cause, and choose **Retry save**. Further changes remain pending until retry succeeds. **Download current JSON** exports the current graph as a recovery file. It does not include Markdown contents. If a document save fails, its text remains in the editor and the header reports the error. Use **Retry save** or **Retry document**, or **Download current notes** in the Document tab to keep a Markdown copy. Switching away from unsaved notes waits for the document to save.

The editor also keeps browser graph drafts when browser storage is available. Reopening the same folder restores a draft automatically only when its base revision still matches the disk version. A draft from another revision is offered as **Download recovery JSON** so it does not overwrite newer disk content. Keep the tab open until saving succeeds; browser storage is a recovery aid, not the workspace itself.

Markdown drafts use the workspace path and stable service identity. A matching draft restores automatically. If the document changed on disk, the editor keeps the recovered notes available for download and shows the disk version. Replacing that version with recovered notes requires the explicit recovery button. Temporary session expiry reconnects without replacing unsaved editor text.

Saving compares revisions to detect another editor's committed changes. On a revision conflict, download the current JSON first, reload the editor, and reopen the folder to inspect the saved version. Reconcile the recovery file with that version before replacing anything. For a manual recovery, close the workspace and copy its entire folder before replacing `workspace.json`; keep the corresponding Markdown files with it.

File changes use a transaction journal so the main graph and managed documents can recover together after an interrupted write. If an error mentions `.service-flow-transaction`, preserve that directory and retry after fixing filesystem access. Normal successful saves remove the transaction directory.

## Keyboard and canvas controls

| Action                                 | Control                                           |
| -------------------------------------- | ------------------------------------------------- |
| Add service                            | `N`                                               |
| Toggle connect mode                    | `C`                                               |
| Select mode                            | `V`                                               |
| Search all service levels              | `/`                                               |
| Editor guide                           | `?`                                               |
| Enter selected service                 | `Enter`                                           |
| Delete selected service or flow        | `Delete` or `Backspace`, followed by confirmation |
| Fit the current graph                  | `1`                                               |
| Leave connect mode and clear selection | `Escape`                                          |
| Save immediately                       | `Ctrl+S` / `Cmd+S`                                |
| Pan                                    | Drag an empty part of the canvas                  |
| Zoom                                   | Scroll, or use the zoom buttons                   |

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
