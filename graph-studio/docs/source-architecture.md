# Graph, schema, viewport and AI modules

These directories separate document operations, style contracts, viewport interaction and AI workflows. Layout algorithms and stage construction are described in [Layout architecture](layout-architecture.md).

## Graph documents

```text
src/graph/
  types.ts, accessors.ts, normalize.ts, graphIndex.ts, serialize.ts
  commands.ts                 Public graph-edit transaction
  commands/
    types.ts                  Command and result contracts
    context.ts                Transaction-local helpers and change tracking
    nodes.ts                  Node edits and timeline field validation
    relations.ts              Relationship edits
  imports/
    merge.ts                  Document merging and ID remapping
    conflicts.ts              Conflict IDs, decisions and unresolved records
    fields.ts                 Recursive field merging
    values.ts, types.ts       Merge primitives and contracts
  compound/
    hierarchy.ts, projection.ts
    geometry.ts               Serializable boxes and routes
    layoutData.ts             Saved constraints, snapshots and reference repair
  timeline/
    time.ts, clock.ts, range.ts, editing.ts
    layoutData.ts, settings.ts, view.ts, colors.ts
```

`applyGraphCommand` serializes the source into an isolated document, dispatches edits, repairs durable layout references, then normalizes the result. Node and relationship handlers share one transaction context. The import pipeline similarly keeps node and edge rename maps together so metadata remapping observes the same decisions as graph merging.

Saved compound layout data belongs to the document domain. Layout algorithms consume this contract; graph mutations no longer import the layout engine. `layout/compound/layout-plan.ts` owns calculation problems, metrics and candidates, and re-exports the durable contract for existing layout consumers. `graph/types.ts` remains the stable graph type entry.

## Style schema and configuration

`appearanceDefinition.json` defines the base field defaults and constraints. `chartDefaults.json` supplies per-chart overrides used for initialization and reset. The complete style snapshots in `presets/*.json` are selectable presets, not an additional source for initialization defaults. Existing preset values are retained.

`presetManifest.ts` imports the five JSON files, checks preset identities and validates the document envelopes through `styleProtocol.ts`. `chartStyles.ts` centralizes default-style construction, comparison and preset lookup; callers receive independent style values. `appearanceCommands.ts` owns appearance commands alongside these schema services. Neither module depends on React state.

`schema/appearance.ts` owns the base appearance value and resolver. `graph/appearance.ts` remains a thin compatibility entry. Built-in SVG CSS strings live in `styles/graphAppearance.ts`, `styles/graphBaseStyles.ts` and `styles/timelineStyles.ts`, preserving inline SVG/export use and cascade order. React style conversion lives in `rendering/appearanceStyle.ts`.

The `schema-json-import` Vite compatibility plugin handles the JSON import attributes in all three schema loaders. Node-based tools continue to import the same JSON files directly; there is no configuration-generation step.

## Viewport interaction

`useGraphZoom.ts` coordinates zoom state, fit, node location and layout anchors. `useWheelZoom.ts`, `useGraphPan.ts` and `useSpatialGestures.ts` retain their input lifecycles.

`cameraGeometry.ts` computes scroll offsets and spatial camera translations without accessing DOM. `viewportDom.ts` measures elements and applies those results. The viewport controller passes an explicit `overlaysRef`, attached by `Workspace`, so viewport code does not search for workspace CSS classes. The same ref supplies the overlay measurement and resize observation.

`useTimelineRulerViewport.ts` measures the floating timeline ruler using explicit topbar and overlay refs passed through `Workspace` and `GraphStage`. It shares element measurement with zoom while retaining the ruler's own padding rules. Preview canvases may omit those page refs.

## AI workflows

```text
src/ai/
  types.ts                    Type-only compatibility exports
  transport/                  Provider requests, configuration and one-repair flow
  protocol/                   Editing prompt, response parsing and legacy adaptation
  context/                    Graph summaries and context packets
  session/                    Plans, working memory, transitions, persistence and recovery
  execution/                  Command policies, preflight validation and risk helpers
```

AI layout behavior belongs to the chart family in `layout/`. `compound/ai/` owns context construction, prompt rules, proposal permissions and the bounded feedback workflow. `compound/inspection.ts`, `diagnostics.ts` and `feedback.ts` are reusable local inspection/evaluation modules. `timeline/ai/` owns its context, prompt, response parser and request. Both use generic provider transport from `ai/transport`; algorithm and worker modules do not import the AI request entry points. Durable layout data remains in `graph/compound/layoutData.ts` and `graph/timeline/layoutData.ts`.

