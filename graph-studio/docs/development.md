# Development Guide

This guide covers the local developer workflow and the main source layout for DAG Studio.

## Stack

- React 18
- TypeScript
- Vite
- Dagre for one of the layered layout engines
- ELK Layered in a dedicated Web Worker for the Nested node-link chart type

## Local Scripts

Install dependencies once:

```powershell
npm install
```

Available scripts:

```powershell
npm run dev
npm run build
npm test
npm run preview
npm run format
npm run check
```

Script behavior:

- `npm run dev`: starts the Vite development server
- `npm run build`: type-checks (including unused locals and parameters) and creates a production build
- `npm test`: runs the configured test script from `package.json`
- `npm run preview`: serves the built app locally
- `npm run format`: formats source and project configuration with Prettier
- `npm run format:check`: checks formatting without modifying files
- `npm run check`: runs formatting checks, regression tests, type checks, and the production build

## Source Layout

- [`src/App.tsx`](../src/App.tsx): top-level application composition
- [`src/components/`](../src/components/): UI components such as the workspace, top bar, modals, and console sidebar
- [`src/graph/`](../src/graph/): graph types, normalization, serialization, selectors, command-layer mutations, and appearance commands
- [`src/state/`](../src/state/): pure state initialization, document sessions, edit transactions, save snapshots, and preferences
- [`src/controllers/`](../src/controllers/): React orchestration for document, console, AI, appearance, and viewport behavior
- [`src/workspace/`](../src/workspace/): file discovery and preparation of candidate documents before opening
- [`src/ai/`](../src/ai/): context packets, plans, validation, presentation, transport, and response parsing
- [`src/layout/`](../src/layout/): graph layout selection and algorithm implementations
- [`src/rendering/`](../src/rendering/): SVG stage, nodes, edges, and export helpers
- [`src/console/`](../src/console/): console DSL parsing, execution, and reference content
- [`src/adapters/`](../src/adapters/): browser-specific capabilities such as file access, clipboard, and downloads
- [`src/hooks/`](../src/hooks/): reusable UI hooks for zoom, pan, resize, keyboard shortcuts, and dismissal behavior

## Architecture Notes

The codebase is organized around a few clear responsibilities:

- graph loading and normalization happen in the graph layer
- v3 semantic fields are fixed in `graph/fieldRoles.ts`; UI, layout, console and AI use them directly without passing a mapping object
- descendant traversal is shared by graph commands and stage layout in `graph/traversal.ts`; layout-specific breadth-first ordering stays in the layout layer
- graph documents are validated as v3; edges are authoritative and graphIndex builds non-enumerable read-only adjacency projections
- importMerge produces explicit conflicts before committing a multi-file document; metadata survives serialization
- edits flow through graph commands and reducer-managed history
- layout selection is separated from rendering so multiple layout engines can coexist
- browser integrations such as file access and clipboard support live in adapters instead of core graph logic
- graph appearance is a CSS-first configuration object stored separately from graph JSON
- the console DSL acts as a textual front end for the same graph mutation and appearance command cores used by the UI

Document identity combines a stable location ID and a workspace-relative graph path. The identity catalog is independent of the recent list: removing or evicting a recent row does not delete the stored location handle. Existing v1 records are reused without changing document IDs. A new opening increments the document generation, even when reopening the same file. AI persistence uses document identity; pending requests and plans also carry runtime generation/revision context. The browser fallback creates a new identity when it cannot verify filesystem identity.

All edits use `prepareGraphTransaction` and `graphCommandsCommitted`. Revision IDs increase monotonically across undo branches. Saving captures the document generation, revision and DAG that were actually written; late completion cannot clear later edits or another document. The last saved DAG is retained directly so history truncation does not corrupt the save comparison.

Preferences are loaded once at the composition root in `App`. `useDocumentSession` owns atomic document state and save snapshots; `useStudioUi` owns UI commands; `useWorkspaceController` binds browser selection and workspace operations; `usePreferencesController` owns chart preferences and AI settings. Callers pass only the capabilities each controller needs. `workspaceControls.ts` defines the UI contract independently of hook implementation details.

`workspace/operations.ts` owns the workspace operation lock, cancellation, error reporting and generation checks. Every open path prepares and validates a candidate, checks unsaved edits, commits, then updates recent metadata. `recentLocationsStore` publishes synchronous in-memory changes and delegates optional persistence to `adapters/recentStorage.ts`. Late hydration preserves current metadata and cannot restore removed rows. Filesystem identity matching lives in `locationIdentity.ts`; labels alone never establish identity. Creation retains its write rollback and rechecks edits made while a file was being written.

`state/chartPreferences.ts` owns one profile per chart, including display flags and appearance history. Appearance undo does not undo display toggles. Only `getChartStyles` output is persisted, so undo stacks stay transient. `state/documentTransitions.ts` centralizes document replacement and edit-history traversal; graph data, selection and history still change atomically through the reducer.

`useGraphViewport` composes `useGraphLayout`, `useGraphNavigation` and `useGraphInteractions` with pan/zoom. Compound worker scheduling and retained timeline axes keep their specialized controllers. Sidebar resizing belongs to UI, outside graph layout. `StudioView` composes settings directly; the toolbar owns only toolbar controls.

Layout consumes `StageAppearance`, which contains only geometry inputs. Colors, custom CSS, shadows and link opacity are applied by rendering without recalculating layout. Shared icons, icon buttons, inputs and inline forms live in `components/ui/` and `styles/ui.css`. `welcome.css` owns the home screen and recent projects; `explorer.css` owns the file explorer and empty workspace; `chrome.css` owns the application shell; `settings.css` owns settings. Component base rules and responsive/transparency variants stay in their owning file. Shared variables live in `tokens.css`.

## Sample Data and Docs

- [`public/example.json`](../public/example.json): sample graph, opened manually
- [`docs/usage.md`](usage.md): end-user workflows
- [`docs/data-format.md`](data-format.md): graph JSON conventions
- [`docs/graph-console-dsl.md`](graph-console-dsl.md): console command reference
- [`docs/graph-appearance.md`](graph-appearance.md): graph UI appearance model, presets, commands, export, and reset behavior

## Suggested Workflow for Changes

- use `npm run dev` while iterating on UI and graph behavior
- run `npm run format` after edits
- run `npm run check` before finalizing changes

Workspace discovery, manifest validation, recent-location persistence, and bounded link resolution are implemented in `src/workspace/`, `src/adapters/workspaceAccess.ts`, and `src/controllers/useWorkspaceController.ts`. See [Workspace Guide](workspaces.md).

## Browser regression fixture

With the development server running, open `/browser-tests/workspace.html`. The fixture runs the real App in Strict Mode with in-memory files, isolated preferences and an intentionally stalled handle database. It does not read or write local user files. It is type-checked and formatted by the normal checks, and is not a production entry point.

Verify the following flows through the UI:

- Open the first `tmp` directory; create B and C consecutively. Each form closes, the plus button remains usable, and both files appear.
- Return home and open the same directory again: one recent row. Select the different `tmp` fixture directory: two separate rows.
- Select the empty directory, open it, then create its first graph.
- Select Cancel picker: keep the current document and enable the next operation.
- Open `nested.json`, enter/back out of its group, toggle the explorer and verify the group controls remain available.
- Verify settings, keyboard creation/cancel, and desktop/narrow layouts. Unit suites cover stale operations, identity after recent removal, delayed hydration, storage timeouts and snapshot-safe saves.
