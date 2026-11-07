# Workspace files

The explorer is a view of the workspace, not a second filesystem implementation.

## Ownership

- `WorkspaceExplorer` owns tabs, independent searches, type filtering and the selected file. Assets are all catalog files other than detected graph documents. Unreferenced assets follow referenced assets, separated by a rule. The group is shown only after a successful scan.
- `WorkspaceFileWindow` displays reference locations and operation previews. It delegates all writes through `WorkspaceControls`.
- `useFloatingWindow` and `floating-window.css` are shared by the console and the file window. Sidebar width and floating bounds use separate preference keys.
- `referenceAdapters.ts` defines the supported reference semantics for both the backend and in-memory graph rebasing. JSON uses syntax-tree paths; Markdown, HTML/SVG and CSS use parsed syntax and source spans. Ordinary strings and code examples are not rewritten.
- `WorkspaceFileOperations` owns the revision-indexed parse cache, stable session file identities, mutation plans, durable backups, rollback, recovery and undo. The existing `LocalService` write queue coordinates these operations with ordinary and linked-document saves.
- `useWorkspaceController` reconciles results with the open graph, its disk baseline and undo history. The document reducer briefly locks editing during commit so a late edit cannot be overwritten by restoration.

## Reference contract

Supported graph references are `metadata.style`, `metadata.layout` and Markdown inside `nodes[id].define`. Workspace manifests reference graphs through `graphs[]`. Unknown JSON strings are not implicitly file links. Configuration and manifest paths are filesystem-relative; Markdown/HTML/CSS paths are URL-relative and retain query strings, anchors and encoding.

Markdown links, images, reference definitions and usages are indexed. Link removal retains the label; image removal removes the image. JSON optional associations are removed as properties; manifest graph entries are removed as array members. HTML resource elements (`img`, `link`, `source`) are removed; other recognized path attributes are removed. CSS URL values become `none`, and matching `@import` rules are removed.

External URLs and fragment-only links are excluded. Files without a reference adapter are opaque assets, not sources with invented references. Counts mean references in these supported document protocols. Parse failures prevent rename/delete and suppress the unreferenced grouping. HTML base URLs, srcset, embedded CSS resources and escaped Markdown destinations that cannot be located precisely fail explicitly instead of silently leaving stale references.

Rename changes the basename within its current directory and preserves its extension. Canonical path checks, real-path containment and case-insensitive name collision checks apply. Case-only renames are rejected explicitly. Browser-imported workspaces support read-only discovery and references; transactional operations and system-default opening require a local workspace.

## Operations and recovery

1. `GET /api/v1/workspaces/:id/reference-index` returns catalog identities, content revisions, source scan status and reference locations.
2. `POST .../file-plan` accepts `{ kind: "rename" | "delete", path, name? }`. It scans the workspace and returns an opaque plan ID, affected paths and reference locations. The server retains the actual byte changes and expected revisions.
3. `POST .../file-commit` accepts `{ planId }`. It checks the complete path inventory and revisions again, writes a durable pending journal, applies conditional changes, then marks the journal committed. A failure rolls back completed writes. A rollback conflict preserves the journal and blocks subsequent writes until recovery.
4. `POST .../file-undo` accepts `{ transactionId }`. It verifies current contents and rejects newly introduced incoming dependencies before applying the inverse transaction. Undo never overwrites later disk edits.

Backups and journals live in the service state directory under `file-operations`, outside the workspace catalog. Pending operations are rolled back on startup. Committed backups remain available for recovery. They are not permanent deletion or an operating-system recycle-bin operation.

Successful mutations emit one change event with a transaction ID. The originating controller reconciles directly; other sessions receive an external change. Watchers are restarted around the transaction to avoid duplicate disk-change notices.

Live graph references, the saved baseline and each graph edit-history entry are rebased together. Unsaved graph changes are retained. Deleting the currently open graph requires it to be saved first. File-operation undo is rejected if intervening graph edits or navigation would be overwritten.

## Validation

Server tests exercise cross-format renames/deletes, exact byte restoration, stale plans, collisions, recovery, watcher events, spaced Unicode configuration paths, manifest array removal and unsaved graph rebasing. Browser walkthroughs cover the real local API, source navigation, system-open dispatch, active graph deletion/restoration, floating resize/drag, sidebar resize and narrow viewports.
