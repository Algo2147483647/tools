# Service architecture integration

Graph Studio owns both generic graph analysis and service architecture editing. The service editor is a lazy React workspace in the same application, package, dependency tree, local server and build. It has no runtime imports from `service-flow-editor` and uses no iframe or second server.

## Why a dedicated workspace

Generic graphs describe independent nodes and edges. Service architecture also owns nested coordinate frames, collapsed geometry, port identities, manual routes, Markdown filenames, transaction revisions, and presentation snapshots. Flattening these into ordinary graph edges would lose editing semantics. Its existing validated format therefore remains authoritative.

- `src/StudioApp.tsx` owns navigation and retains the generic graph session while services are open.
- `src/serviceArchitecture/` owns service editing, geometry, layout, document editing, recovery, and undo history.
- `server/repository.ts` owns transactional file mutations, revisions, recovery, and document identity.
- `/api/services/*` is the local, session-scoped API. Vite development, Vite preview, and the production server all use `createAppHandler`.
- `scripts/scope-studio-styles.mjs` scopes both editors' CSS by active workspace. Generic graph keyboard shortcuts are suspended while service architecture is active.
- `graphExport.ts` emits a strict Graph Studio v2 analysis snapshot. Every flow becomes an explicit node between its endpoints, preserving self loops and parallel flows; containment edges preserve hierarchy. Encoded stable IDs avoid filename/key conflicts. Complete original architecture data remains in metadata; Markdown stays in the service folder.

## Compatibility and persistence

Open an existing folder using Service architecture. Version 1/2 workspaces migrate in memory to version 3; opening alone does not rewrite the graph. Transaction directory names remain unchanged so interrupted old transactions can recover. No user workspace is moved or rewritten by installing this integration.

The home button flushes Markdown and graph writes before unmounting the service workspace. On failure it remains open. Presentation mode must be exited first. Returning to the generic editor retains its document, navigation and undo history. Reopening a service workspace starts a fresh service undo history, as reopening did in Service Atlas.

Browser storage belongs to an origin. Recent paths and unsaved recovery drafts at the old 4319/4320 origins cannot be read by the new origin automatically. Save pending work in the old session first, then open its ordinary disk folder in Graph Studio. Storage keys remain compatible when hosted at the same origin.

The legacy project's source is retained for reference; its launchers forward to Graph Studio. Future service changes belong here. The complete example is available in `examples/commerce-platform`; copy it before editing.

## Verification

`npm test` runs the generic graph suites and the migrated service model, hierarchy, routing, layout, autosave, repository and API suites, plus format/discovery integration tests. `npm run test:e2e` exercises service editing and shared navigation in a real browser. It uses installed Edge on Windows when available; otherwise install Chromium with `npx playwright install chromium`, or choose a browser with `PLAYWRIGHT_CHANNEL`.

`npm run build` type-checks both client and server. The service editor and ELK layout client are separate lazy chunks. The ELK worker is bundled locally.

Static hosting can serve generic graph editing, but service disk operations need the local Node server: `npm run dev`, `npm run preview`, or `npm run build` followed by `npm start`. All bind to loopback by default. The production port defaults to 5173 and accepts `PORT`.
