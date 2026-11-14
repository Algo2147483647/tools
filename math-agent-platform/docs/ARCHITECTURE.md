# Architecture — 0.8.0 source migration

Status: implementation and focused checks complete; full regression and release packaging are deferred by user instruction.

## Choice

A modular monolith is the appropriate architecture for this desktop product. React handles presentation, the Electron main process owns application lifetimes and trusted operations, a typed application service manages run state, the AI agent invokes registered tools, and math/code/Lean runtimes remain separate processes. Splitting this single-user local workflow into network microservices would add deployment and failure modes without a demonstrated need.

## Active layers

| Layer | Sources | Responsibility |
|---|---|---|
| Presentation | renderer/*.tsx, editor.ts, markdown.ts, live-math.ts | React components, Markdown/LaTeX display and editor integration |
| Shared contracts | shared/contracts.ts, ipc.ts, tools.ts, run-state.ts | Run/event/tool types, command names and revision reducer |
| Application | application/runs.ts, ports.ts | Run lifecycle, budgets, cancellation and session-facing ports |
| AI orchestration | ai/agent.ts, providers.ts, stream.ts | Native model transport, streaming normalization and bounded tool loop |
| Tool implementations | tools/*.ts | Validation, artifacts, datasets, document edits, mathematical/code/Lean adapters |
| Mathematical domain | core/parser.ts, rational.ts, engine.ts | Restricted AST, exact arithmetic and independent affine check |
| Platform adapters | platform/composition.ts, commands.ts, runtime.ts, settings-store.ts | Dependency assembly, Electron IPC, runtime location, encrypted settings persistence |
| Entry points | main.ts, preload.ts | Window lifecycle and the restricted renderer bridge |
| External engines | engine/*.py, bundled Lean | Python numerical/symbolic/code operations and Lean compilation |

Application services no longer import renderer state code or construct concrete tool resources. The composition root builds repositories and executors and injects a ToolSession. Shared run types and the event reducer are consumed by both processes. Tool descriptors use shared request/context/result contracts; dynamic provider JSON remains behind transport and runtime-validation boundaries.

## Source and build migration

All active application/renderer production JavaScript source modules have been migrated to TypeScript, including the Electron entry, preload, stream adapters, registry, exact worker, editor plugins and reducer. Old .cjs/.js production sources are outside the active project. Node still runs generated JavaScript, as expected for TypeScript.

scripts/build.cjs emits the backend to build/backend and bundles the sandboxed preload. package.json now starts build/backend/main.js. Renderer bundles are generated from TypeScript/TSX. Generated backend output is cleaned within its verified project directory before rebuilding, preventing obsolete modules from being shipped. Packaged/development runtime paths are resolved by platform/runtime.ts. Build output is excluded from source control.

Strict TypeScript checking is enabled across renderer and backend; existing catch handling remains permissive. Native provider/worker JSON still has explicit dynamic types in adapter code. This is not a claim that every possible wire shape has been represented by a closed discriminated union.

## What remains

| Item | Status / next step |
|---|---|
| Production frontend/backend language migration | Completed for the active TypeScript application sources |
| Python and Lean | Intentionally retain native languages; not pending TS migrations |
| Test source files | Existing .test.cjs fixtures retained; imports updated to compiled modules. Not migrated to TS or executed this round |
| Build/prepare scripts | Small Node CJS and PowerShell scripts retained intentionally |
| External protocol typing | Further narrow dynamic provider/worker JSON and generate IPC payload validation/types from one schema |
| Executor isolation | Current local-process execution; container/remote backends and enforced filesystem/network boundaries remain unfinished |
| Durable tasks and documents | SQLite event persistence, crash recovery, resumable jobs and persistent document revision/undo history remain unfinished |
| Lean verification | Compilation/diagnostic/repair loop implemented; mathlib, target locking, transitive axiom auditing and independent checking remain unfinished |
| Release validation | Full regression and new installer are deferred until the requested unified test phase |

The last four items are platform capabilities, not reasons to rewrite Python or add microservices. Prioritize recoverable state and isolation before adding more autonomous planning or multiple agents.

## Typography

Paper content uses the bundled KaTeX_Main Computer Modern-style face, Times New Roman and system CJK serif fallbacks. Mathematical formulas retain KaTeX LaTeX rendering. Code and diagnostics remain monospaced. Navigation and settings retain system UI typography. Solve has a small flat macOS-style status dot without border, outline or shadow.

## Validation performed this round

- npm run check: passed across production TypeScript.
- npm run build: passed for backend, preload, workers and renderer.
- Focused Electron UI check: application boot, a simulated displayed answer, formula rendering, paper font, status-dot computed border 0px and shadow none; no renderer console errors.
- No full unit/integration suite and no new installer release were run for 0.8.0.
