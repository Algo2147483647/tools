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

Graph documents contain only a `metadata.layout` path association. `schema/layoutProtocol.ts` owns the independent versioned declaration, defaults, strict validation and ID repair. `workspace/linkedLayout.ts` resolves only that explicit graph-relative path within the granted workspace. The session stores the declaration separately from the graph; unified undo transactions contain configuration, never geometry.

`compound/layout.ts` measures nodes and labels and creates a fresh topology problem. `compound/automatic.ts` routes the baseline, searches bounded alternatives, validates geometry and selects one result. `layout-solver.ts` keeps candidates internal. The controller sends each fresh problem to a Worker and installs geometry and quality together. There is no accepted snapshot, cross-view geometry cache, pin capture, or user review lifecycle. Zero requested spacing retains a minimum routing corridor.

`useCompoundStage` coalesces input changes, cancels superseded jobs and discards stale responses. Its result contains only the current stage. `useCompoundLayoutPlan` runs the dedicated compound planning harness, transfers its final computed stage to the live renderer and commits only its declaration. The matching input key prevents another calculation after commit. Intermediate solves remain transient and never become history entries.

## Types and text measurement

`shared/algorithm-types.ts` describes algorithm coordinates and routes. `shared/types.ts` describes renderable stages, and re-exports algorithm and timeline types for shared consumers. Timeline-specific stage fields live in `timeline/stage-types.ts`; its dependency on `StageData` is type-only.

Browser Canvas access and its cached measurement context live in [shared/text-measurement.ts](../src/layout/shared/text-measurement.ts). `shared/text-estimate.ts` supplies the deterministic width estimate for environments without Canvas, while `shared/text.ts` retains the text fitting API. Compound worker inputs contain measured rectangles and edge-label sizes; timeline candidates reuse measured baseline label widths and display titles. Other worker text measurements retain the deterministic fallback.

## Worker boundary

Requests have `{ jobId, payload }`. Responses are either `{ jobId, ok: true, result }` or `{ jobId, ok: false, error }`. The worker handler echoes the request ID and converts synchronous failures into error responses.

Controllers retain cancellation, termination, timeout handling and graph/view freshness checks. Both controllers ignore responses for a different job ID. The timeline worker also restores graph indexes lost during structured cloning before evaluating a candidate.

The candidate controllers share main-thread request cleanup in `app/layout/workerJob.ts`. Compound automatic arrangement uses the 15-second timeout and timeline previews retain 20 seconds; the timeline AI request has a separate 90-second timeout. Cancellation settles the request and terminates its worker. Graph/view revision checks remain in each controller.

## AI layout rules

`compound/ai/protocol.ts` and `timeline/ai/protocol.ts` define separate bounded schemas and semantic validation. Their request modules build chart-only context. Generic Console/editor prompts, command parsing, history and working memory never enter Layout requests. The model chooses declarations; workers own geometry.

Compound plans can select expanded-group directions, complete sibling `flow-order` sequences, and sparse routing preferences. A flow order defines increasing positions on the scope's flow axis; relationship edges are preserved and may become feedback connections. Complete editable scopes, node sizes, current constraints, relative endpoint positions, detours, crowded ports and inter-group connections accompany the request. Incomplete sampled scopes cannot receive structural edits. A plan replaces constraints only for supplied scopes and edge IDs, so an empty plan retracts those preferences while preserving unsupplied configuration.

`compound/ai/workflow.ts` executes at most two plans and two solves within the controller's 90-second lifecycle. A solve failure, unmet preferences, excessive detours or substantial route-length growth sends actual execution feedback to one revision. Each plan request retains the shared two-call JSON correction budget (at most four provider calls total). Identical revisions reuse the first computation; unsuccessful refinements retain the first valid computation with a Layout diagnostic. Cancellation aborts every phase. No user review is required.

An outer-route preference adds nearby corridor candidates with a finite cost bonus and a detour bound (at most 1.35 times the shortest ordinary route cost plus 48). It never allocates a full-canvas bottom lane or grows the canvas. Separate label-placement fallback can still allocate space when visible labels need it.

Readability compares a finite combination of route length, shared length, crossings, bends and content extent, using the router's trade-offs. Shrinking a shared segment cannot outweigh an unbounded detour. Candidate bounds are rebuilt from placed content, fixed out-of-scope routes and the configured minimum canvas, rather than inheriting a previous candidate's whitespace. Refinement diagnostics measure actual route extents, so a minimum canvas larger than a small graph does not trigger another model call.

Connection-port mode is an application-controlled declaration shared by baseline and candidate routing. `midpoints` supplies only side-center endpoints; `distributed` additionally supplies separated offsets. The AI observes this mode but cannot override it. Selecting Automatic clears AI decisions and restores automatic direction before a fresh local solve; objective and port mode remain unchanged.

`layout/shared/ai/request.ts` owns the common two-call budget: one request and at most one regeneration for syntax, schema, semantic or truncation errors. A provider rejecting schema output can use the remaining call in JSON text mode. The entire response must be one object; fences, multiple documents and JSON-encoded strings fail. Broken output is not replayed in correction prompts. Layout uses a dedicated 4,096-token budget rather than the Console limit (default 900). A truncation retry raises the budget to 8,192 and requests at most eight constraints or 32 ordered entries. DeepSeek layout calls explicitly set `thinking.type` to `disabled`, following its [thinking-mode API](https://api-docs.deepseek.com/guides/thinking_mode); generic Console calls keep their existing settings. Error details include the actual limit and available output/thinking usage counts. Cancellation, refusal and transport errors terminate immediately. Field paths, attempt count, finish reason and request ID support diagnostics without exposing raw responses in the main UI.

`ai/transport/providerTransport.ts` normalizes content, structured values, completion/refusal metadata and usage. Anthropic, Gemini and Ollama receive their schema output options; OpenAI-compatible endpoints use JSON object mode because compatibility does not guarantee schema support. Worker and algorithm modules do not import network request entry points.
