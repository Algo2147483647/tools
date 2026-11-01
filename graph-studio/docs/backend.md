# Local backend

Graph Studio runs a local Node.js/TypeScript service. `launch.cmd`, `launch.ps1`, `launch.command`, `npm start`, `npm run dev`, and `npm run preview` all use the shared launcher. Node.js 22.12 or newer is required.

## Startup and lifecycle

The launcher builds the backend into `.server/main.mjs`. Development serves Vite middleware and the API through one HTTP listener. Preview mode builds the frontend and backend and serves `dist/` through the same local service. A readiness URL is printed only after both are ready. Closing the runtime stops HTTP, event streams, file watchers, and Vite. Ctrl+C and SIGTERM initiate that shutdown.

The service listens on `127.0.0.1`. `GRAPH_STUDIO_PORT` optionally selects a port; otherwise the OS allocates one. `GRAPH_STUDIO_STATE_DIR` overrides the user-state directory for isolated instances and tests. A process lock prevents two services from writing the same state directory. A stale lock from a dead process is recovered at startup. Do not delete the lock while its process is alive.

User state is stored outside workspaces:

| Platform | Default directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%/Graph Studio` |
| macOS | `~/Library/Application Support/Graph Studio` |
| Linux | `$XDG_STATE_HOME/graph-studio`, or `~/.local/state/graph-studio` |

`state.json` contains stable location IDs, canonical paths, last-opened timestamps, and the last graph. Removing a recent entry only hides the entry; it never deletes project files. Missing directories remain listed and can be relocated with the system chooser. Existing browser-handle histories cannot reveal absolute paths and are not migrated automatically: open those directories once using the new chooser. Unsaved graph edits are still in-memory and do not survive a tab reload.

## Workspace discovery

A workspace is an existing directory. Creating one makes a new directory with `graph.json`; it does not require a manifest. A valid optional manifest names the workspace and orders its declared graphs, followed by newly discovered graph documents. Malformed manifests and missing declared files are diagnostics. They never hide otherwise valid graph files. `defaultGraph` is not supported. Startup selects a valid recent graph, root `graph.json`, or a sole graph; otherwise the explorer remains open for selection.

Hidden/generated directories and filesystem links are skipped during enumeration. Discovery is asynchronous and permits more than 1,000 JSON candidates without requiring a manifest. Limits are 20,000 files and 32 directory levels; graph JSON validation retains its 16 MB limit. File reads and writes are limited to 32 MB. Discovery returns a completed snapshot; the paginated file-list endpoint returns 500 paths per page.

## API

All routes below are under `/api/v1`. Errors return `{ "error": { "code": "FILE_CHANGED", "message": "..." } }` with an appropriate HTTP status.

| Method and route | Behavior |
| --- | --- |
| `GET /session` | Establish HttpOnly SameSite session cookie and obtain request token |
| `GET /preferences` | Read application preferences, including `fileOpenMode` |
| `PATCH /preferences` | Persist `{fileOpenMode: "preview" \| "external"}` in user state |
| `POST /dialogs/directory` | System folder chooser; returns `{path}` or `{path:null}` on cancellation |
| `POST /dialogs/file` | System file chooser |
| `POST /dialogs/save` | Save chooser; accepts optional `name` |
| `POST /workspaces/open` | Register canonical `path`; optional existing `id` relocates a recent entry |
| `POST /workspaces` | Create a new workspace using `parent` and `name` |
| `GET /workspaces/:id` | Read workspace snapshot: graph summaries, paths, configuration, diagnostics |
| `GET /workspaces/:id/files?offset=0` | Paginated path listing |
| `GET /workspaces/:id/graphs` | Graph summaries and diagnostics |
| `POST /files/open` | Register a standalone file; `saveAs:true` allows a not-yet-existing target |
| `GET /files/:id` | Reopen a standalone file record |
| `GET /files/:id/file?path=…` | Read bytes with `X-File-Revision` header |
| `PUT /files/:id/file?path=…` | Write `{content, expectedRevision}`; null revision means create-only |
| `POST /files/:id/open-external` | Open `{path}` in the default application |
| `POST /workspaces/:id/linked-document` | Save style/layout and persist its graph association |
| `PATCH /workspaces/:id/session` | Record successful opening and optional `lastGraph` |
| `POST /workspaces/:id/close` | Release the workspace watcher |
| `POST /examples/open` | Open a bundled example as a real local workspace using `{id}` |
| `GET /recents` | Recent locations with availability flags |
| `DELETE /recents` | Remove `{ids:[...]}` from recents only |
| `GET /events` | SSE `ready` and `change` events |

File, session and external-open operations accept either `/files/:id` or `/workspaces/:id`. IDs identify a granted directory or a single file. A single-file grant never grants access to neighbors. Linked resources resolve relative to the source document inside its workspace. Paths are URL-encoded query values, not appended unescaped to URLs.

Each API request except session bootstrap needs the cookie and `X-Graph-Studio-Token`. EventSource uses the cookie. Mutating requests also require the same Origin. Host and peer checks reject non-loopback access; no cross-origin permission is granted. This is local application isolation, not a sandbox against other processes running as the same OS user.

## Saves and external editing

General → Open linked files selects Graph Studio preview (the default) or the system default application. The preference is stored in backend `state.json`, so it survives restarts and port changes. Explorer assets, node-detail links, and relative links inside Markdown share this setting. Explicit Markdown Edit always opens the original file in the default application. Graph entries in the Graphs section continue opening as editable graphs.

Reads return a SHA-256 revision of exact file bytes. Writes compare `expectedRevision` under a serialized service write queue; mismatches return HTTP 409. A successful save writes and syncs a same-directory temporary file, then publishes it. Create-only writes use no-replace publication. Existing graph documents cannot be replaced with invalid graph data. The frontend only clears dirty state after the server accepts the corresponding document revision.

These checks detect normal external edits and concurrent browser saves. An external program can still race between the comparison and filesystem replacement; the backend does not claim cross-process transactional locking.

Style/layout saves use a recovery journal in `transaction.json`: publish the linked document, then the graph association. The source graph revision is checked first. Startup completes an interrupted commit only when each target is unchanged or already contains the intended result. If an external modification conflicts with recovery, startup reports the affected path and keeps the journal. Preserve the journal and conflicting files for manual resolution; do not blindly overwrite external edits. Further writes are blocked while a journal is pending.

Markdown's **Edit** action resolves the original file and invokes the OS association without constructing a shell command from the path. Windows uses PowerShell/Start-Process with the path in an environment value, macOS uses `open`, and Linux uses `xdg-open`. Windows folder selection uses the Explorer [Common Item Dialog](https://learn.microsoft.com/en-us/windows/win32/shell/common-file-dialog), with an address bar and search, rather than the legacy folder tree. File/save dialogs use Windows Forms with automatic upgrading enabled. macOS uses AppleScript; Linux uses `zenity`. Success means the OS accepted the request, not that editing is finished. The configured default application may be a viewer.

Watchers notify the browser via SSE. Markdown reloads on changes and browser focus; event reconnection triggers a fresh read. Workspace lists refresh while the current graph and its unsaved edits are preserved. To reload the graph, select its entry again; dirty documents require the existing discard confirmation. Watcher fallback polls periodically when recursive native watching is unavailable.

## Verification

`npm run test:server` covers persisted identity, manifest tolerance, create-only writes, conflicting saves, path and junction boundaries, single-file grants, default-application target selection, linked-document recovery, authentication, and SSE. `npm run build` checks frontend and backend types and builds both. After a build, `npm run test:launcher` starts development and production modes on temporary state directories and verifies UI/API readiness and shutdown.

Native dialog and default-application associations are OS integrations. Automated tests substitute those actions; validate the actual association on each supported OS when releasing.
