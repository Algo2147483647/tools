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

Graph documents contain only a `metadata.layout` path association. `schema/layoutConfig.ts` defines the independent chart-specific configuration file and reads legacy files for settings only. `schema/layoutSession.ts` owns internal session state, including undoable AI renderings; `schema/layoutGeometry.ts` captures/restores those session renderings. The Layout title's Update button writes a sibling `<graph>.<chartType>.layout.json` or overwrites the existing association without a file picker. It also persists `metadata.layout` in the disk graph and refreshes the workspace cache. Only the association is patched in the graph; unrelated unsaved graph edits remain unsaved. Failed association writes roll back the configuration write. Saving configuration does not depend on stage readiness or capture geometry. Appearance and Layout share file naming, overwrite validation, write lifecycle and association handling through `workspace/linkedDocument.ts` and the workspace controller. See [Layout protocols](layout-schema.md).

`compound/layout.ts` measures nodes and labels and creates a fresh topology problem. `compound/automatic.ts` routes the baseline, searches bounded alternatives, validates geometry and selects one result. `layout-solver.ts` keeps candidates internal. The controller sends each fresh problem to a Worker and installs geometry and quality together. There is no accepted snapshot, cross-view geometry cache, pin capture, or user review lifecycle. Zero requested spacing retains a minimum routing corridor.

`useCompoundStage` coalesces input changes, cancels superseded jobs and discards stale responses. Its result contains only the current stage. `useCompoundLayoutPlan` runs the dedicated compound planning harness, commits its selected rendering and configuration together to session history. Rendering restoration joins the current graph and measured Appearance without rearranging the AI result. Intermediate solves remain transient and never become history entries.

## Types and text measurement

`shared/algorithm-types.ts` describes algorithm coordinates and routes. `shared/types.ts` describes renderable stages, and re-exports algorithm and timeline types for shared consumers. Timeline-specific stage fields live in `timeline/stage-types.ts`; its dependency on `StageData` is type-only.

Browser Canvas access and its cached measurement context live in [shared/text-measurement.ts](../src/layout/shared/text-measurement.ts). `shared/text-estimate.ts` supplies the deterministic width estimate for environments without Canvas, while `shared/text.ts` retains the text fitting API. Compound worker inputs contain measured rectangles and edge-label sizes; AI result adapters reuse measured baseline label widths and display titles. Other worker text measurements retain the deterministic fallback.

## Worker boundary

Requests have `{ jobId, payload }`. Responses are either `{ jobId, ok: true, result }` or `{ jobId, ok: false, error }`. The worker handler echoes the request ID and converts synchronous failures into error responses.

Controllers retain cancellation, termination, timeout handling and graph/view freshness checks. The worker controller ignores responses for a different job ID. Timeline AI applies exact returned geometry on the main thread and has no separate solver worker.

Worker requests use shared main-thread cleanup in `app/layout/workerJob.ts`. Compound automatic arrangement and Compound AI geometry jobs each use a 15-second timeout. Compound AI also has a 20-minute overall limit and a 120-second response idle timeout and a 16-request and 48-tool-dispatch budget per invocation. Cancellation aborts generation and terminates the current worker. Timeline generation retains its existing cancellation-driven lifecycle. Graph/view revision checks remain in each controller.

## AI layout rules

`schema/layoutResult.ts` defines the complete v4 rendering result, Schema tab fields and parser. `layout/shared/applyLayoutResult.ts` applies exact geometry; `compound/finalizeStage.ts` shares validation and quality measurement with session restoration. Compound exposes six native tools through `compound/ai/protocol.ts`; `ai/transport/toolConversation.ts` preserves provider tool messages and reasoning/signatures. Timeline owns its independent decision envelope in `timeline/ai/decision.ts`. There is no shared legacy decision entry point.

Compound `ai/design.ts` compiles semantic composition and spatial sibling grids into geometry without artificial graph dependencies. `ai/execute.ts` executes that design or local changes in `compound-ai.worker.ts`. Explicit console intents still use the local intent solver through a separate internal operation, never an AI protocol adapter. Exact manual routes remain untouched. `ai/geometry.ts` supplies structured validation issues.

The workflow requires an initial design followed by candidate-specific structural reviews. The model receives text describing actual geometry and relationships, with no image input or offscreen renderer. Every edit must be reviewed again before finish. Numeric quality is auxiliary; there is no score-based selection or stagnation stop. Interrupted runs retain conversation and candidate checkpoints in the current page session. Resume processes pending calls idempotently; only explicit tool selection installs a candidate. Timeline still applies exact model geometry independently.

The selected result is retained in session memory. `schema/layoutConfig.ts` and `createLayoutConfigFile` define the only disk write format: `graph-studio-layout-settings`, version 1, with chart-specific configuration. Neither geometry nor concrete plans/orders/pins/scope are serialized. Legacy linked files are reduced to configuration before opening. See [Layout protocols](layout-schema.md).

AI starts with the complete semantic graph overview and queries scoped geometry on demand. Native tool messages carry observations; immutable candidate IDs and revisions support branches and comparison. `composition.ts` executes paths, parallel branches, relative placement, alignment and spacing. `observation.ts` checks realized intent and structural facts. The runtime validates complete geometry after every calculation. `useCompoundLayoutPlan` owns current-page checkpoints and invalidates them when graph/view/model context changes.

Compound AI routing has an explicit design-to-geometry path. `routing/intent.ts` defines and validates channels, region gateways, endpoint sides and descendant anchors. `ai/design.ts` reserves channel capacity while composing children and aligns descendant anchors by moving whole sibling regions. `routing/plan.ts` walks source/target ancestry, allocates ordered boundary passages and assigns node ports together, preserving endpoint identity. Required passages are realized by direction-aware orthogonal searches joined in passage order; automatic passages are candidate hints rather than mandatory detours.

`routing/designed.ts` runs at most three local joint-repair passes over at most eight conflicting edges, retaining unrelated routes. It tries route order and inferred endpoint order alternatives; explicit endpoint ordering remains authoritative. Required routing and alignment are validated after composition and edits, including manual paths. Capacity conflicts and preferred deviations remain explicit. `routing/diagnostics.ts` reports crowded ports, gateway order inversions, ambiguous parallel runs, main-flow backtracking and verified route alternatives. `routing/verify.ts` checks realized endpoint sides and ordered passages. None of these diagnostics introduces an AI score gate.

`CompoundExecutionInput.baseDesign` carries the exact candidate intent into local edits. The selected intent lives in `LayoutRendering.compoundDesign`, is validated by session parsing, restored into the active compound problem, and invalidated with that rendering. Configuration files remain graph-independent. Scoped tool observations are paginated; native provider reasoning/signatures are retained unchanged. Cancellation still terminates the Worker and resumes from the last completed tool boundary.
