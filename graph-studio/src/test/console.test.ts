import assert from "node:assert/strict";
import { defineSuite, defineTest } from "./harness";
import { createSampleDag } from "./fixtures";
import { parseToolOperations, modelTools, TOOL_CATALOG } from "../ai/tools/catalog";
import { validateArguments } from "../ai/tools/schema";
import { runToolLoop, boundedResult, type ToolResult } from "../ai/tools/loop";
import type { ToolReply } from "../ai/transport/toolConversation";
import type { ModelToolCall } from "../ai/transport/toolTypes";
import { executeConsoleInstructions } from "../console/executor";
import { buildAiContextPacket } from "../ai/context/packet";
import { createInitialGraphState } from "../app/document/initialState";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ConsoleProtocols from "../components/console/ConsoleProtocols";

const context = () => ({ dag: createSampleDag(), chartType: "node-link" as const });
const call = (id: string, name = "graph_inspect", args: unknown = {}) => ({
  id,
  name,
  arguments: JSON.stringify(args),
});
const reply = (calls: ModelToolCall[] = [], content = "Done"): ToolReply => ({
  content,
  assistant: { role: "assistant", content, calls },
});
const result = (tool: string, revision = "r1", ok = true): ToolResult => ({
  ok,
  tool,
  revision,
  ...(!ok ? { error: { code: "VALIDATION_FAILED", message: "Missing node" } } : {}),
});