`transport/requestWithRepair.ts` owns request → parse → one repair attempt. Editing and timeline requests supply their own prompts, parsers and error presentation. Transport failures are propagated without retries; cancellation prevents starting a repair request.

`session/persistence.ts` only handles storage access and serialization. `session/restore.ts` interprets stored state, retaining the previous fallback behavior. Both new sessions and recovered state use the same empty working-memory factory. Recovery sanitizers remain distinct from model-response parsers because their input contracts differ.

Response JSON extraction and error locations live in `protocol/jsonResponse.ts`; legacy response conversion remains explicit in `protocol/legacyResponse.ts`. Type definitions live with their owning responsibilities, while `ai/types.ts` provides the shared type entry. Prompts describe plans, command batches and console history without claiming a removed activity-event capability.

## Console and controllers

`console/dsl.ts` remains the parsing entry. `syntax/` owns tokens, operands and literals; `parsers/` groups query, node, relation and appearance grammar. `console/executor.ts` retains sequential batch evaluation on an isolated graph. `execution/` contains graph mutations, context remapping, queries and output formatting. React controllers still own committing successful results and applying UI effects. Compound layout commands remain separate asynchronous operations.

`controllers/ai/useAiSession.ts` owns session recovery and persistence. `useAiLayout.ts` coordinates layout responses with the request generation and abort controller owned by `useAiController`; splitting UI state does not create independent concurrent request channels. A layout proposal supersedes pending graph-edit commands even if evaluation fails.

`controllers/layout/workerJob.ts` owns worker request IDs, timeout, cancellation and cleanup. Compound and timeline controllers retain document/view freshness checks and application rules. `useCompoundReview.ts` owns candidate selection and preview state. `controllers/console/useConsoleInput.ts` owns history, completion and keyboard/paste input; command execution remains in the console controller.

`workspace/opening.ts` prepares complete file/workspace candidates, including recent-location identity and linked style. `workspace/createFromPicker.ts` coordinates folder creation through explicit ports. `useWorkspaceController` retains one operation lock, document replacement decisions and React commits. `useGraphExport.ts` captures the document and SVG together before asynchronously loading the HTML exporter.

## Components, rendering and export

Components are grouped into `studio/`, `nodes/`, `menus/`, `arrange/{compound,timeline}/`, `timeline/`, `spatial/`, `console/`, `files/`, `content/`, `settings/`, `workspace/` and `ui/`.

- `StudioView` composes the page; `StudioDialogs`, `StudioSettings` and `StudioLayoutPanels` own their respective wiring.
- `ChartLayoutControls` is shared by Settings → Layout and the toolbar’s single chart-controls panel. `MethodTabs` owns accessible method switching; `LayoutRules` renders three-line rule tables. Nested structure, timeline view filters and spatial view controls use the same panel.
- General owns current-view exports and current-session details. File opening, creation and recent locations stay on the home screen. Appearance text controls belong to Nodes or Edges; timeline axis and track typography belong to Canvas. Schema groups also determine search and section resets.
- `nodes/useNodeDraft.ts` owns field/JSON draft synchronization and save validation. `nodeDraft.ts` contains draft conversion; the reusable node JSON codec lives in `graph/nodeJson.ts`.
- `settings/SettingsNavigation.tsx` and `SettingsContent.tsx` separate navigation and chapter rendering from modal lifecycle. `PreviewCanvas.tsx` owns preview fitting. Timeline arrangement has separate request, review and miniature components.
- `menus/useContextMenuNavigation.ts` owns focus, keyboard navigation and submenu placement. Shared action contracts live in `state/nodeActions.ts`, so controllers do not import component implementations.

`rendering/` turns stage data into SVG and is shared by the main canvas and previews. `interaction/useStageHighlight.ts` retains incremental DOM highlighting; `interaction/useTimelineNodeInteraction.ts` owns local drag previews and keyboard pinning. Geometry computation stays in `layout/`, and page viewport measurement stays in `viewport/`.

`export/svg.ts` prepares SVG snapshots. `export/html.ts` creates standalone HTML with its viewer and stylesheet in the same directory. The viewer is serialized using `startHtmlViewer.toString()`, so its runtime helpers must remain inside that function. HTML export stays dynamically loaded.
