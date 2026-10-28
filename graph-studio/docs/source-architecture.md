# Source architecture

Graph Studio groups code by responsibility. React application orchestration lives in `app/`; document operations, layout algorithms and protocols remain usable without React. [Layout architecture](layout-architecture.md) describes the calculation pipelines in more detail.

```text
src/
  app/
    document/       Document state, transactions, save, export and node actions
    workspace/      Opening, creation, preview and recent-location orchestration
    preferences/    Session-only chart styles and interface preferences
    viewport/       Wiring canvas interaction and chart-specific view state
    layout/         Layout hooks, workers, candidate review and freshness checks
    ai/             AI request lifecycle and session coordination
    console/        Command execution commits, input history and completion
    ui/             Page state, shortcuts and context-menu state
  components/
    studio/         Page composition, toolbar, settings and dialogs
    canvas/         SVG stage rendering and local stage interaction
    compound/       Nested structure, layout controls and candidate review
    timeline/       Timeline controls, arrangement, review and miniature
    spatial/        Spatial controls
    workspace/      Home, explorer, file preview and save dialogs
    settings/       Settings presentation and editors
    nodes/          Node fields, relations, hierarchy and detail editors
    menus/          Context-menu rendering and keyboard navigation
    console/        Console presentation
    content/        Markdown and rich content
    ui/             Shared controls, tabs and layout-rule tables
  schema/
    document/       Chart field descriptions and examples in JSON
    appearance/     Appearance definitions, defaults, presets and resolvers
    definition.ts   Generic field-definition resolver
    fields.ts       Shared schema-table field contracts and ordering
    styleProtocol.ts  Style document envelope and validation
  graph/            Graph contracts, normalization, serialization and edits
  layout/           Chart-family algorithms, AI layout rules and workers
  viewport/         Zoom, pan, camera geometry and DOM measurement
  ai/               Provider transport, editing protocol, context and sessions
  console/          Command grammar and execution
  workspace/        File/workspace operations and persisted recent locations
  shared/
    browser/        Storage, clipboard, download and file-access primitives
    hooks/          Reusable debounce, resize and outside-dismiss hooks
    json.ts         Shared JSON value helpers
  export/           SVG snapshots and standalone HTML export
  styles/           Application CSS and SVG stylesheet sources
```

## Application state and components

`app/` combines the former controller and state directories by feature. Hooks own React state and effect lifecycles; pure reducers and transaction helpers remain separate files beside their callers. `app/document/nodeActions.ts` holds action contracts shared with menus, so controllers do not import component implementations.

`StudioView` composes the page. `StudioDialogs` and `StudioSettings` wire their respective surfaces. `StudioView` owns the active console tab and passes the workbench as content to `console/ConsoleWindow`. `ChartLayoutControls` is used only by Settings → Layout; the Workbench has no layout controls. `MethodTabs` supplies accessible switching; `LayoutRules` renders three-line rule tables. `components/workbench/Workbench.tsx` composes the current-view summary, chart-specific controls and shared `TypeFilterControls`; `styles/workbench.css` owns their responsive cards. Domain controls stay under `compound`, `timeline` and `spatial`. The console owns floating-window geometry, tab navigation and focus, with Console / Workbench / Protocols pages. There is no separate workbench floating window or open state.

General contains current-view exports and current-session details. File opening, creation and recent locations belong to the home screen. Appearance text controls belong to Nodes or Edges; timeline axis and track typography belong to Canvas. Schema groups also determine search and section resets.

`nodes/useNodeDraft.ts` owns field/JSON draft synchronization and save validation. `nodeDraft.ts` contains draft conversion; the reusable node JSON codec lives in `graph/nodeJson.ts`. Settings navigation and chapter rendering stay separate from modal lifecycle. `menus/useContextMenuNavigation.ts` owns menu focus, keyboard navigation and submenu placement.

## Document and appearance schemas

[document/definition.json](../src/schema/document/definition.json) contains common field descriptions plus chart-specific fields and overrides. Each of the five chart types has a complete example under `document/examples/`. [document/definition.ts](../src/schema/document/definition.ts) imports these JSON files, checks field definitions, composes the field tables and validates examples at the import boundary. Settings only renders this data; it does not own document configuration.

The field-description format is not standard JSON Schema. [public/graph.schema.json](../public/graph.schema.json) remains the machine-readable JSON Schema for external document tooling. `graph/normalize.ts` remains responsible for runtime document validation and graph semantics. Changes to the document format must update these contracts together; they are not automatically generated from the description table.

[appearance/definition.json](../src/schema/appearance/definition.json) defines appearance fields, defaults and constraints. `appearance/defaults.json` supplies chart-specific overrides. Complete snapshots under `appearance/presets/` support internal defaults and Console preset commands. `appearance/presets.ts` validates their identities and envelopes through `styleProtocol.ts`; `appearance/styles.ts` owns default-style construction, comparison and lookup. These modules do not depend on React.

`appearance/defaults.ts` exposes the base appearance and resolver; `appearance/contract.ts` validates complete values; `appearance/commands.ts` owns appearance commands. Obsolete forwarding modules have been removed, and consumers import the owning modules directly. See [Appearance schema](appearance-schema.md) for the full contract.

