import { useState } from "react";
import { CONSOLE_COMMAND_REFERENCE } from "../../console/reference";
import { SYSTEM_PROMPT } from "../../ai/protocol/editingPrompt";
import type { AiResponse } from "../../ai/protocol/types";
import { defaultLayoutIntent } from "../../graph/compound/layoutData";

type Row = readonly [string, string, string];
const requestFields: Row[] = [
  [
    "message",
    "string · required",
    "Latest user request. Plain text entered in the console is sent to AI; / commands run locally.",
  ],
  ["system.role", '"graph_editing_agent"', "Identifies the graph editing agent."],
  [
    "system.language",
    '"zh" | "en" | "auto"',
    "Context language; the current builder sends auto. The system prompt requests English replies.",
  ],
  ["system.responseProtocolVersion", '"v2"', "Selects the response protocol below."],
  ["system.editPolicy.execution", '"validate_then_execute"', "Validate commands before execution."],
  ["graph.summary / commandReference", "string", "Current graph context and its command reference."],
  ["graph.graphRevision", "string", "Revision associated with this request."],
  ["graph.currentSelection / focusedNodes", "string[] · optional", "Selected nodes and the console context node."],
  ["tools.availableCommands", "string", "Commands made available to the model."],
  ["tools.commandExamples / constraints", "string[]", "Usage examples and graph editing constraints."],
  ["memory.consoleHistory", "{ tone, text }[]", "Conversation and console output supplied as context."],
  ["memory.activePlan", "ActionPlan · optional", "Active plan, changes, scope, base revision and validation."],
  ["memory.workingMemory", "WorkingMemory", "Topic, intent, focus, plan IDs, preferences and unresolved questions."],
  ["execution.pendingCommandBatch", "CommandBatch · optional", "Pending commands associated with a graph revision."],
  ["execution.lastValidation", "ValidationReport · optional", "Most recent command validation results."],
];
const responseFields: Row[] = [
  ["answer", "answer: string", "Display a response without graph edits."],
  [
    "clarify",
    "answer; missingInformation?",
    "Ask for missing information. Each item has field, reason and optional candidates[].",
  ],
  [
    "inspect",
    "answer; commands: string[]",
    "Request inspection commands such as /find, /ls or /graph. Commands pass through validation.",
  ],
  [
    "run_console",
    "answer; commandBatch",
    "Execute a nonempty command batch after local validation. Optional preflightRequired defaults to true.",
  ],
  [
    "propose_changes",
    "answer; plan",
    "Create a structured plan. Executable draft commands are validated and run immediately when valid.",
  ],
];
const nestedFields: Row[] = [
  ["commandBatch.commands", "string[] · required", "Nonempty / command strings; non-command entries are filtered out."],
  [
    "commandBatch.title / expectedGraphEffects / riskLevel",
    "string / string[] / risk · optional",
    "Batch description, expected effects and model-provided risk.",
  ],
  [
    "plan.title / goal / changes",
    "string / string / ProposedChange[] · required",
    "Plan identity, objective and structured change list.",
  ],
  ["plan.assumptions / affectedNodes", "string[] · optional", "Assumptions and node keys affected by the plan."],
  [
    "changes[].kind",
    "change kind · required",
    "add_node, set_property, add_edge, remove_edge, merge_node, rename_node, restructure_subgraph.",
  ],
  [
    "changes[].rationale / draftCommands",
    "string / string[] · required",
    "Explanation and executable commands for each change.",
  ],
  [
    "changes[].id / target / dependencies / risk",
    "optional",
    "target supports nodeId, edgeId and property; dependencies is a list of change IDs.",
  ],
  ["draftCommands[]", "{ command, rationale?, risk? }", "Optional top-level command drafts for propose_changes."],
  [
    "nextAction",
    "{ type, message } · optional",
    "type: validate_then_execute or needs_inspection. It does not bypass local validation.",
  ],
  [
    "risk / riskLevel",
    '"low" | "medium" | "high"',
    "Local command classification and validation determine actual execution.",
  ],
  [
    "memoryPatch / fallbackActions",
    "not consumed",
    "Present in the TypeScript types but dropped by the current response parser.",
  ],
];
const transportFields: Row[] = [
  [
    "OpenAI-compatible / DeepSeek",
    "POST {baseUrl}/chat/completions",
    "model, system/user messages, response_format: json_object; response text: choices[0].message.content.",
  ],
  [
    "Anthropic",
    "POST {baseUrl}/v1/messages",
    "model, system, messages, max_tokens; response text: content text blocks.",
  ],
  [
    "Gemini",
    "POST {baseUrl}/v1beta/models/{model}:generateContent",
    "systemInstruction, contents, generationConfig; response text: candidates[0].content.parts. Streaming uses :streamGenerateContent.",
  ],
  [
    "Ollama",
    "POST {baseUrl}/api/chat",
    "model, messages, format: json, stream, options; response text: message.content.",
  ],
];
const AI_RESPONSE_EXAMPLES = [
  { kind: "answer", answer: "The graph contains one starting node." },
  {
    kind: "clarify",
    answer: "Which node should be renamed?",
    missingInformation: [{ field: "nodeId", reason: "The target is ambiguous.", candidates: ["A", "B"] }],
  },
  { kind: "inspect", answer: "Inspecting the current graph.", commands: ["/graph"] },
  {
    kind: "run_console",
    answer: "Adding an example node.",
    commandBatch: {
      title: "Add node",
      commands: ["/add Example"],
      expectedGraphEffects: ["One node added"],
      riskLevel: "medium",
    },
    preflightRequired: true,
  },
  {
    kind: "propose_changes",
    answer: "Create an example node.",
    plan: {
      title: "Add node",
      goal: "Create Example",
      assumptions: [],
      affectedNodes: ["Example"],
      changes: [
        {
          kind: "add_node",
          target: { nodeId: "Example" },
          rationale: "Requested new node",
          draftCommands: ["/add Example"],
          risk: "medium",
        },
      ],
    },
    nextAction: { type: "validate_then_execute", message: "Validate the batch before applying it." },
  },
] satisfies AiResponse[];

