# Lean compilation service — 0.7.0

## Delivered scope

Pinned Lean 4.35.0 Windows x64, project-local preparation and bundled runtime. Official archive SHA-256: `5fc033e93e1a7bc59c5ebf311103d2c9cd18d4b3eddda4ffa3414e8adb0ef79e`.

`LeanWorkspace` is owned by RunService. It creates a temporary project with lean-toolchain, lakefile.toml and an empty dependency manifest. Each check uses a fresh attempt directory and immutable Check.lean source. Lean is invoked directly with argument arrays, no shell and no Lake dependency fetch. The exact compiler version is checked before compilation. The system's elan installation is untouched.

`lean_project` accepts `{}` and reports the installed version and capabilities. `lean_check` accepts `{source:string}` up to 65,536 characters. Its unified operation is compile. A maximum of eight total tool calls and two minutes applies to each AI run, including repair attempts; the Lean subprocess has a 30-second deadline and 1 MB diagnostics limit. Lean receives memory 1024 MB and deterministic allocation-budget options. These are resource limits, not an OS sandbox. Descendant processes are terminated when a call is cancelled or times out.

## Diagnostics and repair

Lean JSON lines are normalized into severity, message, line, column, endLine and endColumn (one-based positions). Tool results preserve compiler version, attempt number, source SHA-256 and exit code. Local toolchain/workspace prefixes are removed from diagnostics before sending to the model. No API key is passed in the compiler environment.

The AI receives compiler errors as failed tool results and is instructed to repair the same proposition/assumptions, then invoke lean_check again. It must not substitute an easier proposition, sorry or new axioms to manufacture a passing result. This stage does not mechanically lock theorem statements or audit dependencies; those remain later work. Exhausting the budget or receiving an unresolved error leaves the report unsuccessful even if prose says otherwise.

Reports appear in the answer stream; detailed calls appear only inside Run details. Reports include source, diagnostics and scope. Source and diagnostics are rendered as text, never executable HTML. The artifact is scoped to its owning run.

## States and trust

- compiled: zero exit code, no errors/warnings; labelled 编译检查通过.
- compiled_with_warnings: compiler finished with warnings.
- incomplete: compiler reported use of sorry; treated as failed proof attempt.
- compile_error: syntax, type, tactic, module or other compiler error.
- resource_error: deadline/output/resource failure; no successful verification claim.
- cancellation and missing/mismatched runtime return explicit unified tool errors.

All states have verification `not_independently_verified`. Compiling additional axioms is possible and is not misrepresented as an audited proof. Warning detection catches ordinary sorry use, not every intentionally hidden or indirect assumption. Natural-language-to-formal-statement correspondence remains a review responsibility. No mathlib, LSP goals/search, formal target locking, axiom audit or independent checker is claimed in this release.

## Tests

Real Lean tests cover accepted arithmetic, failed proof with precise location, unfinished goals, sorry, repaired tactic for an unchanged proposition, immutable snapshots/hashes, absent mathlib, compilation under an explicit axiom, cancellation, deadline and Unicode diagnostics. A mocked AI provider receives real compiler diagnostics, repairs and rechecks. Electron integration verifies both failed/successful right-pane reports and collapsed Run details. The same integration is repeated against packaged resources.

Official release and digest: https://github.com/leanprover/lean4/releases/expanded_assets/v4.35.0
Trust guidance: https://lean-lang.org/doc/reference/latest/ValidatingProofs/