export const consoleSuite = defineSuite("AI JSON tools and execution loop", [
  defineTest("catalog names and all argument schemas are unique and examples validate", () => {
    assert.equal(new Set(TOOL_CATALOG.map((t) => t.name)).size, TOOL_CATALOG.length);
    const markup = renderToStaticMarkup(createElement(ConsoleProtocols, { context: context() }));
    for (const tool of TOOL_CATALOG) {
      assert.match(tool.name, /^[a-z][a-z0-9_]+$/);
      assert.ok(markup.includes(tool.name));
      assert.equal(tool.parameters.additionalProperties, false);
      validateArguments(tool.example, tool.parameters);
    }
    assert.ok(!markup.includes("Console DSL"));
  }),
  defineTest("structured arguments reject old command strings, unknown fields and wrong types", () => {
    for (const args of ["/add X", [], null, { id: "X", extra: true }, { id: 4 }])
      assert.throws(() => parseToolOperations("node_create", args, context()));
    assert.throws(() => parseToolOperations("/add", { id: "X" }, context()), /Unknown tool/);
    assert.throws(() => parseToolOperations("graph_inspect", { limit: 101 }, context()));
    assert.throws(() =>
      parseToolOperations("node_set", JSON.parse('{"id":"A","field":"title","value":"x","__proto__":{}}'), context()),
    );
  }),
  defineTest("capabilities and analysis-only restrictions are enforced at runtime", () => {
    assert.ok(!modelTools(context()).some((t) => t.name === "flow_set"));
    assert.throws(() => parseToolOperations("flow_set", { edge: "ab", value: 1 }, context()));
    const tools = modelTools(context(), true);
    assert.ok(tools.some((t) => t.name === "graph_inspect"));
    assert.ok(!tools.some((t) => t.name === "node_open" || t.name === "edit_batch" || t.name === "node_set"));
    assert.throws(() => parseToolOperations("node_delete", { id: "A" }, context(), true));
  }),
  defineTest("failed batches publish neither preceding node nor style mutations", () => {
    const ctx = context(),
      before = JSON.stringify(ctx.dag);
    const instructions = parseToolOperations(
      "edit_batch",
      {
        operations: [
          { tool: "node_create", arguments: { id: "new" } },
          { tool: "style_set", arguments: { path: "style.appearance.nodes.height", value: 150 } },
          { tool: "node_set", arguments: { id: "missing", field: "title", value: "bad" } },
        ],
      },
      ctx,
    );
    const out = executeConsoleInstructions(ctx.dag, instructions);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.line, 3);
    assert.equal(JSON.stringify(ctx.dag), before);
  }),
  defineTest("explicit IDs preserve spaces, newlines and literal dots without tokenization", () => {
    const ctx = context();
    const out = executeConsoleInstructions(
      ctx.dag,
      parseToolOperations(
        "edit_batch",
        {
          operations: [
            { tool: "node_create", arguments: { id: "." } },
            { tool: "node_create", arguments: { id: "with spaces" } },
            { tool: "node_set", arguments: { id: ".", field: "define", value: "first\nsecond" } },
            { tool: "edge_set", arguments: { source: ".", target: "with spaces", value: true } },
          ],
        },
        ctx,
      ),
    );
    assert.ok(out.ok);
    assert.equal(out.dag.nodes["."].define, "first\nsecond");
    assert.ok(out.dag.edges.some((e) => e.source === "." && e.target === "with spaces"));
  }),
  defineTest("query results are structured and support pages and exact field reads", () => {
    const ctx = context();
    const out = executeConsoleInstructions(ctx.dag, parseToolOperations("graph_inspect", { limit: 1 }, ctx));
    assert.ok(out.ok);
    assert.equal(out.mutationCount, 0);
    assert.equal(out.queryResults[0].nextOffset, 1);
    const node = executeConsoleInstructions(
      ctx.dag,
      parseToolOperations("node_inspect", { id: "A", field: "title" }, ctx),
    );
    assert.ok(node.ok);
    assert.match(JSON.stringify(node.queryResults), /Alpha/);
  }),
  defineTest("context includes scope, filters, capabilities and bounded samples", () => {
    const state = { ...createInitialGraphState(), dag: createSampleDag() };
    const packet = buildAiContextPacket(
      state,
      { view: { typeFilter: { enabled: true, selection: "multiple", operation: "exclude", values: ["service"] } } },
      [],
      "r1",
      true,
    );
    assert.equal(packet.document.revision, "r1");
    assert.equal(packet.execution.readOnly, true);
    assert.match(JSON.stringify(packet.application.view), /exclude/);
    assert.ok(!("commandReference" in packet));
    assert.match(JSON.stringify(boundedResult({ text: "x".repeat(5000) })), /truncated/);
  }),
  defineTest("native query results are paired by ID and fed back before the final answer", async () => {
    let turns = 0;
    const texts: string[] = [];
    await runToolLoop({
      messages: [],
      tools: () => modelTools(context()),
      snapshot: () => "r1",
      signal: new AbortController().signal,
      request: async (messages) => {
        turns++;
        if (turns === 1) return reply([call("c1")], "Inspecting");
        const last = messages.at(-1)!;
        assert.equal(last.role, "tool");
        if (last.role === "tool") {
          assert.equal(last.callId, "c1");
          assert.equal(JSON.parse(last.content).ok, true);
        }
        return reply([], "Four nodes");
      },
      execute: async (name) => result(name),
      onText: (text) => texts.push(text),
    });
    assert.equal(turns, 2);
    assert.deepEqual(texts, ["Inspecting", "Four nodes"]);
  }),
  defineTest("a stale response cannot execute when the view changes while awaiting AI", async () => {
    let revision = "r1",
      executions = 0;
    await assert.rejects(
      runToolLoop({
        messages: [],
        tools: () => modelTools(context()),
        snapshot: () => revision,
        signal: new AbortController().signal,
        request: async () => {
          revision = "r2";
          return reply([call("c1", "node_delete", { id: "A" })]);
        },
        execute: async (name) => {
          executions++;
          return result(name, revision);
        },
        onText: () => {},
      }),
      /changed/,
    );
    assert.equal(executions, 0);
  }),
  defineTest("cancelled requests never execute delayed model calls", async () => {
    const abort = new AbortController();
    let executions = 0;
    await assert.rejects(
      runToolLoop({
        messages: [],
        tools: () => modelTools(context()),
        snapshot: () => "r1",
        signal: abort.signal,
        request: async () => {
          abort.abort();
          return reply([call("c1")]);
        },
        execute: async (name) => {
          executions++;
          return result(name);
        },
        onText: () => {},
      }),
      /cancelled/,
    );
    assert.equal(executions, 0);
  }),
  defineTest("successful edits advance the snapshot before dependent inspections", async () => {
    let revision = "r1",
      turn = 0;
    const names: string[] = [];
    await runToolLoop({
      messages: [],
      tools: () => modelTools(context()),
      snapshot: () => revision,
      signal: new AbortController().signal,
      request: async () => (++turn === 1 ? reply([call("c1", "node_create", { id: "X" }), call("c2")]) : reply()),
      execute: async (name) => {
        names.push(name);
        if (name === "node_create") revision = "r2";
        return result(name, revision);
      },
      onText: () => {},
    });
    assert.deepEqual(names, ["node_create", "graph_inspect"]);
  }),
  defineTest("failures skip dependent calls and return diagnostics for correction", async () => {
    let turn = 0,
      executions = 0;
    await runToolLoop({
      messages: [],
      tools: () => modelTools(context()),
      snapshot: () => "r1",
      signal: new AbortController().signal,
      request: async (messages) => {
        if (++turn === 1) return reply([call("c1", "node_delete", { id: "missing" }), call("c2")]);
        assert.match(JSON.stringify(messages), /DEPENDENCY_FAILED/);
        return reply([], "Could not delete missing node");
      },
      execute: async (name) => {
        executions++;
        return result(name, "r1", false);
      },
      onText: () => {},
    });
    assert.equal(executions, 1);
  }),
  defineTest("duplicate call IDs cannot reapply a completed edit", async () => {
    let executions = 0;
    await assert.rejects(
      runToolLoop({
        messages: [],
        tools: () => modelTools(context()),
        snapshot: () => "r1",
        signal: new AbortController().signal,
        request: async () => reply([call("same", "node_create", { id: "X" })]),
        execute: async (name) => {
          executions++;
          return result(name);
        },
        onText: () => {},
      }),
      /Duplicate/,
    );
    assert.equal(executions, 1);
  }),
  defineTest("plain assistant text is never interpreted as commands", async () => {
    let executions = 0;
    await runToolLoop({
      messages: [],
      tools: () => modelTools(context()),
      snapshot: () => "r1",
      signal: new AbortController().signal,
      request: async () => reply([], "/add X"),
      execute: async (name) => {
        executions++;
        return result(name);
      },
      onText: () => {},
    });
    assert.equal(executions, 0);
  }),
]);
