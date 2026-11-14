# Streaming desktop architecture

Editor → RunService → streaming AI agent → ToolRegistry → isolated exact-math worker → normalized tool result → streaming AI response.

The renderer has no direct Node/network access. The main process owns input snapshots, credentials, run revision numbers, output budgets, cancellation and session artifact storage. The preload exposes only allowlisted commands and snapshot/delta subscriptions.

## Model transport

ai/stream.cjs decodes split UTF-8 and SSE/NDJSON frames, normalizes visible text and complete native tool messages, preserves provider continuation fields, and enforces frame/response/idle limits. Native thinking/signature fields remain in ephemeral provider context and are not rendered as user-facing explanation. The agent asks for concise public solution explanations before useful tool calls. JSON fallback is explicitly marked.

## Event delivery

RunService owns blocks ordered as text/tool/text. Stage changes publish snapshots. Content changes publish revisioned deltas. The renderer detects gaps and requests a new snapshot; stale patches cannot overwrite newer state. Text rendering is batched at 40 ms and only changed message nodes are rendered. Tool details retain user-controlled expansion. Completed text, tool results and partial output survive cancellation in session memory.

## Tool boundary

ToolRegistry owns declarations, schema validation, versioned request/result envelopes, call-ID deduplication and resource limits. Executors must settle only after cancellation has stopped their resources. The exact adapter delegates to the existing terminating worker, with a five-second maximum deadline. New engines must implement the same contract; a generic in-process executor is not claimed to be a security sandbox.

Artifacts are JSON values addressed by opaque IDs and owning run ID, never arbitrary paths. Oversized tool results become artifact references, retrievable through a scoped command. No filesystem/network tool or general code executor is included.
