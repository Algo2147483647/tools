# Development Guide

This guide covers the local developer workflow and the main source layout for DAG Studio.

## Stack

- React 18
- TypeScript
- Vite
- Dagre for one of the layered layout engines

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
```

Script behavior:

- `npm run dev`: starts the Vite development server
- `npm run build`: type-checks and creates a production build
- `npm test`: runs the configured test script from `package.json`
- `npm run preview`: serves the built app locally

## Source Layout

- [`src/App.tsx`](../src/App.tsx): top-level application composition
- [`src/components/`](../src/components/): UI components such as the workspace, top bar, modals, and console sidebar
- [`src/graph/`](../src/graph/): graph types, normalization, serialization, selectors, command-layer mutations, and appearance commands
- [`src/state/`](../src/state/): reducer, actions, derived state, preferences, and recent-file state
- [`src/layout/`](../src/layout/): graph layout selection and algorithm implementations
- [`src/rendering/`](../src/rendering/): SVG stage, nodes, edges, and export helpers
- [`src/console/`](../src/console/): console DSL parsing, execution, and reference content
- [`src/adapters/`](../src/adapters/): browser-specific capabilities such as file access, clipboard, and downloads
- [`src/hooks/`](../src/hooks/): reusable UI hooks for zoom, pan, resize, keyboard shortcuts, and dismissal behavior

## Architecture Notes

The codebase is organized around a few clear responsibilities:

- graph loading and normalization happen in the graph layer
- field mapping is interpreted per document and inferred during load before the UI chooses selections or layouts
- edits flow through graph commands and reducer-managed history
- layout selection is separated from rendering so multiple layout engines can coexist
- browser integrations such as file access and clipboard support live in adapters instead of core graph logic
- graph appearance is a CSS-first configuration object stored separately from graph JSON
- the console DSL acts as a textual front end for the same graph mutation and appearance command cores used by the UI

## Sample Data and Docs

- [`public/example.json`](../public/example.json): default graph loaded on startup
- [`docs/usage.md`](usage.md): end-user workflows
- [`docs/data-format.md`](data-format.md): graph JSON conventions
- [`docs/graph-console-dsl.md`](graph-console-dsl.md): console command reference
- [`docs/graph-appearance.md`](graph-appearance.md): graph UI appearance model, presets, commands, export, and reset behavior

## Suggested Workflow for Changes

- use `npm run dev` while iterating on UI and graph behavior
- run `npm test` if your local workflow depends on the configured test script
- run `npm run build` before finalizing changes to catch type or bundling issues
