# Math Workspace

Electron mathematics workspace. Every question goes to the configured AI service. The AI may call the registered mathematics tools and receives its result before producing the answer.

## Start

Windows: `./scripts/Start-Desktop.ps1`

The bundled mathematical runtime and installer target Windows x64. Other platforms require their own matching runtime.

Open Settings to configure a provider and model, then enter Markdown in the full-page editor and select Solve. The editor has no formatting toolbar or Preview mode. Inline and display formulas render in place; click a formula to edit its source. Starting a run splits the workspace into an editable left pane and a right pane with a chronological stream of user-facing solution explanation, computed formulas, tables, charts and the answer. Tool calls appear exclusively in Run details, initially collapsed, with parameters, execution stages, timings, engine diagnostics, assumptions, warnings and checks. Stop retains partial output. Scrolling upward pauses following; Back to latest resumes it. The toolbar Result button toggles the right pane; New returns to full-page editing. History and Settings open as floating dialogs. The selected model must support native tool calling. There is no local-only mode or local-first fallback.

Questions, run results and datasets remain in session memory. AI settings persist in the application userData directory; API keys are encrypted with the operating system through Electron safeStorage. Model catalogues are cached for 24 hours.

## Architecture

- `desktop/renderer`: editor, answer, history and settings.
- `desktop/application/runs.cjs`: run snapshots, settings, cancellation and lifetime.
- `desktop/ai/agent.cjs`: bounded AI/tool loop and provider-specific tool messages.
- `desktop/ai/providers.cjs`: settings validation, connection tests and model catalogue.
- `desktop/ai/stream.cjs`: bounded SSE/NDJSON readers and provider stream normalization.
- `desktop/tools`: versioned tool registry, exact-math adapter and session artifact storage.
- `desktop/core`: exact-math worker, parser, rational arithmetic and verifier.

The AI chooses whether to invoke tools. The host validates tool names and arguments and executes only allowlisted tools. Tool failures return to the AI. Each run permits eight tool calls and has a two-minute total deadline. The exact worker has a five-second deadline and a 64 MB heap limit. Other math calls use a separate bundled Python process with a 30-second wall deadline, 25 CPU seconds and 1 GB process memory limit. Cancellation terminates the process.

`exact_math` supports exact arithmetic and single-variable linear equations. It does not support powers, functions, systems or variable denominators. A passed tool check applies to its expression, not to the AI's interpretation or entire answer. Tool records are expandable below the answer.

## Development

Prepare the locked Windows mathematics runtime once: `./scripts/Prepare-MathRuntime.ps1`. From `desktop/`: `npm ci`, `npm run verify`, `npm start`.

Windows verification: `./scripts/Verify.ps1`.

Packaging: `npm run dist:win`. The installer includes the embedded runtime; users do not need Python installed. Runtime versions and archive SHA-256 hashes are recorded in `desktop/engine/runtime-lock.json`.

## Contracts and validation

`contracts/README.md` describes current renderer and worker messages. `contracts/local-math.capability.json` records the mathematical tool bounds. `docs/ARCHITECTURE.md` and `docs/VERIFICATION.md` document the active runtime and checks.

## Streaming and tools

OpenAI-compatible/DeepSeek, Anthropic and Gemini requests use streaming SSE; Ollama uses NDJSON. Adapters preserve native continuation metadata while emitting only user-facing text. Services returning ordinary JSON are identified as non-streaming, without simulated typing. Tool arguments are collected and validated before execution. Broken/truncated tool streams cannot execute incomplete calls.

Renderer updates use monotonic run revisions and incremental content events, with snapshot recovery after missing events. Finished message/tool nodes remain stable; active messages update at a 40 ms cadence. A visible answer is limited to 1 MB; each provider response is limited to 8 MB with a 45-second stream idle deadline. The two-minute overall run deadline and eight-call limit remain in force.

Tool results use schemaVersion 1 with status, result, assumptions, diagnostics, verification, artifacts, warnings and error. Large structured results become run-scoped JSON artifacts, capped at 4 MB each and 32 MB per session. Artifacts and history are cleared together. All five tools share the same envelope. Typed image/table/math artifacts are rendered in the right pane and retrieved only by owning run ID. PNG charts can be saved .

## Mathematics and data tools

- `symbolic_math`: simplify, expand, factor, one-variable equation solving, derivatives, integration and limits (SymPy).
- `numeric_math`: bracketed roots, finite-interval quadrature, bounded local minimization, square linear systems and eigenvalues (NumPy/SciPy).
- `plot_math`: sampled functions, scatter/line charts, histograms and regression charts (Matplotlib).
- `analyze_data`: overview, descriptive statistics, Pearson correlation, simple linear regression, grouped aggregates and filtering (pandas/SciPy).

Use Import data for UTF-8 CSV/TSV. Attach up to four files per run; each file is limited to 2 MB, 50,000 rows and 100 columns. Session limits: 16 files / 16 MB. Model requests include dataset names, schema and a three-row sample; selected tool results are sent back to the AI. Raw datasets remain in local session memory, but a model can request row results through the data tool. Closing the application or clearing history discards datasets and results.

Expressions accept explicit multiplication, powers, common single-argument functions and named symbols; math-expression tools do not execute arbitrary code. The separate code_workspace tool executes Python in the local workspace. Numeric operations require finite bounds/inputs; matrices are at most 50 × 50. Missing/non-numeric rows are rejected unless the model explicitly selects `missingPolicy: drop`; exclusions are reported. Tables show at most 200 rows with total counts. Function charts sample at most 2,000 points and warn that discontinuity detection is heuristic. Mathematical checks have a declared scope and do not certify the AI's full answer. Bounded minimization does not establish a global optimum.

## Version 0.6.0 interface and workspace

The renderer now uses React/TypeScript components (`app.tsx`, `solution.tsx`, `settings.tsx`) with strict type checking. The Electron service and math engine remain JavaScript/Python; this is not a full backend TypeScript migration. The old imperative app.js is no longer part of the project or package.

Solve has a status indicator; the Completed badge, shortcut caption and Copy/Run again/Hide result actions are removed. The keyboard shortcut remains available.

`code_workspace` exposes run/list/read/write. AI-written Python can import the bundled libraries, create files across calls, print diagnostics and save PNGs shown in the answer. Calls run in a local session directory with deadlines and process limits, not an OS filesystem/network sandbox. `editor_document` provides read/replace with revision checks and renderer acknowledgment; replacement may read a generated UTF-8 workspace file. Concurrent user changes cause a conflict instead of silent overwrite.

Settings save atomically under userData and keep API keys encrypted; a failed save leaves the previous configuration active. Clearing run history does not erase AI configuration. Lean support is a design proposal, not installed or advertised as a currently available tool. See `docs/AI-PLATFORM-ROADMAP.md` for the staged implementation and trust model.
