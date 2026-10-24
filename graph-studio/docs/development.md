# Development Guide

This guide covers the local developer workflow and the main source layout for Graph Studio.

## Stack

- React 18
- TypeScript
- Vite
- Dagre for one of the layered layout engines
- Bottom-up topology-constrained rectangle packing with fixed child rectangles, followed by independent orthogonal routing for Nested node-link

## Local Scripts

Use Node.js 22.12+ with npm. The platform launchers select a supported runtime and verify dependencies automatically; see [Quick Start](../README.md#quick-start). For manual development:

```powershell
npm ci
```

Available scripts:

```powershell
npm run dev
npm run build
npm test
npm run preview
npm run format
npm run check
npm run test:launcher
npm run clean
```

Script behavior:

- `npm start`: uses the same dependency verification and browser startup as the platform launchers
- `npm run dev`: starts the Vite development server directly
- `npm run build`: type-checks (including unused locals and parameters) and creates a production build
- `npm test`: runs all application regression suites; append case-insensitive suite-name fragments to select suites, for example `npm test -- "v3 document" "ai harness"`
- `npm run preview`: serves the built app locally
- `npm run test:launcher`: checks startup options, dependency fingerprints, invocation from another directory, and cleanup boundaries
- `npm run clean`: removes `dist/`, `test-results/`, `coverage/`, and root `.log` / `.tsbuildinfo` files
- `npm run clean -- --cache`: also removes `.npm-cache/` and `.example-source-cache/`; dependencies and example workspaces are preserved
- `npm run format`: formats source, browser fixtures, JavaScript tools/tests and project configuration with Prettier
- `npm run format:check`: checks formatting without modifying files
- `npm run check`: runs formatting, launcher tests, application regression tests (including bundled examples), type checks, and the production build

## File Organization

- Root: application entry HTML, package/lockfile, tool configuration, license, README, and platform launchers.
- `src/`: application code and styles; `src/test/` contains the TypeScript regression suites and fixtures.
- `browser-tests/`: HTML/TSX regression pages used only by the development server.
- `public/`: files served with the app, including the schema, sample JSON and self-contained example workspaces with their own notes and sources.
- `scripts/`: startup and cleanup tools; `scripts/test/` holds launcher tests.
- `docs/`: project documentation; `docs/assets/` holds documentation images.
- Generated files: `node_modules/`, `dist/`, `test-results/`, `coverage/`, caches, and diagnostic logs are ignored. Put new test reports in `test-results/` rather than committing logs at the root.

`package-lock.json` is the dependency source of truth. Build tools and type packages belong in `devDependencies`; the launcher explicitly installs them for development and builds. `pnpm-workspace.yaml` allows the esbuild install step for the pnpm fallback; its generated lockfile is not committed. This checkout includes the example documents but does not include the historical example generators or their input datasets. The example regression suites validate the checked-in documents.

Windows uses `launch.cmd` → `launch.ps1` → `scripts/launch.mjs`; macOS uses `launch.command` → `scripts/launch.mjs`. `scripts/node-runtime.ps1` only discovers the Windows Node executable. The shared JavaScript owns dependency checks, installation, build and server options. Invalid or conflicting options fail before installation. Stop servers before installing updated dependencies or cleaning build output.

Text files use LF, with CRLF for Windows `.cmd` / `.ps1` files. Keep `.command` files as LF and enable execution with `chmod +x launch.command` after copying from Windows or extracting an archive that drops executable permissions.

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
- [`src/utils/`](../src/utils/): small dependency-free helpers shared across domains, such as the JSON object guard

## Architecture Notes

AI-assisted compound layout uses typed intent parsing, independent geometry validation, a module Worker for candidate search, and one reducer-managed document transaction on acceptance. Constraints and the accepted snapshot live in `metadata.layout.compound`. See [AI Assisted Nested Layout and Routing](ai-compound-layout.md). `/browser-tests/compound-layout.html` runs isolated Worker lifecycle and mock AI integration checks through Vite without opening user files or contacting hosted providers.

The codebase is organized around a few clear responsibilities:

- graph loading and normalization happen in the graph layer
- v3 semantic fields are fixed; `graph/accessors.ts` provides shared field access and custom-field discovery without passing a mapping object
- descendant traversal is shared by graph commands and stage layout in `graph/traversal.ts`; layout-specific breadth-first ordering stays in the layout layer
- type filters, timeline tracks and timeline readaptation share `projectGraphDocument` in `graph/serialize.ts`; projections clone only retained data, rebuild adjacency and leave source metadata and containment untouched
- graph documents are validated as v3; edges are authoritative and graphIndex builds non-enumerable read-only adjacency projections
- `graph/importMerge.ts` retains a tested conflict-resolution API for multi-file documents; the current opening flow does not use it, and it is excluded from the runtime bundle
- edits flow through graph commands and reducer-managed history
- layout selection is separated from rendering so multiple layout engines can coexist
- browser integrations such as file access and clipboard support live in adapters instead of core graph logic
- graph appearance is a CSS-first configuration object stored separately from graph JSON
- the console DSL acts as a textual front end for the same graph mutation and appearance command cores used by the UI

Keep data helpers independent of React components. `components/nodeFields.ts` owns field parsing/formatting and the raw node editor envelope; fields retain only their name and JSON value. Relationships use the dedicated relation editor because v3 forbids `parents`/`children` fields on nodes. `graph/relations.ts` owns relation input and edge ID allocation. Related helpers stay in these existing modules. `hooks/useDebouncedValue.ts` is shared by settings previews and graph controllers.

`MarkdownValue` loads the Markdown renderer only when nonempty rich content is displayed and falls back to readable plain text if rendering cannot load. `MarkdownContent` owns Markdown plugins, relative links and image URL cleanup. HTML export synchronously captures a sanitized SVG and inherited typography through `prepareHtmlSvg` in `rendering/export-svg.ts`, then loads `rendering/export-html.ts` on demand. Keeping capture separate prevents edits during module loading from mixing document versions. The HTML viewer and server-side Markdown renderer stay outside the initial JavaScript bundle.

`adapters/workspaceAccess.ts` owns workspace file reads and directory access for discovery, linked styles and relative assets. File handles are read afresh; immutable example downloads retain their own retryable cache. `utils/json.ts` keeps the shared object guard independent of graph validation and AI code. AI transports treat response data as `unknown` until its shape is checked.

Document identity combines a stable location ID and a workspace-relative graph path. The identity catalog is independent of the recent list: removing or evicting a recent row does not delete the stored location handle. Existing v1 records are reused without changing document IDs. A new opening increments the document generation, even when reopening the same file. AI persistence uses document identity; pending requests and plans also carry runtime generation/revision context. The browser fallback creates a new identity when it cannot verify filesystem identity.

All edits use `prepareGraphTransaction` and `graphCommandsCommitted`. Revision IDs increase monotonically across undo branches. Saving captures the document generation, revision and DAG that were actually written; late completion cannot clear later edits or another document. The last saved DAG is retained directly so history truncation does not corrupt the save comparison.

Preferences are loaded once at the composition root in `App`. `useDocumentSession` owns atomic document state and save snapshots; `useStudioUi` owns UI commands; `useWorkspaceController` binds browser selection and workspace operations; `usePreferencesController` owns chart preferences and AI settings. Callers pass only the capabilities each controller needs. `workspaceControls.ts` defines the UI contract independently of hook implementation details.

`workspace/operations.ts` owns the workspace operation lock, cancellation, error reporting and generation checks. Every open path prepares and validates a candidate, checks unsaved edits, commits, then updates recent metadata. `recentLocationsStore` publishes synchronous in-memory changes and delegates optional persistence to `adapters/recentStorage.ts`. Late hydration preserves current metadata and cannot restore removed rows. Filesystem identity matching lives in `locationIdentity.ts`; labels alone never establish identity. Creation retains its write rollback and rechecks edits made while a file was being written.

`state/chartPreferences.ts` owns one profile per chart, including display flags and appearance history. Appearance undo does not undo display toggles. Only `getChartStyles` output is persisted, so undo stacks stay transient. `state/documentTransitions.ts` centralizes document replacement and edit-history traversal; graph data, selection and history still change atomically through the reducer.

`useGraphViewport` composes `useGraphLayout`, `useGraphNavigation` and `useGraphInteractions` with pan/zoom. Deferred compound layout and retained timeline axes keep their specialized controllers. Sidebar resizing belongs to UI, outside graph layout. `StudioView` composes settings directly; the toolbar owns only toolbar controls.

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

With the development server running, open `/browser-tests/loading.html` and select **Run checks**. The fixture exercises deferred Markdown/math rendering, completion of empty-file previews, inherited export typography, SVG sanitization and capture before later changes. It uses in-memory data and does not read or write user files, storage or AI requests. Browser fixtures are type-checked and formatted by the normal checks, but must be run in a browser; they are not production entry points.

Workspace unit suites in `src/test/` cover stale operations, identity after recent removal, delayed hydration, storage timeouts and snapshot-safe saves. Projection regressions cover cycles, broad graphs, stable edge IDs, unusual node keys and source isolation. Provider tests use local fetch stubs and make no external requests.
