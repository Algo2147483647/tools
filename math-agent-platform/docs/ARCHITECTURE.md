# Streaming desktop architecture

Editor → RunService → streaming AI agent → ToolRegistry → isolated exact-math worker or bundled mathematics process → normalized tool result → streaming AI response.

The renderer has no direct Node/network access. The main process owns input snapshots, credentials, run revision numbers, output budgets, cancellation and session artifact storage. The preload exposes only allowlisted commands and snapshot/delta subscriptions.

## Model transport

ai/stream.cjs decodes split UTF-8 and SSE/NDJSON frames, normalizes visible text and complete native tool messages, preserves provider continuation fields, and enforces frame/response/idle limits. Native thinking/signature fields remain in ephemeral provider context and are not rendered as user-facing explanation. The agent asks for concise public solution explanations before useful tool calls. JSON fallback is explicitly marked.

## Event delivery

RunService owns blocks ordered as text/tool/text. Stage changes publish snapshots. Content changes publish revisioned deltas. The renderer detects gaps and requests a new snapshot; stale patches cannot overwrite newer state. Text rendering is batched at 40 ms and only changed message nodes are rendered. Tool details retain user-controlled expansion. Completed text, tool results and partial output survive cancellation in session memory.

## Tool boundary

ToolRegistry owns declarations, schema validation, versioned request/result envelopes, call-ID deduplication and resource limits. Executors must settle only after cancellation has stopped their resources. The exact adapter delegates to the existing terminating worker, with a five-second maximum deadline. New engines must implement the same contract; a generic in-process executor is not claimed to be a security sandbox.

Artifacts are JSON values addressed by opaque IDs and owning run ID, never arbitrary paths. Oversized tool results become artifact references, retrievable through a scoped command. Mathematics tools remain restricted. The separately declared code_workspace executor runs AI-authored Python in a local process; it is not a filesystem security sandbox.

## Mathematics runtime and datasets

`tools/math-tools.cjs` declares symbolic, numeric, plotting and data schemas. `tools/math-client.cjs` launches the bundled Python executable with isolated imports, no shell, a minimal environment and a fresh temporary working directory. A request is a bounded JSON message; the worker exposes only allowlisted operations and parses mathematical expressions through an AST whitelist. It is not a general Python execution facility. Windows Job Object limits process count, memory and CPU; the parent enforces timeout/cancellation and removes temporary files. Package libraries are pinned by wheel hashes, with third-party licenses retained in the distribution.

`tools/datasets.cjs` owns parsed CSV/TSV session data. A native file picker imports UTF-8 data; the renderer cannot submit arbitrary filesystem paths. Runs carry explicit dataset IDs and immutable metadata. Only attached dataset IDs are accepted by a math tool. Model context contains metadata and a short sample; tools receive the full local dataset. Dataset text is untrusted data, never executable instructions.

Artifacts use validated image (PNG), table or math views. Main stores values; provider messages and run events carry scoped descriptors. The renderer fetches values through the owning run ID, renders table cells as text, and uses the existing safe math renderer. Tools remain ordered in the run model but their detailed records appear only inside Run details. The answer stream displays their visual artifacts in chronological position. Run details includes model, timestamps, usage when provided, dataset hashes, call counts, parameters, progress stages, diagnostics and verification scope.

## React and local workspace (0.6.0)

The renderer uses strict TypeScript and React components with stable block/artifact keys. Editor initialization and IPC subscriptions are lifecycle effects; revision recovery and 40 ms updates are preserved. Shared state reduction remains tested JavaScript. Main/service/tool modules remain CommonJS and are future migration work.

RunService owns EditorDocument and CodeWorkspace. Editor text synchronizes to main; a replace proposal includes its base text and is acknowledged by the renderer only if it still matches. Python-generated files can supply replacement text. Code errors are returned as failed tool envelopes with retained stdout/stderr; successful execution alone never certifies correctness.

SettingsStore serializes atomic writes, encrypts API keys with async safeStorage, and stores a scoped model-cache TTL. The renderer receives only hasKey, never a saved key. Workspace files persist across calls in a session and are cleaned on orderly clear/close. A stronger executor sandbox, crash recovery and durable project files remain planned.
