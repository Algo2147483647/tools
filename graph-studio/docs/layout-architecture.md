# Layout architecture

`src/layout` turns graph documents and view settings into renderable stage data. Modules are grouped by chart family; controllers own React state and asynchronous job lifecycles.

| Directory    | Responsibility                                                                              | Entry point                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `shared/`    | Stage contracts, algorithm contracts, appearance, selection, text fitting and edge geometry | [Stage types](../src/layout/shared/types.ts), [algorithm types](../src/layout/shared/algorithm-types.ts)   |
| `node-link/` | Node-link preparation, algorithm dispatch, node creation, positioning and stage assembly    | [layout.ts](../src/layout/node-link/layout.ts)                                                             |
| `sankey/`    | Flow layout and Sankey stage construction                                                   | [layout.ts](../src/layout/sankey/layout.ts)                                                                |
| `compound/`  | Hierarchy layout, declarative constraints, automatic selection, validation and routing      | [layout.ts](../src/layout/compound/layout.ts), [layout-solver.ts](../src/layout/compound/layout-solver.ts) |
| `timeline/`  | Time-axis preparation, event arrangement, labels, routing and stage construction            | [layout.ts](../src/layout/timeline/layout.ts)                                                              |
| `spatial/`   | Coordinate projection and spatial stage construction                                        | [layout.ts](../src/layout/spatial/layout.ts)                                                               |
| `workers/`   | Worker entry points and shared request/response contracts                                   | [protocol.ts](../src/layout/workers/protocol.ts)                                                           |

## Construction pipelines

Node-link construction runs through `input.ts` → `nodes.ts` → `position.ts` → `stage.ts`. `algorithm.ts` dispatches to the existing Dagre, level and Sugiyama implementations in `algorithms/`. The public `buildStageData` entry also retains Sankey validation/fallback and spatial dispatch.

Timeline construction runs through `prepare.ts` → `arrange.ts` → `stage.ts`. `prepare.ts` resolves selection, time bounds, settings, fonts and the axis. `nodes.ts` creates event nodes using that prepared context. `arrange.ts` allocates channels, packs events and labels. `stage.ts` assembles edges, bounds and orientation; `edge-routing.ts` owns edge anchors and route construction. Pipeline objects are local, mutable construction state: arrangement updates event positions and stage assembly adds edge ports to nodes. They are not persisted documents.

Graph documents contain only a `metadata.layout` path association. `schema/layoutConfig.ts` defines the independent chart-specific configuration file and reads legacy files for settings only. `schema/layoutSession.ts` owns internal session state, including undoable AI renderings; `schema/layoutGeometry.ts` captures/restores those session renderings. The Layout title's Update button writes a sibling `<graph>.<chartType>.layout.json` or overwrites the existing association without a file picker. Saving configuration does not depend on stage readiness or capture geometry. Appearance and Layout share file naming, overwrite validation, write lifecycle and association handling through `workspace/linkedDocument.ts` and the workspace controller. See [Layout protocols](layout-schema.md).

`compound/layout.ts` measures nodes and labels and creates a fresh topology problem. `compound/automatic.ts` routes the baseline, searches bounded alternatives, validates geometry and selects one result. `layout-solver.ts` keeps candidates internal. The controller sends each fresh problem to a Worker and installs geometry and quality together. There is no accepted snapshot, cross-view geometry cache, pin capture, or user review lifecycle. Zero requested spacing retains a minimum routing corridor.

`useCompoundStage` coalesces input changes, cancels superseded jobs and discards stale responses. Its result contains only the current stage. `useCompoundLayoutPlan` runs the dedicated compound planning harness, commits its selected rendering and configuration together to session history. Rendering restoration joins the current graph and measured Appearance without rearranging the AI result. Intermediate solves remain transient and never become history entries.

## Types and text measurement

`shared/algorithm-types.ts` describes algorithm coordinates and routes. `shared/types.ts` describes renderable stages, and re-exports algorithm and timeline types for shared consumers. Timeline-specific stage fields live in `timeline/stage-types.ts`; its dependency on `StageData` is type-only.

Browser Canvas access and its cached measurement context live in [shared/text-measurement.ts](../src/layout/shared/text-measurement.ts). `shared/text-estimate.ts` supplies the deterministic width estimate for environments without Canvas, while `shared/text.ts` retains the text fitting API. Compound worker inputs contain measured rectangles and edge-label sizes; AI result adapters reuse measured baseline label widths and display titles. Other worker text measurements retain the deterministic fallback.

## Worker boundary

Requests have `{ jobId, payload }`. Responses are either `{ jobId, ok: true, result }` or `{ jobId, ok: false, error }`. The worker handler echoes the request ID and converts synchronous failures into error responses.

Controllers retain cancellation, termination, timeout handling and graph/view freshness checks. The worker controller ignores responses for a different job ID. Timeline AI applies exact returned geometry on the main thread and has no separate solver worker.

Worker requests use shared main-thread cleanup in `app/layout/workerJob.ts`. Compound automatic arrangement and Compound AI geometry jobs each use a 15-second timeout. Compound AI also has a 240-second session deadline and a six-request model budget, including protocol corrections. Cancellation aborts generation and terminates the current worker. Timeline generation retains its existing cancellation-driven lifecycle. Graph/view revision checks remain in each controller.

## AI layout rules

`schema/layoutResult.ts` defines the complete v4 rendering result, Schema tab fields and parser. `layout/shared/applyLayoutResult.ts` applies exact geometry; `compound/finalizeStage.ts` shares validation and quality measurement with session restoration. Compound has its own version 2 `design`/`revise`/`finish` interaction schema in `compound/ai/decision.ts`. Timeline owns its independent decision envelope in `timeline/ai/decision.ts`. There is no shared legacy decision entry point.

Compound `ai/design.ts` compiles semantic composition and spatial sibling grids into geometry without artificial graph dependencies. `ai/execute.ts` executes that design or local changes in `compound-ai.worker.ts`. Explicit console intents still use the local intent solver through a separate internal operation, never an AI protocol adapter. Exact manual routes remain untouched. `ai/geometry.ts` supplies structured validation issues.

The workflow requires an initial design followed by candidate-specific reviews. `app/layout/renderCompoundReview.tsx` mounts the real GraphStage offscreen, exports its computed styles, and rasterizes overview/detail images without changing the installed canvas. Provider adapters carry native image parts. Rejected image inputs are disclosed as structure-only review. Every edit must be reviewed again before finish. Numeric quality is auxiliary; there is no score-based selection or stagnation stop. Interrupted runs can retain a reviewed legal draft with an explicit incomplete stop reason; unreviewed drafts cannot be installed. Timeline still applies exact model geometry independently.

The selected result is retained in session memory. `schema/layoutConfig.ts` and `createLayoutConfigFile` define the only disk write format: `graph-studio-layout-settings`, version 1, with chart-specific configuration. Neither geometry nor concrete plans/orders/pins/scope are serialized. Legacy linked files are reduced to configuration before opening. See [Layout protocols](layout-schema.md).

AI input uses one working Schema Layout document, a draft ID/revision, candidate summaries and bounded diagnostics with totals. Failed drafts remain available for local revision. Full historical layouts are not replayed. Separate metadata supplies measured size, semantics and containment. The runtime validates the complete graph after every calculation regardless of diagnostic sampling.
