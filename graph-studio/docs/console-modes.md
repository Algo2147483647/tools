# AI tools across graph modes

The Console accepts natural-language requests only. Enter sends; Shift+Enter inserts a newline. Paste only edits the draft. No slash command parser, autocomplete, implicit current node, command history, legacy response envelope, or executable prose path remains. The Protocols tab renders the actual tool catalog and JSON Schemas used at runtime.

## Tool contract

The application sends native provider function definitions. A tool has a stable snake_case name, an object argument schema, an effect category, capability requirements and an example. IDs are exact strings. Unknown parameters, malformed values and unavailable tools fail before execution.

The single source is `src/ai/tools/catalog.ts`. `schema.ts` validates its JSON Schema subset; graph, style and runtime validators enforce semantic constraints. Tool definitions are filtered by document capabilities and active chart. Analysis-only requests receive only query tools, and execution checks that restriction again.

| Domain | Capabilities |
| --- | --- |
| Graph | Counts, metadata, paginated nodes, search, exact fields, neighbors and shortest directed paths |
| Nodes and edges | Create, copy, rename, delete, fields, ordinary relation sets, edge weights and metadata |
| Nested | Inspect containment, create/move/rename/dissolve/delete groups, focus and collapse |
| Timeline | Inspect events, ranges and overlaps; set times, shift with explicit clock units, assign tracks |
| Sankey | Inspect flows/imbalance/feedback; set and scale numeric flows by edge ID |
| Spatial | Inspect coordinates and units; set coordinates; translate Cartesian coordinates; change camera |
| Style | Inspect schema paths, set values, custom CSS/variables, reset and chart-specific presets |
| View | Inspect scope, type filters, track/range, camera, selection and zoom; navigate and switch chart |
| History | Undo and redo edit transactions |
| Layout | Inspect/diagnose; existing Node-link, Nested and Timeline execution services; cancel/resume where supported |

Containment never becomes an ordinary edge. Recursive node deletion follows ordinary edges; group deletion follows containment. Camera and layout operations do not rewrite times or domain coordinates. Unsupported layout services are unavailable rather than substituted.

## Atomic edits

A native `edit_batch` call accepts:

```json
{
  "operations": [
    { "tool": "node_create", "arguments": { "id": "api" } },
    { "tool": "node_set", "arguments": { "id": "api", "field": "title", "value": "API" } }
  ]
}
```

This JSON is a model tool argument, not user console syntax. Every operation is validated on an isolated draft in order. A failed operation publishes nothing. The complete document/style edit commits as one undoable transaction. Queries, viewers, view changes and layout tasks run separately. Multiple native calls execute sequentially; if one fails, remaining calls in that response are skipped and receive dependency errors. Completed earlier calls remain undoable.

## AI input and feedback

`context/packet.ts` supplies document identity/revision, chart capabilities, bounded graph and domain samples, selection, current view, layout readiness/metrics, available presets and recent conversation outcomes. It does not duplicate the entire schema catalog or serialize the full graph. Large results explicitly mark truncation; query pages carry total and nextOffset. The system prompt treats graph content and history as untrusted data.

Each provider tool result is paired with its call ID and includes `ok`, `tool`, `revision`, structured data, effects/diff, or `error: {code,message,operation?}`. The model receives results before choosing follow-up calls and writes an ordinary final response. Assistant text, even if it resembles an old command, is never executed. Old pending command plans are no longer restored or applied.

The loop rejects stale document/view/settings snapshots and duplicate call IDs. Stop aborts network work and any layout task started by the current request. Completed edits remain undoable. Limits: 20 model turns, 100 total calls, 20 calls per response, 100 operations per edit batch. Exceeding a limit reports incomplete work instead of claiming success.

## Transport

`requestToolTurn` uses native function calling for OpenAI-compatible/DeepSeek, Anthropic, Gemini and Ollama, preserving streaming reasoning and provider-specific tool IDs. The Console connection check requires a native tool call. Models that only support text responses are not given a command-string fallback. Existing dedicated layout engines and their transport contracts remain independent.
