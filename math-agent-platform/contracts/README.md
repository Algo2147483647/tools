# Desktop runtime contracts

## Renderer commands

| Command | Payload | Result |
| --- | --- | --- |
| bootstrap | none | presets, public settings, run snapshots |
| get | run ID | current revisioned snapshot |
| artifact | runId, id | scoped JSON artifact |
| importDataset | none; native UTF-8 CSV/TSV picker | dataset descriptor or null |
| start | input string, optional parentId and datasetIds (up to four) | queued run; AI configuration required |
| cancel | active run ID or settings | resolves after cancellation settles |
| configure | provider, baseUrl, apiKey, model, maxTokens, optional keepApiKey | public settings without key |
| models / test | draft settings | model IDs / connection-test response; does not apply |
| clear | none | clears idle session history |

Responses use `{ ok: true, value }` or `{ ok: false, error: { code, message } }`. Only the app main renderer frame may send commands. Start has no mode selector: every question enters the AI agent.

## AI tool

`exact_math` accepts exactly `{ expression: string }` (1–4096 characters). The host checks the tool name and arguments, then executes the isolated worker. Native provider tool-result messages return either the mathematical result or a structured error to the AI. Each run allows at most eight tool calls and two minutes total.

## Worker

Input: `{ input: string }` in workerData. Output is an event (`stage`, `message`), result (`model`, `candidate`, `verification`) or error (`code`, `message`). The worker has a five-second deadline and 64 MB heap limit. Expressions are parsed into a restricted AST and never executed as code.

## Run result

An AI result contains Markdown, provider/model, truncation status, and tool records (`name`, `input`, `output`). Each successful tool output contains its own candidate and verification. Verification covers the supplied expression, not the AI interpretation or entire answer. Tool records are expandable in the result panel.

Runs retain immutable input and optional retry parent ID. Lifecycle: queued → understanding → explaining; tools pass through solving/verifying and return to explaining. Terminal states are completed, failed, cancelled and timed_out. Cancellation passes through cancelling and waits for the operation to stop.

## Streaming protocol (version 1)

workspace:run carries a full run snapshot (revision, blocks, lifecycle events, result/error). workspace:delta carries { runId, revision, event }. Revisions increase across both paths. An unexpected revision requests get; duplicate or stale deltas are ignored.

Content event types: message.started, text.delta, message.completed, transport.compatibility, tool.started, tool.progress, tool.completed, tool.failed. Events contain messageId or callId and timestamp. They are reduced into ordered text/tool blocks. User-facing prose is separate from stage metadata and tool diagnostics. The renderer displays tool artifacts inline with explanation. All tool call records are inside Run details, with native details elements initially closed.

## Unified tool envelope

Requests contain schemaVersion: 1, runId, callId, tool, operation, arguments and host-owned limits. exact_math uses operation evaluate and arguments { expression }. Unknown fields in tool arguments are rejected. IDs, version and positive limits are validated. The registry clamps deadlines/output size to host limits.

Results contain schemaVersion, callId, tool, operation, status (ok/error/cancelled), result, assumptions, diagnostics, verification, artifacts, warnings and error. Error has code/message; diagnostics includes elapsedMs. Exact mathematical model/candidate data lives inside result. Identical run/call IDs deduplicate; conflicting reuse fails. Artifacts are run-scoped JSON with byte length and SHA-256. Stored full values never enter event payloads automatically.

## Mathematics operations and views

`symbolic_math`, `numeric_math`, `plot_math` and `analyze_data` require an `operation` enum in arguments. The host copies this to the versioned request envelope and rejects mismatches. The registry schema in `desktop/tools/math-tools.cjs` is authoritative. Unknown arguments are rejected. Each call has a maximum 30-second deadline; data tools require a dataset ID attached to the run.

Python stdin: `{tool, arguments, dataset?: {columns, rows}}`. Stdout: `{ok:true,value:{result,views,assumptions,diagnostics,verification,warnings}}` or `{ok:false,error:{code,message}}`. Parent maps errors and cancellation to the standard envelope. Expressions never execute as Python code.

Views: `{kind:"math",title,latex}`, `{kind:"table",title,columns,rows,totalRows}`, or `{kind:"image",title,mimeType:"image/png",data:<base64>}`. Views are validated and moved to the scoped artifact store; model context receives descriptors instead of image bytes. Model usage is optional on message.completed. Tool blocks retain operation, host limits, start/end timestamps and timestamped progressEvents. Clear removes history, artifacts and datasets together.

## Local workspace and document commands (0.6.0)

Renderer commands add editorSync `{text}` and editorAck `{id,applied,text}`. Main emits workspace:edit `{id,baseText,text}`; a pending replacement settles only after matching acknowledgment or timeout/cancellation. Start accepts the current document snapshot in addition to input and dataset IDs.

AI tools add code_workspace `{operation:run|list|read|write,code?,file?,text?}` and editor_document `{operation:read|replace,revision?,text?,file?}`. A code error returns status error while preserving stdout/stderr and file metadata. Python code has local user-process authority; workspace path checks are not an OS sandbox. Editor replacement requires revision and either text or a bounded UTF-8 workspace file. Empty replacement text is valid.

Configure now persists the validated configuration using async OS encryption for the API key. Bootstrap includes cachedModels and optional settingsError. Models accepts refresh to bypass the 24-hour cache. Keys never appear in bootstrap or run snapshots.
