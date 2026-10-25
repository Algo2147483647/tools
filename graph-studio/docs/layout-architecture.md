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

Timeline construction runs through `prepare.ts` → `arrange.ts` → `stage.ts`. `prepare.ts` resolves selection, time bounds, settings, fonts and the axis. `nodes.ts` creates event nodes using that prepared context. `arrange.ts` allocates channels, applies explicit positions and packs labels. `stage.ts` assembles edges, bounds and orientation; `edge-routing.ts` owns edge anchors and route construction. Pipeline objects are local, mutable construction state: arrangement updates event positions and stage assembly adds edge ports to nodes. They are not persisted documents.

Graph documents contain only a `metadata.layout` path association. The independent version 3 Layout file declares one chartType and contains only its configuration and complete rendering; version 1 declarations remain readable. `schema/layoutProtocol.ts` validates the envelope and `schema/layoutGeometry.ts` captures/reconstructs geometry, rebuilding runtime Maps and indexes. The Layout title has Update current layout, and the Schema tab shows field descriptions and the actual current JSON. Update writes a sibling `<graph>.<chartType>.layout.json` or overwrites the existing association without a file picker. Save the graph to persist a newly created association. See [Layout protocol](layout-schema.md).

`compound/layout.ts` measures nodes and labels and creates a fresh topology problem. `compound/automatic.ts` routes the baseline, searches bounded alternatives, validates geometry and selects one result. `layout-solver.ts` keeps candidates internal. The controller sends each fresh problem to a Worker and installs geometry and quality together. There is no accepted snapshot, cross-view geometry cache, pin capture, or user review lifecycle. Zero requested spacing retains a minimum routing corridor.

`useCompoundStage` coalesces input changes, cancels superseded jobs and discards stale responses. Its result contains only the current stage. `useCompoundLayoutPlan` runs the dedicated compound planning harness, transfers its final computed stage to the live renderer and commits only its declaration. The matching input key prevents another calculation after commit. Intermediate solves remain transient and never become history entries.

## Types and text measurement

`shared/algorithm-types.ts` describes algorithm coordinates and routes. `shared/types.ts` describes renderable stages, and re-exports algorithm and timeline types for shared consumers. Timeline-specific stage fields live in `timeline/stage-types.ts`; its dependency on `StageData` is type-only.

Browser Canvas access and its cached measurement context live in [shared/text-measurement.ts](../src/layout/shared/text-measurement.ts). `shared/text-estimate.ts` supplies the deterministic width estimate for environments without Canvas, while `shared/text.ts` retains the text fitting API. Compound worker inputs contain measured rectangles and edge-label sizes; timeline candidates reuse measured baseline label widths and display titles. Other worker text measurements retain the deterministic fallback.

## Worker boundary

Requests have `{ jobId, payload }`. Responses are either `{ jobId, ok: true, result }` or `{ jobId, ok: false, error }`. The worker handler echoes the request ID and converts synchronous failures into error responses.

Controllers retain cancellation, termination, timeout handling and graph/view freshness checks. Both controllers ignore responses for a different job ID. The timeline worker also restores graph indexes lost during structured cloning before evaluating a candidate.

The candidate controllers share main-thread request cleanup in `app/layout/workerJob.ts`. Compound automatic arrangement uses its existing 15-second timeout. Timeline evaluations have no application calculation timeout or event/relationship count ceiling. Model generation has no application deadline; users can cancel it. Cancellation settles the request and terminates its worker. Graph/view revision checks remain in each controller.

## AI layout rules

`schema/layoutResult.ts` is the single source for the AI result JSON Schema, Layout Schema fields, parser and exact-render adapter. `layout/shared/ai/decision.ts` wraps this result with evaluate/finish actions. Compound and timeline requests use the same contract, specialized by chart type. Console commands and legacy local solver plans do not enter the active AI return protocol.

AI supplies complete absolute node coordinates, group bounds and connection routes. The adapter joins current graph content and Appearance measurements, validates membership and chart semantics, constructs paths, and measures quality. It does not solve placement or routing. The model receives all evaluation feedback and explicitly selects a successful candidate; there is no fixed iteration budget or metric ranker. Cancellation and malformed continuation preserve the current view.

The selected result is retained in session memory. `schema/layoutConfig.ts` and `createLayoutConfigFile` define the only disk write format: `graph-studio-layout-settings`, version 1, with chart-specific configuration. Neither geometry nor concrete plans/orders/pins/scope are serialized. Legacy linked files are reduced to configuration before opening. See [Layout protocols](layout-schema.md).
