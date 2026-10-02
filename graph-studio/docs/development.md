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

Document identity combines a recent location ID and a workspace-relative graph path. A new opening increments the document generation, even when reopening the same file. AI persistence uses document identity; pending requests and plans also carry runtime generation/revision context. The browser fallback creates a new identity when it cannot verify filesystem identity.

All edits use `prepareGraphTransaction` and `graphCommandsCommitted`. Revision IDs increase monotonically across undo branches. Saving captures the document generation, revision and DAG that were actually written; late completion cannot clear later edits or another document. The last saved DAG is retained directly so history truncation does not corrupt the save comparison.

Preferences are loaded once by `useDocumentSession`, then passed to the pure initial-state factory. Workspace preparation is separate from the React hook, and recent-location persistence is managed by `useRecentLocations`. `StudioView` composes settings directly; the toolbar owns only toolbar controls.

Layout consumes `StageAppearance`, which contains only geometry inputs. Colors, custom CSS, shadows and link opacity are applied by rendering without recalculating layout. Styles are grouped into `chrome.css`, `workspace.css`, and `settings.css`; each owns its responsive variants and transparency fallbacks. Shared variables live in `tokens.css`.

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

Workspace discovery, manifest validation, recent-location persistence, and bounded link resolution are implemented in `src/workspace/`, `src/adapters/workspaceAccess.ts`, and `src/hooks/useGraphImport.ts`. See [Workspace Guide](workspaces.md).