function ProtocolTable({ title, columns, rows }: { title: string; columns: Row; rows: Row[] }) {
  return (
    <div className="console-protocols__table-scroll">
      <table className="console-protocols__table">
        <caption>{title}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, type, description]) => (
            <tr key={name}>
              <th scope="row">
                <code>{name}</code>
              </th>
              <td>{type}</td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ConsoleProtocols() {
  const [query, setQuery] = useState("");
  const commands = CONSOLE_COMMAND_REFERENCE.filter((command) =>
    `${command.label} ${command.help}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="console-protocols">
      <div className="console-protocols__heading">
        <h3>Protocol reference</h3>
        <p>Console DSL · AI context · Response v2</p>
      </div>
      <nav className="console-protocols__links" aria-label="Protocol sections">
        <a href="#console-command-protocol">Commands</a>
        <a href="#console-ai-request">AI request</a>
        <a href="#console-ai-response">AI response</a>
        <a href="#console-ai-transport">Transport</a>
      </nav>
      <section id="console-command-protocol">
        <h4>
          01 / Console commands <span>{CONSOLE_COMMAND_REFERENCE.length}</span>
        </h4>
        <p>
          <code>&lt;value&gt;</code> is required; <code>[value]</code> is optional. One command per line. Empty lines
          and lines starting with # are ignored within a command batch. Use <code>.</code> for the node selected by
          /use. Quote keys containing spaces with JSON double quotes.
        </p>
        <input
          type="search"
          aria-label="Search command protocols"
          placeholder="Find a command or keyword…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ProtocolTable
          title="All console command signatures"
          columns={["Command", "Input", "Behavior"]}
          rows={commands.map((command) => [
            command.label,
            command.label.includes("<") || command.label.includes("[") ? "See signature" : "No arguments",
            command.help,
          ])}
        />
        {!commands.length && <p role="status">No commands match “{query}”.</p>}
        <p>
          Relation assignments replace the full set; an empty assignment clears it. /set accepts string, number,
          boolean, null or JSON and cannot edit relationship fields. Compound layout operations run separately from edit
          batches.
        </p>
        <details>
          <summary>Compound layout intent JSON</summary>
          <pre>{JSON.stringify(defaultLayoutIntent(), null, 2)}</pre>
          <ProtocolTable
            title="Layout intent fields (all required)"
            columns={["Field", "Value", "Meaning"]}
            rows={[
              [
                "scope",
                "{ groupId: string | null, includeDescendants: boolean }",
                "null selects root; true includes descendants.",
              ],
              ["operation", '"layout-and-route"', "Recompute node layout and edge routes."],
              ["boundaryPolicy", '"strict" | "allow-ancestor-resize"', "Whether ancestor containers can resize."],
              ["objective", '"readability" | "compact"', "Layout optimization objective."],
              [
                "constraints",
                "LayoutConstraint[] · max 100",
                "Unknown fields are rejected. Every constraint uses strength: soft.",
              ],
              [
                "direction",
                "{ type, scopeId, value, strength }",
                "value: AUTO, RIGHT or DOWN; scopeId is a group ID or null.",
              ],
              ["flow-order", "{ type, scopeId, nodeIds, strength }", "At least two distinct sibling node IDs."],
              ["prefer-outer-route", "{ type, edgeId, strength }", "Prefer an outer route for an edge."],
              [
                "port-side",
                "{ type, edgeId, end, side, strength }",
                "end: source or target; side: east, south, west or north.",
              ],
            ]}
          />
        </details>
      </section>
      <section id="console-ai-request">
        <h4>02 / AI request</h4>
        <p>
          The system prompt and user prompt are sent separately. The user prompt contains a serialized Context Packet
          followed by the latest request. All paths below except message belong to that packet.
        </p>
        <ProtocolTable
          title="Context Packet fields"
          columns={["Field", "Type / value", "Meaning"]}
          rows={requestFields}
        />
        <details>
          <summary>User prompt envelope</summary>
          <pre>
            {
              'Context Packet:\n{ "system": { ... }, "graph": { ... }, "tools": { ... },\n  "memory": { ... }, "execution": { ... } }\n\nLatest user request:\nAdd a node named Example.'
            }
          </pre>
        </details>
        <details>
          <summary>Current system prompt</summary>
          <pre>{SYSTEM_PROMPT}</pre>
        </details>
      </section>
      <section id="console-ai-response">
        <h4>03 / AI response · v2</h4>
        <p>
          Return one JSON object with a <code>kind</code> discriminator and a string <code>answer</code>. Use strict
          JSON and escape quotes inside command strings. Do not wrap the response in Markdown fences.
        </p>
        <ProtocolTable title="Response variants" columns={["kind", "Fields", "Behavior"]} rows={responseFields} />
        <ProtocolTable
          title="Nested response fields"
          columns={["Field", "Type / requirement", "Meaning"]}
          rows={nestedFields}
        />
        {AI_RESPONSE_EXAMPLES.map((example) => (
          <details key={example.kind}>
            <summary>{example.kind} · JSON example</summary>
            <pre>{JSON.stringify(example, null, 2)}</pre>
          </details>
        ))}
        <p>
          Validation checks commands against the current graph revision before execution. Valid edits run immediately
          and can be undone. Changing the document or request context discards an outdated response. Protocol parse
          failures get one repair attempt; transport failures and cancellation are not retried by that repair step.
        </p>
        <details>
          <summary>Legacy response compatibility</summary>
          <pre>
            {
              '{ "type": "answer", "text": "..." }\n{ "type": "run_console", "explanation": "...", "commands": ["/graph"] }'
            }
          </pre>
          <p>These legacy forms are normalized to v2. Use kind / answer for new integrations.</p>
        </details>
      </section>
      <section id="console-ai-transport">
        <h4>04 / Provider transport</h4>
        <ProtocolTable
          title="Provider request and response envelopes"
          columns={["Provider", "Endpoint", "Envelope"]}
          rows={transportFields}
        />
        <p>
          When progress reporting is enabled, responses use SSE or Ollama NDJSON. Text chunks are assembled before
          protocol parsing; model reasoning is displayed separately. This reference describes Graph Studio's implemented
          transports and contains no API keys or live request data.
        </p>
      </section>
    </div>
  );
}
