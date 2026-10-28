# JSON Studio

A single text editor with a floating AI console and a local Python computation engine. There are no document tabs, file workspace, split output panels, or user-facing command language.

## Start

On Windows, double-click `launch.cmd`, or run from the Tools directory:

```powershell
.\launch.cmd json-studio
```

On macOS, double-click **`launch.command`** in Finder, or run it from Terminal:

```sh
./launch.command
./launch.command --no-browser
./launch.command --port 4200
./launch.command --install-only
./launch.command --build-only
./launch.command --preview
```

Open **http://127.0.0.1:4189/**. Both launchers find Python 3.10+, create a project-local `.venv`, and install the pinned `requirements.txt` on first launch or when it changes. Node.js is not needed to run the application. The macOS launcher supports Apple Silicon and Intel Homebrew paths, opens the browser after the server binds, and works when the project path contains spaces. If Python is installed elsewhere, set `STUDIO_PYTHON` to its executable path for the first launch. Do not copy a Windows `.venv` to macOS; each machine needs its own environment. Git preserves the launcher's executable permission; if a ZIP extraction loses it, run `chmod +x launch.command` once.

```powershell
.\launch.cmd -NoBrowser
.\launch.cmd -Port 4200
.\launch.cmd -InstallOnly
.\launch.cmd -BuildOnly
.\launch.cmd -Preview
```

`-BuildOnly` runs Python checks and builds `dist/`; `-Preview` checks, builds and serves it with the Python backend. `-Dev` behaves like the default launch; refresh after editing frontend assets and restart after editing Python. Keep the terminal open while using the app.

Manual setup (including Linux):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

On Windows, use `.venv\Scripts\python.exe` instead. The Python server always binds to `127.0.0.1`.

## Use

1. Paste JSON, YAML, or plain text into the editor. Dropping one text file replaces the current text; it does not create a document.
2. **Right-click once** to open the floating console. `Ctrl+backtick` / `Cmd+backtick` is the keyboard equivalent. Drag the header to move it, drag the bottom-right corner to resize, and press `Esc` to close it.
3. In **AI Settings**, enter an API base URL, model, and API key. Use **Save & test** to test the connection. The provider must support `POST {baseUrl}/chat/completions`, `response_format: {"type":"json_object"}`, and text at `choices[0].message.content`. Local providers may use an empty key. Other provider protocols are not implemented.
4. In **Console**, describe the change in natural language: “Format this JSON with two spaces”, “Remove duplicate array items by id, sort by name, then convert to YAML”, or “Uppercase the selected text”. Enter sends; Shift+Enter inserts a newline.
5. Successful transformations replace the editor content and update syntax coloring automatically. Validation, statistics and queries report in the console. Ask explicitly to replace the text with query results if desired.

The editor stores plain text. Syntax coloring never becomes part of the content. `Ctrl/Cmd+Z` undoes an edit, `Ctrl/Cmd+Shift+Z` redoes it, and `Ctrl/Cmd+F` opens the editor's find control. Tab indents, Shift+Tab outdents. A complete AI transformation pipeline is one undo entry. Undo history holds up to 100 entries within an approximately 20-million-character budget.

The console preserves the selection present when it opens. Selection scope is used only when requested. Editing the content or changing language while an AI request is running invalidates its pending result. **Stop** cancels remaining AI rounds/tool execution and prevents application; an HTTP request already sent to the provider may finish before the backend observes cancellation. Closing the console does not cancel an operation.

No API key is required for typing, highlighting, finding, or undoing. Natural-language operations require a configured AI provider. There is no offline fake AI mode.

## Tools and protocol

The **Protocols** tab displays every registered capability, parameter schema, example, AI context field, response variant, result and error contract using three-line tables (top rule, header rule, bottom rule; no cell grid). Search filters tools and parameters. Expand examples or schemas for exact details.

The Python registry in `engine.py` is the single source for the 39 tools, parameter validation, model context and reference table:

| Group  | Capabilities                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON   | Format, minify, validate, sort keys, query, set/remove by JSON Pointer, merge, diff, JSON Schema validation, array sort/unique/reverse, convert to YAML |
| YAML   | Format with comments/quotes, validate, query, convert to JSON                                                                                           |
| Text   | Trim, replace/regex, case, statistics, line sorting/deduplication/filtering, JSON escaping, Base64, URL encoding, Unicode escaping and normalization    |
| Editor | Write generated text, clear, undo, redo, change highlighting language                                                                                   |

An AI response is one JSON object: `answer`, `clarify`, or `execute`. There are no slash commands or shell scripts. Example:

```json
{
  "type": "execute",
  "calls": [
    { "tool": "json.array_unique", "arguments": { "by": "id" } },
    { "tool": "json.array_sort", "arguments": { "by": "name" } },
    { "tool": "json.to_yaml", "arguments": {} }
  ]
}
```

