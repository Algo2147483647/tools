# Layout architecture

`src/layout` turns graph documents and view settings into renderable stage data. Modules are grouped by chart family; controllers own React state and asynchronous job lifecycles.

| Directory    | Responsibility                                                                              | Entry point                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `shared/`    | Stage contracts, algorithm contracts, appearance, selection, text fitting and edge geometry | [Stage types](../src/layout/shared/types.ts), [algorithm types](../src/layout/shared/algorithm-types.ts)   |
| `node-link/` | Node-link preparation, algorithm dispatch, node creation, positioning and stage assembly    | [layout.ts](../src/layout/node-link/layout.ts)                                                             |
| `sankey/`    | Flow layout and Sankey stage construction                                                   | [layout.ts](../src/layout/sankey/layout.ts)                                                                |
| `compound/`  | Hierarchy layout, declarative constraints, automatic selection, validation and routing              | [layout.ts](../src/layout/compound/layout.ts), [layout-solver.ts](../src/layout/compound/layout-solver.ts) |
| `timeline/`  | Time-axis preparation, event arrangement, labels, routing and stage construction            | [layout.ts](../src/layout/timeline/layout.ts)                                                              |
| `spatial/`   | Coordinate projection and spatial stage construction                                        | [layout.ts](../src/layout/spatial/layout.ts)                                                               |
| `workers/`   | Worker entry points and shared request/response contracts                                   | [protocol.ts](../src/layout/workers/protocol.ts)                                                           |

## Construction pipelines

Node-link construction runs through `input.ts` → `nodes.ts` → `position.ts` → `stage.ts`. `algorithm.ts` dispatches to the existing Dagre, level and Sugiyama implementations in `algorithms/`. The public `buildStageData` entry also retains Sankey validation/fallback and spatial dispatch.

Timeline construction runs through `prepare.ts` → `arrange.ts` → `stage.ts`. `prepare.ts` resolves selection, time bounds, settings, fonts and the axis. `nodes.ts` creates event nodes using that prepared context. `arrange.ts` allocates channels, applies explicit positions and packs labels. `stage.ts` assembles edges, bounds and orientation; `edge-routing.ts` owns edge anchors and route construction. Pipeline objects are local, mutable construction state: arrangement updates event positions and stage assembly adds edge ports to nodes. They are not persisted documents.

Compound documents contain no layout state. `schema/layoutProtocol.ts` owns the independent versioned declaration, defaults, strict validation and ID repair. `workspace/linkedLayout.ts` resolves manifest associations or same-name sidecars. The session stores this declaration and its saved version separately from the graph; unified undo transactions contain configuration, never geometry.

`compound/layout.ts` measures nodes and labels and creates a fresh topology problem. `compound/automatic.ts` routes the baseline, searches bounded alternatives, validates geometry and selects one result. `layout-solver.ts` keeps candidates internal. The controller sends each fresh problem to a Worker and installs geometry and quality together. There is no accepted snapshot, cross-view geometry cache, pin capture, or user review lifecycle. Zero requested spacing retains a minimum routing corridor.

`useCompoundStage` coalesces input changes, cancels superseded jobs and discards stale responses. Its result contains only the current stage. `useCompoundLayoutPlan` handles AI declaration evaluation; it retains only intent and metrics between feedback turns and commits the best declaration. Normal rendering recalculates that declaration through the same pipeline.

## Types and text measurement

`shared/algorithm-types.ts` describes algorithm coordinates and routes. `shared/types.ts` describes renderable stages, and re-exports algorithm and timeline types for shared consumers. Timeline-specific stage fields live in `timeline/stage-types.ts`; its dependency on `StageData` is type-only.

Browser Canvas access and its cached measurement context live in [shared/text-measurement.ts](../src/layout/shared/text-measurement.ts). `shared/text-estimate.ts` supplies the deterministic width estimate for environments without Canvas, while `shared/text.ts` retains the text fitting API. Compound worker inputs contain measured rectangles and edge-label sizes; timeline candidates reuse measured baseline label widths and display titles. Other worker text measurements retain the deterministic fallback.

## Worker boundary

Requests have `{ jobId, payload }`. Responses are either `{ jobId, ok: true, result }` or `{ jobId, ok: false, error }`. The worker handler echoes the request ID and converts synchronous failures into error responses.

Controllers retain cancellation, termination, timeout handling and graph/view freshness checks. Both controllers ignore responses for a different job ID. The timeline worker also restores graph indexes lost during structured cloning before evaluating a candidate.

The candidate controllers share main-thread request cleanup in `app/layout/workerJob.ts`. Compound automatic arrangement uses the 15-second timeout and timeline previews retain 20 seconds; the timeline AI request has a separate 90-second timeout. Cancellation settles the request and terminates its worker. Graph/view revision checks remain in each controller.

## AI layout rules

`compound/ai/` contains `context.ts`, `prompt.ts`, `proposalPolicy.ts` and `workflow.ts`. The workflow accepts a proposal, evaluates it locally, and allows one measured feedback turn within the original scope, objective and selected preferences. Local inspection, routing hotspots and feedback summaries live outside `ai/` in `compound/inspection.ts`, `diagnostics.ts` and `feedback.ts`.

`timeline/ai/` contains `context.ts`, `prompt.ts`, `protocol.ts` and `request.ts`. The model supplies arrangement intent; local algorithms compute and validate the resulting geometry. Both chart families use generic transport under `src/ai/transport`. Worker/algorithm imports must not pull in these network request modules.
