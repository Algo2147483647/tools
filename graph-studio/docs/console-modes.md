# Mode-aware console and AI

The floating console supports Node-link, Nested node-link (Compound), Timeline,
Sankey and Spatial. `/help` shows available commands; `/help all` and the Protocols
tab also explain unavailable commands. Slash commands execute locally. Other text
goes to the configured AI provider.

Domain commands use one JSON object on one line. Empty arguments may be omitted
for queries. Node IDs, edge IDs and group IDs are exact, case-sensitive strings.
Legacy node and relation commands remain compatible. Ordinary edges and
`hierarchy_edges` are independent.

## Examples

```text
/group inspect
/group create {"id":"services","title":"Services","members":["api","db"]}
/group move {"members":["api"],"parent":"platform"}
/group move {"members":["api"],"parent":null}
/group rename {"id":"services","title":"Platform services"}
/group dissolve {"id":"services"}
/group delete {"id":"services"}

/timeline inspect {"track":"Delivery","start":"2026-10-01","end":"2026-11-01"}
/timeline set {"id":"launch","time":{"at":"2026-10-27"}}
/timeline shift {"ids":["launch"],"amount":3,"unit":"day"}
/timeline track {"ids":["launch"],"track":"Delivery"}

/flow inspect
/flow set {"edge":"e1","value":140}
/flow scale {"edges":["e1","e2"],"factor":1.2}

/space inspect
/space set {"id":"point","coordinates":[1,2,3]}
/space translate {"ids":["point"],"delta":[1,0,0]}

/edge-data inspect {"offset":0,"limit":40}
/edge-data set {"id":"e1","metadata":{"kind":"dependency"}}
/edge-data set {"id":"e1","metadata":null}
/style inspect {"path":"style.timeline"}
/style set {"path":"style.timeline.orientation","value":"horizontal"}

/view inspect
/view group {"id":"services","collapsed":true}
/view group {"id":"services","focus":true}
/view group {"id":null,"focus":true}
/view timeline {"track":"Delivery"}
/view timeline {"track":null,"range":null}
/view set {"patch":{"yaw":30,"projection":"orthographic"}}

/layout inspect
/layout diagnose
/layout run {"method":"dagre"}
/layout run {"prompt":"Reduce crossings while keeping the current groups."}
/layout cancel
/layout resume
```

Only use commands applicable to the document and view. `/layout run` takes a
Node-link `method`, a Compound `prompt` or validated `intent`, or a Timeline
`prompt` / `method:"algorithm"`. Resume requires an existing Compound checkpoint.
Spatial positions are source coordinates, so no automatic rearrangement is
advertised. Sankey uses its existing automatic layout. Both expose inspection.
`/compound-layout` remains a compatibility alias for the shared layout service.

## Semantics

- Group creation requires sibling members. Moving cannot introduce a containment
  cycle. Dissolving retains the group node and ordinary edges; group deletion
  removes its containment subtree. `/rm -r` still traverses ordinary edges.
- Calendar timestamps require explicit timezone offsets when including time of
  day. Relative events retain their numeric values and declared clock unit.
  Calendar shifts support second, minute, hour, day and week. Year/month-precision
  dates require an explicit new time rather than inventing a day. Ongoing event
  validation uses a fixed reference instant for the operation.
- Flow values and scale factors must be finite and non-negative. Cycles remain
  return flows; imbalance is reported without changing data to force balance.
- Spatial edits respect dimensions, coordinate system and angle units. Translation
  is Cartesian-only. Camera rotation, projection, grid and labels do not rewrite
  coordinates. View range values are numeric timestamps or relative offsets,
  according to the document clock.
- Edge metadata updates merge keys; `metadata:null` clears metadata. Edge IDs and
  endpoints remain unchanged.
- `/style set` uses the same supported schema and validation as Settings. Inspect
  the schema before choosing a path. Style and Layout keep their existing file
  formats and save controls; commands do not silently write files.

## Execution and undo

Synchronous graph/style batches are prepared against an immutable snapshot, fully
validated and committed once. A later failure publishes none of the batch's graph,
style, context or UI effects. One Undo restores the graph and affected style/time
settings together. Slider adjustments continue to form a single undo entry.

View and layout commands run separately from manual edit batches. AI workflows
may list edits and runtime tasks in dependency order: the harness splits them
into steps and waits for the preceding commit before preparing the next step.
If a later step fails, completed steps remain undoable and only unfinished
commands remain pending. These steps are not one cross-task atomic transaction.

Layout commands call the same controllers as Arrange. Task output distinguishes
running, completed, cancelled and failed, with a job ID. The service preserves
Compound checkpoints and candidate selection. Cancelling never installs a draft.
Queries and temporary view changes do not create graph mutations.

## AI context and inspection

The context includes document capabilities, current chart, selection, focus,
filters, camera, domain facts and the applicable command catalog. Initial graph
context is bounded; domain queries provide `total` and `nextOffset`, with a default
page size of 40 and a maximum of 100.

The inspection loop runs read-only commands and feeds structured results/errors
back to the model. It allows up to six turns, twenty inspection commands per turn,
bounded result payloads and a three-minute request budget. Repeated identical
queries stop without editing. Ordinary read-only `run_console` replies also enter
this loop. `inspect` cannot execute edits, view changes, clear, or layout tasks.

Explicit analysis-only requests are locally prevented from committing model
edits. AI replies follow the user's language. Stop cancels the request and any
layout task that it started. Changing the document, mode, scope or relevant
settings invalidates outstanding responses and pending plans.

AI and manual execution share the same preparation and commit path; validation
does not execute the batch a second time. Diff output covers node fields, edge
values/metadata, containment, document metadata and chart style values. Full
changes are committed even when the display summarizes a long diff.

## Code and verification

- `src/console/capabilities.ts`, `domainRegistry.ts`, `reference.ts`: capability
  discovery and shared command documentation.
- `src/console/domains.ts`, `executor.ts`, `runtime.ts`, `workflow.ts`: pure queries,
  prepared edits and explicit runtime boundaries.
- `src/app/console/useConsoleRuntime.ts`: view/Arrange service adapter.
- `src/ai/session/inspection.ts`: bounded inspection loop; provider-independent.
- `src/app/document/graphTransactions.ts`: one graph/style commit and undo record.
- `src/test/consoleModes.test.ts`: domain semantics, snapshots, transactions,
  serialization and provider-independent AI loop tests.
- `browser-tests/console-modes.cjs`: real-browser checks with a mocked provider.

Run the core tests with Node 22.12 or later:

```text
npm test -- console "ai harness" state
npm run build
```

For browser verification, start Vite on port 5178, make Playwright and Chrome
available, then run `node browser-tests/console-modes.cjs`. `GRAPH_STUDIO_URL`
overrides the server URL; `PLAYWRIGHT_MODULE` optionally selects an installed
Playwright module. Tests use isolated browser contexts and in-memory graph files.
Mocked-provider tests establish orchestration correctness, not hosted-model
quality or live-provider reliability.
