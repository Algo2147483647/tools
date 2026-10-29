import { useState } from "react";
import { TOOL_CATALOG, TOOL_PROTOCOL_VERSION, modelTools, toolParameters } from "../../ai/tools/catalog";
import { TOOL_LIMITS } from "../../ai/tools/loop";
import { SYSTEM_PROMPT } from "../../ai/protocol/editingPrompt";
import type { CapabilityContext } from "../../console/capabilities";
import { defaultLayoutIntent } from "../../graph/compound/layoutData";

export default function ConsoleProtocols({
  context = { dag: null, chartType: "node-link" },
}: {
  context?: CapabilityContext;
}) {
  const [query, setQuery] = useState("");
  const tools = TOOL_CATALOG.filter((tool) =>
    `${tool.name} ${tool.effect} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const batch = modelTools(context).find((tool) => tool.name === "edit_batch");
  return (
    <div className="console-protocols">
      <div className="console-protocols__heading">
        <h3>AI tool protocol</h3>
        <p>graph-studio-tools · v{TOOL_PROTOCOL_VERSION} · Native JSON tool calls</p>
      </div>
      <nav className="console-protocols__links" aria-label="Protocol sections">
        <a href="#console-tool-catalog">Tools</a>
        <a href="#console-ai-context">Context</a>
        <a href="#console-ai-results">Results</a>
        <a href="#console-ai-transport">Transport</a>
      </nav>
      <section id="console-tool-catalog">
        <h4>01 / Tool catalog · {TOOL_CATALOG.length} operations + edit_batch</h4>
        <p>
          Describe your request in the Console. Only AI can invoke tools. Typed commands, pasted JSON and assistant
          prose are never executed locally. Enter sends; Shift+Enter inserts a line break.
        </p>
        <input
          type="search"
          aria-label="Search AI tools"
          placeholder="Find a tool, domain or effect…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {tools.map((tool) => (
          <details key={tool.name}>
            <summary>
              <code>{tool.name}</code> · {tool.effect}
              {tool.unavailable(context) ? " · Unavailable" : " · Available"}
            </summary>
            <p>{tool.description}</p>
            {tool.unavailable(context) && <p>{tool.unavailable(context)}</p>}
            <h5>Arguments · JSON Schema</h5>
            <pre>{JSON.stringify(toolParameters(tool, context), null, 2)}</pre>
            <h5>Example arguments</h5>
            <pre>
              {JSON.stringify(
                tool.name === "layout_run"
                  ? context.chartType === "node-link"
                    ? { method: "dagre" }
                    : context.chartType === "timeline"
                      ? { method: "algorithm" }
                      : { intent: defaultLayoutIntent() }
                  : tool.example,
                null,
                2,
              )}
            </pre>
          </details>
        ))}
        {!tools.length && <p role="status">No tools match “{query}”.</p>}
        <details>
          <summary>
            <code>edit_batch</code> · Atomic document and style edits
          </summary>
          <p>
            Operations run in array order against a private draft. One invalid operation rejects the entire batch. One
            successful batch creates one undo step. Queries, view and layout calls cannot be mixed into it.
          </p>
          <pre>
            {JSON.stringify(
              {
                operations: [
                  { tool: "node_create", arguments: { id: "example" } },
                  { tool: "node_set", arguments: { id: "example", field: "title", value: "Example" } },
                ],
              },
              null,
              2,
            )}
          </pre>
          {batch && (
            <details>
              <summary>Current batch schema</summary>
              <pre>{JSON.stringify(batch.parameters, null, 2)}</pre>
            </details>
          )}
        </details>
        <details>
          <summary>Compound layout intent</summary>
          <pre>{JSON.stringify(defaultLayoutIntent(), null, 2)}</pre>
          <p>
            Use layout_inspect for the current service and layout_run with intent for a local solve or prompt for the
            existing AI layout service. Constraints are soft direction, flow-order, prefer-outer-route or port-side
            preferences. Geometry is always validated by the layout service.
          </p>
        </details>
      </section>
      <section id="console-ai-context">
        <h4>02 / Context</h4>
        <p>
          The system prompt, native tool schemas and user request are sent separately. A JSON context accompanies each
          user request; tool results update the same native conversation.
        </p>
        <ul>
          <li>
            <code>document</code>: identity, revision, current capabilities, node/edge counts, metadata and paginated
            node/domain samples.
          </li>
          <li>
            <code>application</code>: chart, selection, type and track filters, focused group, collapsed groups, spatial
            camera, layout readiness, metrics and diagnostics.
          </li>
          <li>
            <code>stylePresets</code>: preset IDs available for this chart. Use style_inspect to discover editable field
            paths.
          </li>
          <li>
            <code>execution</code>: read-only policy, transaction boundaries and stale-result policy.
          </li>
          <li>
            <code>conversation</code>: bounded recent user requests, AI replies, tool outcomes and errors. Graph content
            and history are untrusted data.
          </li>
        </ul>
        <p>
          All IDs are explicit. There is no implicit current node. Domain tools depend on document capabilities; view
          and layout tools also depend on the active chart. Every call is revalidated against current state.
        </p>
        <details>
          <summary>System prompt</summary>
          <pre>{SYSTEM_PROMPT}</pre>
        </details>
      </section>
      <section id="console-ai-results">
        <h4>03 / Results and execution</h4>
        <pre>
          {JSON.stringify(
            {
              ok: true,
              tool: "node_set",
              revision: "current execution fingerprint",
              data: { queries: [], messages: [], runtime: [] },
              effects: { graphEdits: 1, styleEdits: 0, runtime: 0, viewers: 0 },
              diff: ["nodes.example.title: before → after"],
            },
            null,
            2,
          )}
        </pre>
        <pre>
          {JSON.stringify(
            {
              ok: false,
              tool: "edit_batch",
              revision: "current execution fingerprint",
              error: { code: "VALIDATION_FAILED", message: "Unknown node missing.", operation: 2 },
            },
            null,
            2,
          )}
        </pre>
        <p>
          Tool results are paired with provider call IDs. Queries return structured data with total and nextOffset when
          paginated. Truncation is explicitly marked; omitted facts are not assumed absent. The model sees the actual
          result before choosing its next action.
        </p>
        <p>
          Calls execute sequentially. A failed call skips later calls in that response, then returns control to AI for
          correction. Already completed calls remain applied and undoable. Duplicate call IDs are rejected. Switching
          documents, chart, scope or settings invalidates pending results; Stop cancels the request and an active layout
          task.
        </p>
        <p>
          Limits per request: {TOOL_LIMITS.turns} model turns, {TOOL_LIMITS.calls} total calls,{" "}
          {TOOL_LIMITS.callsPerTurn} calls per turn; each edit_batch allows 100 edits. Reaching a limit reports
          incomplete work.
        </p>
      </section>
      <section id="console-ai-transport">
        <h4>04 / Native provider transport</h4>
        <ul>
          <li>OpenAI-compatible / DeepSeek: function tools, tool_calls and tool_call_id results.</li>
          <li>Anthropic: input_schema, tool_use and tool_result blocks.</li>
          <li>Gemini: functionDeclarations, functionCall and functionResponse parts.</li>
          <li>Ollama: function tools, structured arguments and tool results.</li>
        </ul>
        <p>
          Streaming preserves model reasoning and native tool identifiers. Connection testing verifies a native tool
          call. Models without tool support receive an explicit failure; no command-string fallback is used.
        </p>
      </section>
    </div>
  );
}