The `schema-json-import` Vite compatibility plugin handles JSON import attributes in modules directly under `schema/appearance/` and `schema/document/`. Node-based tools import the same JSON files. There is no configuration-generation step.

## Graph documents and layout

`graph/commands.ts` applies edits to an isolated serialized document, repairs durable layout references, then normalizes the result. `graph/commands/` separates node and relationship edits while sharing one transaction context. `graph/imports/` keeps conflict decisions and node/edge rename maps together so metadata remapping observes the same decisions as merging.

Durable layout data belongs to `graph/compound/layoutData.ts` and `graph/timeline/layoutData.ts`. Serializable compound geometry belongs to `graph/compound/geometry.ts`. Layout algorithms consume those contracts; graph mutations do not import layout engines. `graph/serialize.ts` owns both document serialization and formatted JSON output.

`app/layout/workerJob.ts` owns request IDs, timeout, cancellation and worker cleanup. Compound and timeline hooks retain document/view freshness checks and application rules. The compound and timeline AI workflows let the model evaluate and select arrangements; the selected result applies directly. `schema/layoutGeometry.ts` owns independent rendering serialization/restoration. Text measurement and its browser Canvas fallback are colocated under `layout/shared/` because layout owns the font contract.

## Browser access and viewport

`shared/browser/` contains generic browser capabilities. Domain-specific storage remains with its owner: recent locations in `workspace/recentStorage.ts`, compound view state in `viewport/compoundViewStorage.ts`, AI session persistence in `ai/session/persistence.ts`. `workspace/browserAccess.ts` and `relativeLinks.ts` implement workspace and linked-resource access using generic file primitives.

`workspace/opening.ts` prepares complete candidates including recent-location identity and linked style. `workspace/createFromPicker.ts` coordinates folder creation through explicit ports. `app/workspace/useWorkspaceController.ts` retains one operation lock, document replacement decisions and React commits.

`viewport/useGraphZoom.ts` coordinates zoom state, fit, location and layout anchors. Wheel, pan and spatial gesture hooks retain their input lifecycles. `cameraGeometry.ts` computes offsets without DOM access; `viewportDom.ts` measures elements and applies results. Explorer overlay refs supplied through `Workspace` and `GraphStage` support zoom and floating timeline-ruler measurements. The canvas has no topbar offset. `StudioLaunchers` owns the corner bubbles; `ConsoleToolbar` supplies navigation and zoom to the console shell, while `StudioSettings` supplies document actions to Settings. Preview canvases may omit overlay refs.

## AI and console

`ai/transport/` owns provider requests and configuration. `protocol/` owns editing prompts, response parsing and legacy adaptation; `context/` owns summaries and packets; `session/` owns working memory, transitions and recovery; `execution/` owns command policies and preflight validation. `ai/types.ts` is the shared type entry.

AI layout rules belong to their chart family under `layout/compound/ai/` and `layout/timeline/ai/`. Each chart family supplies a compact schema, bounded context and semantic validation. Both use `layout/shared/ai/request.ts` for completion checks and a single correction budget, and shared provider transport; algorithm and worker modules do not import network request entry points.

`transport/requestWithRepair.ts` owns request → parse → one repair attempt. Transport failures propagate without retries; cancellation prevents starting a repair request. Session persistence handles storage and serialization, while recovery interprets stored state. Recovery sanitizers and model-response parsers have different contracts.

`app/ai/useAiSession.ts` owns Console session recovery and persistence effects. Layout requests have separate controllers, cancellation and schemas; they do not consume or replace pending graph-edit plans. `useCompoundLayoutPlan.ts` installs one validated stage and commits its declaration, guarded by the current document, view and history revision.

`console/dsl.ts` is the parsing entry. `syntax/` owns tokens and literals; `parsers/` groups command grammar. `console/executor.ts` evaluates batches sequentially on an isolated graph; `execution/` holds mutations, remapping, queries and output formatting. `app/console/` owns React commits, UI effects, history and completion. Compound layout commands remain separate asynchronous operations.

## Rendering, export and styles

`components/canvas/` turns stage data into SVG for both the main canvas and previews. Its interaction hooks retain incremental highlighting, local drag previews and keyboard pinning. Geometry stays in `layout/`; page measurements stay in `viewport/`.

`export/svg.ts` prepares snapshots. `app/document/useGraphExport.ts` captures the document and SVG together before dynamically loading `export/html.ts`. The standalone viewer is serialized with `startHtmlViewer.toString()`, so its runtime helpers stay inside that function.

`styles/ui.css` owns shared tabs, fields and buttons. `styles/modals/shared.css` owns common dialog styles; chart-specific controls stay in `chart-controls.css`. Obsolete file-menu, slider and layout-card selectors have been removed. Built-in SVG CSS remains in `graphAppearance.ts`, `graphBaseStyles.ts` and `timelineStyles.ts` to preserve inline SVG/export behavior and cascade order. React style conversion lives in `components/canvas/appearanceStyle.ts`.
