# Math Workspace

Desktop AI mathematics and document workspace. Current source version: 0.9.0 (independent Python mathematics package and generated tool contracts; full regression deferred).

## Use

Run `./scripts/Start-Desktop.ps1` for the development build. Configure a model supporting native tool calling in Settings. Settings persist locally; API keys are encrypted using the operating system. Questions, datasets and run results remain session-scoped.

Write Markdown in the full-page editor. Formulas render in place; click one to edit its source. Solve opens the right pane for streaming explanation, answers, plots, tables and Lean reports. Tool calls stay in collapsed Detail. The toolbar Result button toggles the right pane. Solve's small status dot shows running, success, failure or cancellation; its keyboard shortcut remains Ctrl/Cmd+Enter without a caption.

## Capabilities

- exact_math: exact arithmetic and one-variable linear equations.
- symbolic_math / numeric_math: algebra, calculus and bounded numerical algorithms.
- plot_math / analyze_data: actual PNG charts and statistical tables from attached UTF-8 CSV/TSV.
- convex_optimize: LP, convex QP, constrained least squares and second-order cones, with solver status and residuals.
- structure_math / algebra_math / set_math: shared MathIR, restricted LaTeX, exact algebraic numbers, bounded polynomial operations and real sets.
- equation_math / matrix_math: exact systems and parameter branches, inequalities, exact matrix spaces, QR/SVD/least squares and sparse solves.
- calculus_math / convex_model: multivariable derivatives, improper/piecewise/iterated integrals and named convex models with original-objective and residual diagnostics.
- code_workspace: AI-written Python with bundled libraries and session files.
- editor_document: revision-checked, acknowledged editor replacement, including generated-file writeback.
- lean_project / lean_check: pinned Lean 4.35.0 compilation, line diagnostics and AI repair/recheck loop. No mathlib or independent axiom/proof audit is claimed.

Python and Lean execute as local processes with time/resource limits. They are not OS filesystem/network security sandboxes. Tool verification reports its own scope; a compiler success does not certify the AI's natural-language interpretation.

## Architecture and development

Active application sources are TypeScript/TSX. The Electron entry, preload, application services, AI orchestration, tool registry/adapters now compile into `desktop/build/backend`; React/editor code compiles into renderer bundles. Python/Lean remain native computational engines.

`docs/ARCHITECTURE.md` describes layers, dependency direction, completed migration and remaining work. `docs/LEAN.md` describes compilation semantics. `contracts/README.md` documents command and tool boundaries.

Use Node 24 and npm 11. Prepare runtimes with `scripts/Prepare-MathRuntime.ps1` and `scripts/Prepare-LeanRuntime.ps1`. From desktop:

- `npm run check`: TypeScript only.
- `npm run build`: compile/bundle only; does not run tests.
- `npm test`: build and run the retained regression suite (deferred this round).
- `npm run verify`: complete release verification.
- `npm run dist:win`: release verification and installer build; only after the unified test phase.

Windows x64 is the supported bundled-runtime target. All pinned runtime libraries and licenses are shipped with the installer; a matching runtime must be prepared separately for other platforms.

Mathematical implementations are owned by `engines/mathematics`, not the desktop app. See its README for independent Python usage. Tool descriptions and argument/envelope schemas are generated from this package with `scripts/Generate-MathContracts.py`; do not edit the generated TS catalogue.