The runtime binds text, selection and revision; AI never supplies document IDs or revision numbers. Tools transform the prior step's text. Report-only tools leave that text unchanged and feed inspection results back to the model. A successful modifying batch ends the turn and commits once. A failed batch commits nothing. History/language actions run alone. AI may use `editor.write` for generation or genuine rewriting; deterministic formatting and conversion use dedicated tools.

All data computation runs in Python. The browser owns display, selection, undo and revision checks. The AI can invoke only registered functions, never arbitrary Python, shell commands or filesystem operations.

## Data semantics and limits

- JSON uses arbitrary-precision integers and `Decimal`; results are sent as text, avoiding browser floating-point conversion. Numeric values are preserved, although numeric spellings such as exponent notation may be normalized. Duplicate keys and non-finite JSON numbers are rejected rather than silently discarded.
- JSONPath is the syntax supported by `jsonpath-ng`'s extended parser. Queries always produce an array. Mutation paths use RFC 6901 JSON Pointer, with `/-` supporting array append. Intermediate mutation parents must exist.
- Schema validation uses JSON Schema 2020-12, with local references only. `format` remains an annotation. Remote schema retrieval is disabled.
- YAML formatting retains comments and quoted strings. One YAML document is accepted per operation. Cyclic aliases, custom tags and duplicate keys are rejected. JSON conversion omits comments and rejects dates, sets, binary data, non-string keys and non-finite values instead of coercing their meaning.
- Deep merge recursively combines objects; right-hand values replace conflicting scalars and arrays. Array deduplication preserves the first item and uses canonical JSON text equality. Sorting mixed scalar values orders null, booleans, numbers, then strings.
- Unicode escaping uses JSON-string escapes without surrounding quotes; decoding consumes that same representation. Base64 operates on UTF-8. URL decoding leaves `+` literal. Text statistics count code points, not grapheme clusters; words are whitespace-separated.
- Maximum editor computation input/output: 2 million characters. Maximum batch: 20 calls, one scope. Tool workers are terminated after 8 seconds. Regex operations have an additional timeout. YAML structure/alias expansion is bounded. Four backend requests may run at once.
- AI receives at most 120,000 input characters. For larger documents, select a smaller range; only that range is supplied and only selection-scope calls may execute. Each conversation turn permits at most six AI rounds. Inspection feedback above 20,000 characters per report is explicitly marked truncated. The full report remains available in the console.
- Syntax coloring falls back to plain text beyond 300,000 characters to keep the editor usable. This does not change the text or computation limit.

Content, conversation and undo history stay in browser memory; pending tool execution uses local process memory. Refresh clears the editor. Provider settings and keys are held in a per-browser server session, expire after 12 hours of inactivity, and disappear when the service stops. Keys are not returned by the API, written to browser storage, inserted into prompts, or logged. AI requests send the applicable text and recent conversation to the configured provider. The local API checks host, origin and per-session request tokens.

## Development and validation

Python checks and build:

```powershell
.\.venv\Scripts\python.exe scripts/manage.py check
.\.venv\Scripts\python.exe scripts/manage.py build
.\.venv\Scripts\python.exe server.py --dist
```

Optional frontend tooling requires Node.js 20+:

```sh
npm ci
npm run check
npm run format:check
npm run test:e2e
npm run build
```

The npm wrappers use the project's `.venv`; override with `STUDIO_PYTHON` if needed. `npm run check` additionally checks JavaScript syntax. Browser tests use Chrome by default; set `PLAYWRIGHT_CHANNEL=chromium` after installing Playwright Chromium if necessary.

Tests cover tool semantics, exact numeric round trips, atomic failure, YAML edge cases, JSON protocol recovery, bounded workers, cancellation, session isolation and static/API boundaries. Browser tests cover the complete browser → Python → provider → Python tools → editor flow with a local deterministic **provider test double**, not a real AI account. Real-provider model quality and credentials must be tested through AI Settings.

```text
engine.py                 Python tool registry, schemas and implementations
protocol.py               AI response schema and generated reference content
ai.py                     API transport, tool loop and isolated worker execution
server.py                 Local static/API service and in-memory sessions
public/index.html         Single editor and hidden console
public/styles.css         Editor, floating chrome and three-line protocol tables
public/src/editor.js      Highlighting, selection, history and revision ownership
public/src/app.js         Conversation, protocols, settings and result application
requirements.txt          Pinned Python dependency set
scripts/                  Build/check scripts and optional npm wrappers
tests/                    Python and browser integration tests
```

`dist/` contains frontend assets only; it still requires the Python backend. Static-only deployment is no longer supported. The old multi-document state, browser calculation modules, worker pipeline and separate output views have been removed.
