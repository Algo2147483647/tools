# DAG Studio AI Capabilities

This document summarizes the current AI capability system in DAG Studio. It covers the user-facing workflows, provider integration, execution modes, internal harness model, response protocol, validation path, persistence behavior, and current limitations.

For console command syntax, see [Graph Console DSL](graph-console-dsl.md). For graph UI configuration, see [Graph Appearance System](graph-appearance.md). For general product workflows, see [Usage Guide](usage.md).

## Capability Overview

DAG Studio's AI layer is a graph and appearance assistant built on top of the existing console DSL. The model does not mutate graph data or graph UI directly. Instead, it receives a structured context packet, returns a structured JSON response, and the application converts that response into answers, inspection commands, proposed plans, or validated command batches.

The system supports these high-level capabilities:

| Capability | Description |
| --- | --- |
| Graph Q&A | Answer questions using the current graph summary, focused node, selection, recent console output, and AI harness memory. |
| Graph inspection | Request or automatically run read-only console commands such as `/find`, `/ls`, `/neighbors`, `/path`, `/keys`, and `/graph`. |
| Edit planning | Produce a named plan with assumptions, affected nodes, proposed changes, rationales, and draft console commands. |
| Command drafting | Convert natural-language graph edits into console command batches. |
| Appearance editing | Convert natural-language UI requests into `/layout`, `/style-var`, `/style-css`, `/style-preset`, and `/style-reset` command batches. |
| Preflight validation | Parse and simulate command batches before execution, including syntax checks, graph existence checks, risk classification, and diff preview generation. |
| Review cards | Show AI-generated plans in the console with command text, risk level, validation summary, and diff preview. |
| Controlled execution | Apply validated command batches only when the active execution mode and risk checks allow it. |
| Activity tracking | Record user messages, assistant answers, plan creation, command drafting, validation, execution, approvals, rejections, and errors. |
| Per-graph memory | Persist harness state per graph so active plans and recent events survive refreshes. |

## User Entry Points

AI is available from the console sidebar in `Edit` mode.

| Input | Behavior |
| --- | --- |
| Text starting with `/` | Treated as a console DSL command or command batch. |
| Plain text | Treated as an AI request when AI is enabled. |
| Multi-line paste starting with `/` | Runs as a console batch. |
| Multi-line plain-text paste | Sends the pasted text as an AI request. |

The settings dialog exposes AI controls under `Settings -> AI`:

| Setting | Purpose |
| --- | --- |
| Enable | Turns AI request handling on or off. |
| Provider | Chooses the request adapter and default endpoint/model preset. |
| Execution | Selects the command execution policy. |
| Base URL | Endpoint base URL used by the selected provider adapter. |
| Model | Model identifier passed to the provider. |
| API Key | Secret credential for hosted providers; optional for local Ollama. |
| Temp | Sampling temperature, clamped from `0` to `2`. |
| Tokens | Output token budget, clamped from `128` to `8000`. |
| Test Connection | Sends a minimal JSON-only request and reports success or failure. |

## Supported Providers

The provider layer currently supports five provider families:

| Provider | Adapter | Default Base URL | Default Model |
| --- | --- | --- | --- |
| OpenAI compatible | Chat Completions-compatible `/chat/completions` request | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| DeepSeek | OpenAI-compatible request path | `https://api.deepseek.com` | `deepseek-v4-flash` |
| Anthropic | Messages API request to `/v1/messages` | `https://api.anthropic.com` | `claude-3-5-sonnet-latest` |
| Gemini | `generateContent` request with JSON response MIME type | `https://generativelanguage.googleapis.com` | `gemini-1.5-flash` |
| Ollama | Local `/api/chat` request | `http://localhost:11434` | `llama3.1` |

Provider requests are made from the browser via `fetch`. The system asks every provider for JSON-only responses that follow DAG Studio's AI response protocol.

## Execution Modes

AI behavior is gated by `AiExecutionMode`.

| Mode | Behavior |
| --- | --- |
| `ask` | The assistant can answer and draft plans. Edit commands remain pending. Read-only command batches may run automatically after validation. |
| `review` | The assistant validates proposed command batches and shows a review card. The user can apply the batch by approving it or using the review card. |
| `auto-readonly` | Read-only batches can execute automatically. Edit batches remain held for review. |
| `auto-edit` | Low- and medium-risk validated edit batches may execute automatically. High-risk batches and destructive commands remain blocked from automatic execution. |

Destructive commands include `/rm`, `/rm-edge`, and `/unset`. Relation replacement commands such as `/parents` and `/children` are treated as high risk because they can remove existing edges.

## Context Packet

Each AI request includes a context packet with these sections:

| Section | Contents |
| --- | --- |
| `system` | Agent role, language policy, response protocol version, execution mode, auto-edit flag, and destructive-change review policy. |
| `graph` | Current graph summary, graph revision, selected nodes, focused nodes, application mode, layout mode, current console context node, node lookup index, and command reference. |
| `appearance` | Current appearance summary, layout appearance values, CSS variables, custom CSS, presets, and stable SVG selectors for style commands. |
| `tools` | Available console commands, command examples, and constraints for valid command generation. |
| `memory` | Recent AI events, active plan, and working memory. |
| `execution` | Pending command batch and last validation report, when available. |
| `budget` | Input/output token budget hints and context compression level. |

Graph context is intentionally compressed:

| Limit | Current Value |
| --- | --- |
| Detailed node summaries | First `80` sorted nodes |
| Node lookup index | First `240` sorted nodes |
| Recent AI events | Last `40` events |
| Recent console lines included as synthetic events | Last `16` entries |

When the graph is larger than the included context, the prompt instructs the model to use read-only inspection commands such as `/find`, `/ls`, `/neighbors`, `/path`, or `/graph`.

Appearance context is much smaller and is normally included directly. The prompt instructs the model to use stable `.dag-*` selectors and `--dag-*` CSS variables when proposing UI changes.

## Response Protocol

The model is instructed to return JSON using response protocol `v2`. The parser accepts current protocol responses and also has a fallback for an older legacy protocol.

| `kind` | Meaning | Typical UI Result |
| --- | --- | --- |
| `answer` | A direct natural-language answer. | Console AI message. |
| `clarify` | The request cannot be completed without more information. | Console AI message with missing information. |
| `inspect` | The model needs graph facts before deciding. | Read-only inspection command plan. |
| `propose_changes` | The model proposes a named plan and draft commands. | Active plan, pending command batch, review card. |
| `run_console` | The model returns a command batch directly. | Pending command batch, validation, optional execution. |

All executable commands must start with `/`. Invalid or empty command batches are rejected before they can run.

## Planning Model

When the assistant returns `propose_changes`, DAG Studio creates an `ActionPlan`:

| Field Group | Purpose |
| --- | --- |
| Identity | Plan id, session id, graph id, and status. |
| Source | User turn id and original user message. |
| Scope | Target nodes, target edges, affected concepts, and base graph revision. |
| Changes | Proposed changes with kind, target, rationale, draft commands, dependencies, and risk. |
| Command batch | Deduplicated executable commands derived from draft commands and proposed changes. |
| Validation | Last preflight report, if available. |
| UI metadata | Display summary, confirmation requirement, and max risk level. |
| Timestamps | Creation and update times. |

Plans can move through statuses such as `proposed`, `ready`, `applied`, `failed`, `cancelled`, and `superseded`. If the graph revision changes while a plan is still open, the harness marks the plan as `superseded` and clears the pending command batch.

## Command Validation

Before any AI-generated command batch is applied, DAG Studio runs a preflight validation:

1. Join the command lines into console source.
2. Parse the source with the same console DSL parser used for manual commands.
3. Reject invalid syntax with line-local diagnostics.
4. Reject graph-dependent commands when no graph is loaded.
5. Simulate execution against the current graph and current appearance.
6. Classify risk from explicit model risk and command contents.
7. Build a diff preview of expected node, field, edge, layout, CSS variable, and CSS changes.
8. Mark the batch as validated or failed.

The validation report includes per-command validity, errors, warnings, expected diffs, aggregate risk, confirmation requirement, and a human-readable summary.

## Risk and Execution Policy

Risk is computed from both model-provided risk and command-derived risk.

| Risk | Examples |
| --- | --- |
| Low | Read-only commands such as `/help`, `/keys`, `/graph`, `/find`, `/ls`, `/neighbors`, `/path`, `/use`, `/show`, and `/json`. |
| Medium | Non-destructive mutations such as `/add`, `/cp`, `/edge`, `/mv`, `/set`, `/style-css replace`, and `/style-reset`. |
| High | Destructive commands and full relation replacements such as `/rm`, `/rm-edge`, `/unset`, `/parents`, and `/children`. |

Most appearance commands are low risk because they do not change graph data. Full CSS replacement and full appearance reset are medium risk because they can replace a large part of the UI configuration.

Execution policy:

| Condition | Result |
| --- | --- |
| Validation fails | Commands do not run. |
| All commands are read-only | Commands may run automatically after validation. |
| Mode is `ask` | Edit commands remain pending. |
| Mode is `review` | Edit commands require explicit user approval. |
| Mode is `auto-readonly` | Only low-risk, confirmation-free batches execute automatically. |
| Mode is `auto-edit` | Validated non-high-risk batches can execute automatically unless they start with `/rm`. |

## Review and Activity UI

The console sidebar has two panels:

| Panel | Purpose |
| --- | --- |
| Console | Shows prompts, AI answers, errors, command output, review cards, and the input box. |
| AI Activity | Shows compact AI session records grouped by session id, with the latest request or active plan, timestamp, session status, turn count, and re-entry action. |

Each session record has a re-entry icon. Re-entry places a continuation prompt back into the console input and switches to the Console panel, so the user can continue the whole AI session rather than a single response turn.

Review cards include:

| Element | Purpose |
| --- | --- |
| Plan title and goal | Explain what the assistant is trying to do. |
| Risk badge | Show low, medium, or high risk. |
| Change and command counts | Summarize the batch size. |
| Validation summary | Explain preflight outcome. |
| Diff preview | Show expected nodes, fields, and edges affected. |
| Commands | Show the exact console commands. |
| Apply | Validate again and execute the batch. |
| Copy Commands | Copy the command batch to the clipboard. |
| Dismiss | Cancel the active AI plan. |

## Memory and Persistence

AI state is split between page preferences and per-graph harness state.

| Storage Area | Key | Contents |
| --- | --- | --- |
| Page preferences | `dag-studio:page-preferences` | AI settings, UI preferences, field mapping, appearance, mode, layout, and console sidebar state. |
| AI harness | `dag-studio:ai-harness:<encoded graph id>` | Session id, graph id, graph revision, working memory, active plan, pending command batch, recent events, artifact refs, and mode. |

Persisted AI harness data is sanitized on load. Invalid plans, command batches, validation reports, events, and working memory are dropped or defaulted rather than trusted blindly.

## Safety Boundaries

The current safety model is built around these constraints:

| Boundary | Mechanism |
| --- | --- |
| No direct graph writes by the model | The prompt requires console commands; the app only applies parsed console instructions. |
| No direct UI writes by the model | Appearance changes must use parsed appearance console commands. |
| Structured model output | Provider responses are parsed as JSON and must match known response shapes. |
| Command allowlist | Every command must start with `/` and pass the console parser. |
| Preflight simulation | AI commands are validated against the current graph before execution. |
| Risk classification | Potentially destructive commands require review or are blocked from automatic execution. |
| Graph revision tracking | Open plans are superseded when the graph revision changes. |
| User-visible review | Plans expose exact commands and expected diffs before manual application. |
| Storage sanitization | Persisted harness state is cleaned before use. |

## Current Limitations

| Limitation | Impact |
| --- | --- |
| Browser-side provider calls | API keys are stored in browser local storage and sent directly from the client. This is suitable for local use, not a hardened multi-user deployment. |
| No streaming | Provider responses are handled as complete JSON responses. |
| No provider-specific tool calling | All providers are normalized to text-in/text-out JSON. |
| Context is compressed | Very large graphs require follow-up inspection commands for details beyond the included node limits. |
| Diff previews are capped | Validation previews return only the first `24` diff lines. |
| No semantic command sandbox beyond validation | Commands that validate and pass policy execute through the normal graph mutation core. |
| Model quality depends on prompt compliance | Invalid JSON or unsupported response shapes surface as AI request errors. |

## Implementation Map

| Area | File |
| --- | --- |
| AI types and response protocol | [`src/ai/types.ts`](../src/ai/types.ts) |
| Provider adapters and response parsing | [`src/ai/providers.ts`](../src/ai/providers.ts) |
| Graph context construction | [`src/ai/context.ts`](../src/ai/context.ts) |
| Harness state, planning, validation, risk, and execution policy | [`src/ai/harness.ts`](../src/ai/harness.ts) |
| Harness persistence and sanitization | [`src/ai/persistence.ts`](../src/ai/persistence.ts) |
| App-level orchestration | [`src/App.tsx`](../src/App.tsx) |
| Console and AI activity UI | [`src/components/ConsoleSidebar.tsx`](../src/components/ConsoleSidebar.tsx) |
| AI settings UI and provider presets | [`src/components/Topbar.tsx`](../src/components/Topbar.tsx) |
| Saved page preferences and default AI settings | [`src/state/preferences.ts`](../src/state/preferences.ts) |
| Console command reference | [`src/console/reference.ts`](../src/console/reference.ts) |
| Appearance command core | [`src/graph/appearanceCommands.ts`](../src/graph/appearanceCommands.ts) |
| AI harness tests | [`src/test/aiHarness.test.ts`](../src/test/aiHarness.test.ts) |

## End-to-End Flow

```text
Plain-text console input
-> create AI turn and user.message event
-> build context packet from graph, tools, memory, and execution state
-> send provider request
-> parse JSON response
-> answer, clarify, inspect, propose plan, or build command batch
-> validate command batch with console parser and executor simulation
-> show review card or execute according to mode and risk
-> record validation/execution events
-> persist harness state for the current graph
```
