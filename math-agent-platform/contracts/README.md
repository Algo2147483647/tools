# Desktop runtime contracts

## Renderer commands

| Command | Payload | Result |
| --- | --- | --- |
| bootstrap | none | presets, public settings, run snapshots |
| get | run ID | current revisioned snapshot |
| artifact | runId, id | scoped JSON artifact |
| start | input string, optional parentId for retry | queued run; AI configuration required |
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

Content event types: message.started, text.delta, message.completed, transport.compatibility, tool.started, tool.progress, tool.completed, tool.failed. Events contain messageId or callId and timestamp. They are reduced into ordered text/tool blocks. User-facing prose is separate from stage metadata and tool diagnostics. The renderer shows tool summaries inline with explanation, with native details elements initially closed.

## Unified tool envelope

Requests contain schemaVersion: 1, runId, callId, tool, operation, arguments and host-owned limits. exact_math uses operation evaluate and arguments { expression }. Unknown fields in tool arguments are rejected. IDs, version and positive limits are validated. The registry clamps deadlines/output size to host limits.

Results contain schemaVersion, callId, tool, operation, status (ok/error/cancelled), result, assumptions, diagnostics, verification, artifacts, warnings and error. Error has code/message; diagnostics includes elapsedMs. Exact mathematical model/candidate data lives inside result. Identical run/call IDs deduplicate; conflicting reuse fails. Artifacts are run-scoped JSON with byte length and SHA-256. Stored full values never enter event payloads automatically.
