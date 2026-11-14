# Verification

Run scripts/Verify.ps1. The suite contains 55 tests. Packaging automatically runs verification before building.

Coverage includes all five provider families, streaming text/tool/text round trips through the real mathematical worker, Chinese UTF-8 byte splitting, CRLF SSE and NDJSON framing, interleaved tool arguments, private continuation metadata, premature EOF, malformed events, truncation, idle timeout, cancellation, JSON fallback, partial-output retention, run revisions, schema validation, exact result envelopes, call deduplication, tool timeout and run-scoped artifact limits. Existing rendering, formula, settings and run lifecycle checks remain.

Electron integration checks use a controlled streaming provider with a real RunService/worker: text is visible before stream completion, a running tool is shown with collapsed details, expansion survives updates, messages retain chronological order, dropped patches recover by snapshot, formulas render and edits remain intact. Stop preserves partial text. Run the same check against the packaged app resources before delivery.

Provider tests are simulated. They do not establish live endpoint/model/account availability. Tool verification certifies only its expression. Installation and publisher signing are separate release checks.
