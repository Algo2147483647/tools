# Math Workspace

Electron mathematics workspace. Every question goes to the configured AI service. The AI may call the isolated `exact_math` tool and receives its result before producing the answer.

## Start

Windows: `./scripts/Start-Desktop.ps1`

macOS: `sh scripts/start-desktop.sh`

Open Settings to configure a provider and model, then enter Markdown in the full-page editor and select Solve. The editor has no formatting toolbar or Preview mode. Inline and display formulas render in place; click a formula to edit its source. Starting a run splits the workspace into an editable left pane and a right pane with a chronological stream of user-facing solution explanation, tool cards and the answer. Tool cards show execution status immediately and default to collapsed details. Stop retains partial output. Scrolling upward pauses following; Back to latest resumes it. Hide collapses the right pane; New returns to full-page editing. History and Settings open as floating dialogs. The selected model must support native tool calling. There is no local-only mode or local-first fallback.

Questions and keys remain in memory and are discarded when the window closes.

## Architecture

- `desktop/renderer`: editor, answer, history and settings.
- `desktop/application/runs.cjs`: run snapshots, settings, cancellation and lifetime.
- `desktop/ai/agent.cjs`: bounded AI/tool loop and provider-specific tool messages.
- `desktop/ai/providers.cjs`: settings validation, connection tests and model catalogue.
- `desktop/ai/stream.cjs`: bounded SSE/NDJSON readers and provider stream normalization.
- `desktop/tools`: versioned tool registry, exact-math adapter and session artifact storage.
- `desktop/core`: exact-math worker, parser, rational arithmetic and verifier.

The AI chooses whether to invoke tools. The host validates tool names and arguments and executes only allowlisted tools. Tool failures return to the AI. Each run permits eight tool calls and has a two-minute total deadline. The worker has a five-second deadline and a 64 MB heap limit.

`exact_math` supports exact arithmetic and single-variable linear equations. It does not support powers, functions, systems or variable denominators. A passed tool check applies to its expression, not to the AI's interpretation or entire answer. Tool records are expandable below the answer.

## Development

From `desktop/`: `npm ci`, `npm run verify`, `npm start`.

Windows verification: `./scripts/Verify.ps1`.

Packaging: `npm run dist:win`; macOS packaging must run on macOS.

## Contracts and validation

`contracts/README.md` describes current renderer and worker messages. `contracts/local-math.capability.json` records the mathematical tool bounds. `docs/ARCHITECTURE.md` and `docs/VERIFICATION.md` document the active runtime and checks.

## Streaming and tools

OpenAI-compatible/DeepSeek, Anthropic and Gemini requests use streaming SSE; Ollama uses NDJSON. Adapters preserve native continuation metadata while emitting only user-facing text. Services returning ordinary JSON are identified as non-streaming, without simulated typing. Tool arguments are collected and validated before execution. Broken/truncated tool streams cannot execute incomplete calls.

Renderer updates use monotonic run revisions and incremental content events, with snapshot recovery after missing events. Finished message/tool nodes remain stable; active messages update at a 40 ms cadence. A visible answer is limited to 1 MB; each provider response is limited to 8 MB with a 45-second stream idle deadline. The two-minute overall run deadline and eight-call limit remain in force.

Tool results use schemaVersion 1 with status, result, assumptions, diagnostics, verification, artifacts, warnings and error. Large structured results become run-scoped JSON artifacts, capped at 4 MB each and 32 MB per session. Artifacts and history are cleared together. Only exact_math is implemented; symbolic/numeric/plot/data tools remain future work.
