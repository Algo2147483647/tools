# Verification

Run scripts/Verify.ps1. The suite contains 80 tests. Packaging automatically runs verification before building.

Coverage includes all five provider families, streaming text/tool/text round trips through the real mathematical worker, Chinese UTF-8 byte splitting, CRLF SSE and NDJSON framing, interleaved tool arguments, private continuation metadata, premature EOF, malformed events, truncation, idle timeout, cancellation, JSON fallback, partial-output retention, run revisions, schema validation, exact result envelopes, call deduplication, tool timeout and run-scoped artifact limits. Existing rendering, formula, settings and run lifecycle checks remain.

Electron integration checks use a controlled streaming provider with a real RunService/worker: text is visible before stream completion, a running tool is shown with collapsed details, expansion survives updates, messages retain chronological order, dropped patches recover by snapshot, formulas render and edits remain intact. Stop preserves partial text. Run the same check against the packaged app resources before delivery.

Provider tests are simulated. They do not establish live endpoint/model/account availability. Tool verification certifies only its expression. Installation and publisher signing are separate release checks.

## Version 0.5.0

Real bundled-engine tests cover symbolic roots/domains/calculus, forbidden syntax, numerical roots/quadrature/local minimization/linear systems, explicit domain failures, PNG charts, descriptive statistics/correlation/regression/grouping/filtering, attachment authorization, missing-value policy and subprocess cancellation. CSV tests cover quoted newlines, escaped quotes, TSV, missing cells and invalid headers. Syntax verification also imports all pinned math packages and parses the Python worker.

The 0.5.0 Electron smoke test drives four streamed model tool calls through RunService and the real engines, then checks the right-side formula, table and PNG, folded tool records within Run details, richer run metadata, removal of Submitted question and continued editing. The provider is controlled test input; no live account claim is made. Repeat against packaged resources and verify the embedded executable without a system Python dependency before release.

## Version 0.6.0

Additional tests execute AI Python to generate JSON/PNG, retain workspace files, handle runtime errors, cancel execution, reject path traversal, and check acknowledged editor replacement including stale revisions and empty output. Settings tests verify encrypted persistence, cache scoping/expiry and failed encryption preserving previous data. Native Electron safeStorage encryption/decryption is tested separately with a test-only key.

React integration drives streamed calls through the real math/code workers, confirms tool records remain in Run details, status lights replace Completed, removed controls are absent, and an AI-generated JSON file is written into the editor through the actual IPC acknowledgment. Provider output is mocked; no live account availability is implied. Strict TypeScript checking and current dependency audit pass.

## 0.7.0 Lean

89 tests pass, including nine new real-Lean and AI repair tests. TypeScript checking passes. Electron integration covers failed Lean compilation, displayed line diagnostics, model-generated repair, successful recheck, distinct source hashes, right-side reports and folded tool records. Existing math/code/editor/settings checks remain. The AI provider is mocked; the compiler is the actual pinned toolchain. Independent proof verification is out of scope.

## 0.8.0 migration — full regression deferred

Production modules migrated to TypeScript; test fixtures now import build/backend modules and the composition factory. This round ran only TypeScript checking, compilation and a focused UI smoke check for the migrated renderer/preload, LaTeX rendering, typography and flat status dot. The previous 89-test result belongs to 0.7.0 and must not be represented as a post-migration result. Full regression, packaged resource checks and a new release installer remain pending by user instruction.


## 0.9.0 A/B migration — focused checks only

- TypeScript check and build passed; generated-contract drift check passed.
- 8 independent Python tests passed, covering exact arithmetic, protocol validation,
  LP/QP/least-squares/SOC, infeasible/unbounded, nonconvex/dimension rejection.
- 27 targeted desktop math/registry/convex-agent tests passed.
- 19 stream tests and 5 code-workspace/editor compatibility tests passed.
- 1 differential test compared 19 exact expressions/equations with the retained TS reference.
- Independently built wheel imported and computed exact arithmetic without Electron.
- Packaged UI used real bundled Python with mocked model responses: exact equation,
  convex optimization, table artifact rendering, collapsed Detail, no renderer errors.
- Packaged code workspace imported math_engine and cvxpy successfully.
- No live paid model call and no full regression suite were run for this migration.
