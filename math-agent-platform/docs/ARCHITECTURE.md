# Architecture — 0.9.0 mathematics extraction

A modular desktop application with independent compute processes. React/TypeScript
owns presentation; Electron owns desktop integration; application services own runs,
documents and credentials; AI adapters own provider transports and tool decisions.

## Independent mathematics package (A)

All active mathematical implementations now live in `engines/mathematics/src/math_engine`:
exact, symbolic, numerical, statistics, plotting and convex optimization.
The Python API and wheel work without Electron or an AI provider.
The former TypeScript exact solver is retained only as a differential-test reference.
`desktop/tools/exact-client.ts` is a compatibility transport adapter, not a solver.
`desktop/shared/hash.ts` holds application hashing independently of mathematics.

## Contracts and catalogue (B)

Python owns `catalogue.json` and the request/response schemas in `protocol.py`.
`Generate-MathContracts.py` emits `schemas/mathematics.schema.json` and
`desktop/tools/math-contracts.generated.ts` (catalogue, argument types, envelope types,
and JSON schemas). The build regenerates these outputs; `--check` detects stale files.
TS adapters consume the generated catalogue, enforce dataset attachment ownership,
validate the wire envelopes using Ajv, and start one isolated worker per invocation.
Python validates envelope and arguments using jsonschema before dispatching.
Non-mathematical workspace, document and Lean tools still have their own typed adapters;
they share the existing run/tool-result/artifact protocol rather than becoming Python math.

## Convex optimization

CVXPY and CLARABEL implement LP, convex QP, constrained least squares and second-order
cones. The tool rejects invalid dimensions and non-PSD quadratic objectives, checks DCP,
and reports statuses, primal/dual values, residuals and table artifacts. Numerical
optimality is not claimed as a formal proof. Dependency wheels are hash-pinned in the
mathematics package runtime lock; the build bundles them with the app.

## Runtime and release

`resources/mathematics` contains the independent package and source launcher.
`resources/math-runtime` contains pinned Python and its dependencies.
`resources/math-engine` now contains only the AI code workspace launcher; it imports the
math package's resource limiter explicitly. Lean retains its separate toolchain.
Executable location remains `desktop/dist-math/win-unpacked/Math Agent.exe`.
Generated JS, Python build output, runtime downloads and EXE output are ignored by Git.

## Remaining work

No process pool, durable task/event database, automatic recovery, stronger OS execution
sandbox, mathlib integration or full Lean axiom audit was introduced in this A/B migration.
Those remain later phases. Full regression remains deferred at the user's request.

Interface language remains English. Chinese mathematical content uses SimSun.
Answers and returned model reasoning remain separate; reasoning and tools appear in Detail.
