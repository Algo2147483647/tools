# Layout architecture

Graph Studio separates projection and measurement, mode-specific solving, accepted geometry, scene painting, and camera state. Opening a console or changing a tab is not a layout input. Palette changes paint existing geometry. Spatial orientation updates projection without rebuilding its static coordinate model.

| Module                            | Ownership                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `layout/compound/prepare.ts`      | Visible hierarchy, measured cards, group titles, labels, semantic problem; no placement or routing |
| `layout/compound/solve.ts`        | Automatic placement and routing, or an explicit positional seed for AI                             |
| `layout/compound/result.ts`       | Result membership, measured sizes, containment, routes and port validation against the model       |
| `layout/compound/scene.ts`        | Accepted geometry and measured content to render data                                              |
| `layout/runtime/`                 | Bounded session cache and cancellable request identities                                           |
| `app/layout/useCompoundLayout.ts` | Committed result, pending job, scope isolation and restoration before solving                      |
| `layout/node-link/`               | Measurement, algorithm dispatch, positioning and scene assembly                                    |
| `layout/timeline/`                | Time-axis preparation, event arrangement, label/routing rules and filtered projection              |
| `layout/spatial/model.ts`         | Source coordinate conversion, selected axes, center and fixed bounds                               |
| `layout/spatial/project.ts`       | Camera projection, depth visibility, guides and labels                                             |
| `render/scene/paint.ts`           | Palette and paint-only Timeline settings without changing coordinates                              |
| `viewport/useGraphZoom.ts`        | One camera owner and one viewport size observer                                                    |
| `viewport/camera/`                | Quaternion/trackball mathematics and versioned browser camera storage                              |

## Execution and invalidation

Compound preparation is synchronous and has no baseline geometry. An automatic request sends only serializable measurements and the problem to one Worker. The existing hierarchy optimizer and routing search remain inside that explicit solve. A matching accepted result or session cache bypasses the Worker. The result is installed atomically; pending work never clears a same-scope valid picture. Document or visible-scope changes cannot display the previous scope as current. Abort terminates the Worker; request identity also rejects late completion, including an A → B → A switch.

AI consumes the measured model directly. A fresh AI-mode graph does not run the automatic optimizer. On an explicit request, an existing matching result supplies its baseline; otherwise the Worker builds a deterministic positional seed without route-aware initialization. This seed is an unvalidated draft and is never displayed as an accepted result. The AI must produce a complete legal candidate. The workflow returns geometry and diagnostics, not a scene carrying a solver problem. Automatic/AI switching does not reset direction or constraints.

Flat charts cache their prepared input and measured geometry before algorithm execution. Node-link measurement owns a private appearance copy. Cached geometry refreshes fitted text when font metrics change without changing measured boxes. Sankey rejects invalid flow inputs explicitly instead of selecting another chart algorithm. Timeline retains its time-axis and readapt semantics; paint-only settings are excluded from its solver input. Accepted Timeline geometry retains a matching scene template so returning to the scope does not require a preliminary solve.

The graph font subscription observes actual metrics of selected graph fonts. Unrelated font families do not invalidate measurement. Relevant events whose glyph metrics are unchanged do not publish an update. A palette never belongs in `StageAppearance` or a geometry cache key.

## Camera and persistence

The camera controller owns scale and translation. SVG data attributes mirror applied state for drawing and inspection; they are not read as camera state. The browser's scroll event is an input to the same controller. Scene replacement preserves the camera in the same scope. First opening fits when no saved camera exists; Fit is an explicit user action. Scope navigation restores a matching view. One stable ResizeObserver compares real viewport metrics before applying an update.

Spatial camera orientation is a normalized quaternion `[x,y,z,w]`. Pointer movement maps to a virtual trackball, including roll near the rim; there is no Euler conversion or pitch clamp. Source latitude validation is unchanged. Planar maps retain pan/zoom behavior. Coordinate conversion and fixed bounds are reused across rotation, labels, grid and projection changes.

Graph files contain only the `metadata.layout` association. `schema/layoutConfig.ts` accepts the current settings file format only. Retired layout versions and embedded geometry are rejected; no migration or fallback reader is shipped. `schema/layoutSession.ts` contains session-only accepted renderings and undoable configuration. Browser storage remembers Nested expansion, spatial view and scope cameras using versioned keys and durable file/import identities. Runtime caches and pending jobs are not persisted in graph files or undo history.

## Regression checks

`browser-tests/layout-runtime.cjs` checks zero layout calls for shell/paint updates in all five modes, camera continuity, static Spatial model reuse, Nested cache hits, AI result installation without automatic solving, failed-update retention and explicit AI seeding. `src/test/layoutRuntime.test.ts` checks cancellation identities, bounded cache eviction, quaternion invariants and measurement purity. Existing chart, routing and mocked AI suites cover their specialized semantics.

## AI composition and routing

AI starts with the complete semantic graph overview and queries scoped geometry on demand. Native tool messages carry observations; immutable candidate IDs and revisions support branches and comparison. `composition.ts` executes paths, parallel branches, relative placement, alignment and spacing. `observation.ts` checks realized intent and structural facts. The runtime validates complete geometry after every calculation. `useCompoundLayoutPlan` owns current-page checkpoints and invalidates them when graph/view/model context changes.

Compound AI routing has an explicit design-to-geometry path. `routing/intent.ts` defines and validates channels, region gateways, endpoint sides and descendant anchors. `ai/design.ts` reserves channel capacity while composing children and aligns descendant anchors by moving whole sibling regions. `routing/plan.ts` walks source/target ancestry, allocates ordered boundary passages and assigns node ports together, preserving endpoint identity. Required passages are realized by direction-aware orthogonal searches joined in passage order; automatic passages are candidate hints rather than mandatory detours.

`routing/designed.ts` runs at most three local joint-repair passes over at most eight conflicting edges, retaining unrelated routes. It tries route order and inferred endpoint order alternatives; explicit endpoint ordering remains authoritative. Required routing and alignment are validated after composition and edits, including manual paths. Capacity conflicts and preferred deviations remain explicit. `routing/diagnostics.ts` reports crowded ports, gateway order inversions, ambiguous parallel runs, main-flow backtracking and verified route alternatives. `routing/verify.ts` checks realized endpoint sides and ordered passages. None of these diagnostics introduces an AI score gate.

`CompoundExecutionInput.baseDesign` carries the exact candidate intent into local edits. The selected intent lives in `LayoutRendering.compoundDesign`, is validated by session parsing, restored into the active compound problem, and invalidated with that rendering. Configuration files remain graph-independent. Scoped tool observations are paginated; native provider reasoning/signatures are retained unchanged. Cancellation still terminates the Worker and resumes from the last completed tool boundary.
