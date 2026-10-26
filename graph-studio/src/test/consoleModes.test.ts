import { splitCommandStages } from "../console/workflow";
import assert from "node:assert/strict";
import { defineSuite, defineTest } from "./harness";
import { createGraphDocument, normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import type { GraphChartType } from "../graph/types";
import { parseConsoleSource } from "../console/dsl";
import { executeConsoleInstructions } from "../console/executor";
import { getConsoleCommandReference } from "../console/reference";
import { isReadOnlyInstruction, getConsoleSuggestions } from "../console/presentation";
import { executionFingerprint } from "../console/snapshot";
import type { ConsoleEnvironment } from "../console/runtime";
import { DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { serializeChartStyle, parseChartStyleFile } from "../schema/styleProtocol";
import { createInitialGraphState } from "../app/document/initialState";
import { graphReducer } from "../app/document/graphReducer";
import { prepareConsoleTransaction } from "../app/document/graphTransactions";
import { buildAiContextPacket } from "../ai/context/packet";
import { createInitialAiHarnessState } from "../ai/session/harness";
import { runInspectionLoop, isAnalysisOnlyRequest } from "../ai/session/inspection";
import type { AiResponse } from "../ai/types";
import { validateCommandBatch } from "../ai/execution/validation";
import { parsePersistedAiHarnessState } from "../ai/session/restore";

const base = () =>
  createGraphDocument({ A: { title: "A" }, B: { title: "B" }, C: { title: "C" } }, [
    { id: "ab", source: "A", target: "B", value: 10 },
    { id: "bc", source: "B", target: "C", value: 8 },
  ]);
const timeline = () =>
  normalizeDagInput({
    ...serializeDag(base()),
    metadata: { timeline: { clock: { mode: "calendar" } } },
    nodes: {
      A: { time: { at: "2026-10-27" }, track: "T" },
      B: { time: { start: "2026-10-26", end: "2026-10-30" }, track: "T" },
      C: {},
    },
  });
const space = (system = "cartesian") =>
  normalizeDagInput({
    ...serializeDag(base()),
    metadata: { space: { dimensions: 3, coordinateSystem: system, unit: "km" } },
    nodes: { A: { space: [1, 2, 3] }, B: { space: [4, 5, 6] }, C: { space: [0, 0, 0] } },
  });
function run(source: string, dag = base(), chart: GraphChartType = "node-link", environment: ConsoleEnvironment = {}) {
  const parsed = parseConsoleSource(source);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error.message);
  return executeConsoleInstructions(dag, parsed.instructions, null, DEFAULT_GRAPH_APPEARANCE, chart, {
    referenceTime: Date.UTC(2026, 9, 27),
    ...environment,
  });
}
function success(
  source: string,
  dag = base(),
  chart: GraphChartType = "node-link",
  environment: ConsoleEnvironment = {},
) {
  const result = run(source, dag, chart, environment);
  assert.ok(result.ok, result.ok ? "" : result.message);
  return result;
}
const context = () =>
  buildAiContextPacket({
    harness: createInitialAiHarnessState(),
    dag: base(),
    mode: "edit",
    chartType: "node-link",
    layoutMode: "sugiyama",
    selection: { type: "full" },
    contextNodeKey: null,
    consoleEntries: [],
  });

export const consoleModesSuite = defineSuite("console modes", [
  defineTest("workflows split runtime tasks while retaining atomic edit batches", () => {
    assert.deepEqual(
      splitCommandStages(["/set A title One", "/set B title Two", '/layout run {"method":"dagre"}', "/ls A"]),
      [["/set A title One", "/set B title Two"], ['/layout run {"method":"dagre"}'], ["/ls A"]],
    );
    assert.throws(() => splitCommandStages(["/set A title One", "/unknown"]), /Unknown/);
  }),
  defineTest("capabilities distinguish data from view and omit unavailable tools", () => {
    assert.ok(
      !getConsoleCommandReference({ dag: base(), chartType: "node-link" }).some((c) => c.label.startsWith("/space")),
    );
    assert.ok(
      getConsoleCommandReference({ dag: space(), chartType: "node-link" }).some((c) =>
        c.label.startsWith("/space set"),
      ),
    );
    assert.ok(
      !getConsoleCommandReference({ dag: space(), chartType: "node-link" }).some((c) =>
        c.label.startsWith("/view set"),
      ),
    );
    assert.ok(
      getConsoleCommandReference({ dag: base(), chartType: "node-link" }, true).some(
        (c) => c.label.startsWith("/space") && c.help.includes("Unavailable"),
      ),
    );
    assert.equal(run('/space set {"id":"A","coordinates":[1,2,3]}').ok, false);
  }),
  defineTest("domain parser rejects unknown actions, fields and nonobject arguments", () => {
    for (const source of ["/flow magic {}", '/flow set {"edge":"ab","value":5,"extra":1}', "/group create []"])
      assert.equal(parseConsoleSource(source).ok, false);
    assert.equal(parseConsoleSource('/timeline set {"id":"A","time":{"at":"2026-10-27"}}').ok, true);
  }),
  defineTest("group create and move change containment without changing ordinary edges", () => {
    const dag = base();
    const result = success(
      '/group create {"id":"G","title":"Group","members":["A","B"]}\n/group move {"members":["C"],"parent":"G"}',
      dag,
      "compound",
    );
    assert.deepEqual(result.dag.edges, dag.edges);
    assert.equal(result.dag.hierarchy_edges?.length, 3);
    assert.ok(result.diff.some((line) => line.startsWith("hierarchy.")));
    assert.equal(dag.hierarchy_edges, undefined);
  }),
  defineTest("containment cycles fail without publishing earlier batch changes", () => {
    const dag = base();
    const result = run(
      '/group create {"id":"G","title":"Group","members":["A"]}\n/group move {"members":["G"],"parent":"A"}',
      dag,
      "compound",
    );
    assert.equal(result.ok, false);
    assert.equal(dag.nodes.G, undefined);
  }),
  defineTest("group deletion follows containment and keeps unrelated ordinary descendants", () => {
    const dag = success('/group create {"id":"G","title":"Group","members":["A"]}', base(), "compound").dag;
    const deleted = success('/group delete {"id":"G"}', dag, "compound");
    assert.deepEqual(Object.keys(deleted.dag.nodes).sort(), ["B", "C"]);
    const dissolved = success('/group dissolve {"id":"G"}', dag, "compound");
    assert.ok(dissolved.dag.nodes.G);
    assert.ok(dissolved.dag.nodes.A);
    assert.deepEqual(dissolved.dag.edges, dag.edges);
    assert.equal(success("/rm -r A", dag, "compound").dag.nodes.C, undefined);
  }),
  defineTest("timeline changes preserve interval duration and assign tracks", () => {
    const result = success(
      '/timeline shift {"ids":["A","B"],"amount":3,"unit":"day"}\n/timeline track {"ids":["A"],"track":"Delivery"}',
      timeline(),
      "timeline",
    );
    assert.deepEqual(result.dag.nodes.A.time, { at: "2026-10-30" });
    assert.deepEqual(result.dag.nodes.B.time, { start: "2026-10-29", end: "2026-11-02" });
    assert.equal(result.dag.nodes.A.track, "Delivery");
  }),
  defineTest("timeline rejects invalid dates, inverted intervals and wrong units", () => {
    for (const time of [{ at: "2026-02-30" }, { start: "2026-10-28", end: "2026-10-27" }, { at: 5 }]) {
      assert.equal(run(`/timeline set ${JSON.stringify({ id: "A", time })}`, timeline(), "timeline").ok, false);
    }
    assert.equal(run('/timeline shift {"ids":["A"],"amount":1,"unit":"month"}', timeline(), "timeline").ok, false);
  }),
  defineTest("relative clocks require the declared unit and preserve numeric values", () => {
    const dag = normalizeDagInput({
      ...serializeDag(timeline()),
      metadata: { timeline: { clock: { mode: "relative", unit: "cycle" } } },
      nodes: { A: { time: { basis: "relative", at: 2 } } },
      edges: [],
    });
    assert.deepEqual(
      success('/timeline shift {"ids":["A"],"amount":3,"unit":"cycle"}', dag, "timeline").dag.nodes.A.time,
      { basis: "relative", at: 5 },
    );
    assert.equal(run('/timeline shift {"ids":["A"],"amount":3,"unit":"day"}', dag, "timeline").ok, false);
  }),
  defineTest("ongoing events use a fixed operation reference time", () => {
    const source = '/timeline set {"id":"A","time":{"start":"2026-10-28","end":null}}';
    assert.equal(run(source, timeline(), "timeline", { referenceTime: Date.UTC(2026, 9, 27) }).ok, false);
    assert.equal(run(source, timeline(), "timeline", { referenceTime: Date.UTC(2026, 9, 29) }).ok, true);
  }),
  defineTest("timeline range inspection reports missing times and supports pagination", () => {
    const all = success('/timeline inspect {"limit":1}', timeline(), "timeline").queryResults[0];
    assert.equal(all.total, 3);
    assert.equal(all.nextOffset, 1);
    const range = success('/timeline inspect {"start":"2026-10-29","end":"2026-10-31"}', timeline(), "timeline")
      .queryResults[0];
    assert.equal(range.total, 1);
    assert.match(JSON.stringify(range.data), /"id":"B"/);
  }),
  defineTest("flow weights and metadata produce concrete diffs and preserve IDs", () => {
    const result = success(
      '/flow set {"edge":"ab","value":140}\n/edge-data set {"id":"ab","metadata":{"feedback":true}}',
      base(),
      "sankey",
    );
    assert.equal(result.dag.edges[0].id, "ab");
    assert.equal(result.dag.edges[0].value, 140);
    assert.deepEqual(result.dag.edges[0].metadata, { feedback: true });
    assert.ok(result.diff.some((line) => line.includes("edges.ab.value: 10 → 140")));
    assert.ok(result.diff.some((line) => line.includes("edges.ab.metadata")));
    for (const source of [
      '/flow set {"edge":"ab","value":-1}',
      '/flow scale {"edges":["ab"],"factor":-1}',
      "/edge A B label",
    ])
      assert.equal(run(source, base(), "sankey").ok, false);
  }),
  defineTest("Sankey cycles and imbalance remain valid diagnostics", () => {
    const dag = createGraphDocument(serializeDag(base()).nodes, [
      ...base().edges,
      { id: "ca", source: "C", target: "A", value: 4 },
    ]);
    const result = success("/flow inspect", dag, "sankey");
    assert.match(JSON.stringify(result.queryResults), /"feedback":true/);
    assert.equal(result.mutationCount, 0);
    assert.deepEqual(result.dag.edges, dag.edges);
  }),
  defineTest("coordinate changes respect dimensionality and coordinate system", () => {
    assert.deepEqual(
      success('/space translate {"ids":["A","B"],"delta":[1,0,-1]}', space(), "spatial").dag.nodes.A.space,
      [2, 2, 2],
    );
    assert.equal(run('/space set {"id":"A","coordinates":[1,2]}', space(), "spatial").ok, false);
    assert.equal(run('/space set {"id":"A","coordinates":[1,95,0]}', space("geographic"), "spatial").ok, false);
    assert.equal(run('/space translate {"ids":["A"],"delta":[1,0,0]}', space("geographic"), "spatial").ok, false);
  }),
  defineTest("view effects never edit domain coordinates and reject mixed batches", () => {
    const env: ConsoleEnvironment = { view: {} };
    const dag = space();
    const result = success('/view set {"patch":{"yaw":30}}', dag, "spatial", env);
    assert.equal(result.mutationCount, 0);
    assert.equal(result.runtimeEffects.length, 1);
    assert.deepEqual(serializeDag(result.dag), serializeDag(dag));
    for (const source of [
      '/view set {"patch":{"pitch":100}}',
      '/view set {"patch":{"projection":"map"}}',
      '/set A title changed\n/view set {"patch":{"yaw":30}}',
    ])
      assert.equal(run(source, dag, "spatial", env).ok, false);
  }),
  defineTest("layout tasks require a ready, compatible service and valid arguments", () => {
    const environment: ConsoleEnvironment = { layout: { ready: true, busy: false } };
    assert.equal(success('/layout run {"method":"dagre"}', base(), "node-link", environment).runtimeEffects.length, 1);
    assert.equal(run('/layout run {"prompt":"arrange"}', base(), "node-link", environment).ok, false);
    assert.equal(run("/layout resume", base(), "compound", environment).ok, false);
    assert.equal(run('/layout run {"method":"dagre"}', space(), "spatial", environment).ok, false);
    assert.equal(
      run('/layout run {"method":"dagre"}', base(), "node-link", { layout: { ready: false, busy: false } }).ok,
      false,
    );
  }),
  defineTest("schema style commands reject unsupported fields and expose supported values", () => {
    const result = success(
      '/style set {"path":"style.timeline.orientation","value":"horizontal"}',
      timeline(),
      "timeline",
    );
    assert.equal(result.style.timeline?.orientation, "horizontal");
    assert.equal(
      run('/style set {"path":"style.timeline.orientation","value":"horizontal"}', base(), "node-link").ok,
      false,
    );
    assert.match(
      JSON.stringify(
        success('/style inspect {"path":"style.timeline.orientation"}', timeline(), "timeline").queryResults,
      ),
      /orientation/,
    );
  }),
  defineTest("mixed document and style edit is a single atomic undo and redo", () => {
    const dag = timeline();
    const initial = {
      ...createInitialGraphState(),
      dag,
      chartType: "timeline" as const,
      selection: { type: "full" as const },
    };
    const result = success(
      '/timeline track {"ids":["A"],"track":"New"}\n/style set {"path":"style.timeline.orientation","value":"horizontal"}',
      dag,
      "timeline",
      { style: getDefaultChartStyle("timeline") },
    );
    const action = prepareConsoleTransaction(initial, result, "Mixed edit")!;
    const committed = graphReducer(initial, action);
    assert.equal(committed.editHistory.undoStack.length, 1);
    assert.equal(committed.dag?.nodes.A.track, "New");
    assert.equal(committed.timelineSettings.orientation, "horizontal");
    const undone = graphReducer(committed, { type: "undoRequested" });
    assert.equal(undone.dag, initial.dag);
    assert.deepEqual(undone.documentStyles, initial.documentStyles);
    assert.deepEqual(undone.timelineSettings, initial.timelineSettings);
    const redone = graphReducer(undone, { type: "redoRequested" });
    assert.equal(redone.dag?.nodes.A.track, "New");
    assert.equal(redone.documentStyles.timeline?.timeline?.orientation, "horizontal");
    assert.equal(
      graphReducer(committed, action).editHistory.undoStack.length,
      1,
      "stale preparation cannot commit twice",
    );
  }),
  defineTest("a continuous style adjustment remains one undo transaction", () => {
    const dag = base();
    const initial = { ...createInitialGraphState(), dag };
    const first = prepareConsoleTransaction(
      initial,
      success('/style set {"path":"style.appearance.nodes.height","value":120}', dag),
      "Adjust",
    )!;
    first.transaction.adjustmentId = "drag";
    const middle = graphReducer(initial, first);
    const second = prepareConsoleTransaction(
      middle,
      success('/style set {"path":"style.appearance.nodes.height","value":150}', dag, "node-link", {
        style: middle.documentStyles["node-link"],
      }),
      "Adjust",
    )!;
    second.transaction.adjustmentId = "drag";
    const final = graphReducer(middle, second);
    assert.equal(final.editHistory.undoStack.length, 1);
    assert.equal(final.documentStyles["node-link"]?.appearance.nodes.height, 150);
    assert.deepEqual(graphReducer(final, { type: "undoRequested" }).documentStyles, initial.documentStyles);
  }),
  defineTest("failed mixed batches preserve graph, style and context", () => {
    const dag = base();
    const result = run(
      '/use A\n/style set {"path":"style.appearance.display.showEdgeLabels","value":true}\n/rm Missing',
      dag,
    );
    assert.equal(result.ok, false);
    assert.equal(result.contextNodeKey, null);
    assert.deepEqual(serializeDag(dag), serializeDag(base()));
  }),
  defineTest("domain data and style survive serialization without persisting session geometry", () => {
    const result = success(
      '/timeline shift {"ids":["A"],"amount":1,"unit":"day"}\n/style set {"path":"style.timeline.orientation","value":"horizontal"}',
      timeline(),
      "timeline",
    );
    const reopened = normalizeDagInput(JSON.parse(JSON.stringify(serializeDag(result.dag))));
    assert.deepEqual(reopened.nodes.A.time, { at: "2026-10-28" });
    const style = parseChartStyleFile(JSON.parse(serializeChartStyle("timeline", result.style)), "timeline");
    assert.equal(style.timeline?.orientation, "horizontal");
    assert.equal((style as unknown as Record<string, unknown>).geometry, undefined);
  }),
  defineTest("request fingerprint changes with mode, scope and settings", () => {
    const baseline = { generation: 1, revision: 2, chart: "timeline", scope: ["A"], clock: "calendar" };
    assert.equal(executionFingerprint(baseline), executionFingerprint(structuredClone(baseline)));
    for (const patch of [
      { chart: "spatial" },
      { scope: ["B"] },
      { clock: "relative" },
      { generation: 2 },
      { revision: 3 },
    ])
      assert.notEqual(executionFingerprint(baseline), executionFingerprint({ ...baseline, ...patch }));
  }),
  defineTest("inspection policy rejects mutation, UI and layout side effects", () => {
    for (const source of [
      "/clear",
      "/use A",
      "/show A",
      '/flow set {"edge":"ab","value":5}',
      '/layout run {"method":"dagre"}',
    ]) {
      const parsed = parseConsoleSource(source);
      assert.ok(parsed.ok);
      assert.equal(parsed.instructions.every(isReadOnlyInstruction), false);
    }
    const validation = validateCommandBatch({
      batch: {
        id: "test",
        title: "Inspect",
        commands: ["/rm A"],
        status: "draft",
        riskLevel: "low",
        expectedGraphEffects: [],
        createdAt: 0,
      },
      dag: base(),
      contextNodeKey: null,
      graphRevision: "1",
      chartType: "node-link",
      readOnly: true,
    });
    assert.equal(validation.allPassed, false);
  }),
  defineTest("AI inspection loops return query results before the final edit proposal", async () => {
    let calls = 0;
    const response = await runInspectionLoop({
      context: context(),
      signal: new AbortController().signal,
      isCurrent: () => true,
      request: async (packet): Promise<AiResponse> => {
        calls++;
        if (calls === 1) return { kind: "inspect", answer: "Read flow", commands: ["/edge-data inspect"] };
        assert.match(JSON.stringify(packet.execution.inspectionResults), /"value":10/);
        return {
          kind: "run_console",
          answer: "Update flow",
          commandBatch: { commands: ['/edge-data set {"id":"ab","value":12}'] },
        };
      },
      inspect: async () => success("/edge-data inspect").queryResults,
    });
    assert.equal(calls, 2);
    assert.equal(response.kind, "run_console");
  }),
  defineTest("AI receives inspection errors and can correct arguments", async () => {
    let calls = 0;
    const response = await runInspectionLoop({
      context: context(),
      signal: new AbortController().signal,
      isCurrent: () => true,
      request: async (packet): Promise<AiResponse> => {
        calls++;
        if (calls < 3)
          return {
            kind: "inspect",
            answer: "Read",
            commands: [calls === 1 ? '/edge-data inspect {"id":"missing"}' : '/edge-data inspect {"id":"ab"}'],
          };
        assert.match(JSON.stringify(packet.execution.inspectionResults), /Unknown edge/);
        return { kind: "answer", answer: "The flow is 10." };
      },
      inspect: async (commands) => run(commands.join("\n")),
    });
    assert.equal(response.kind, "answer");
  }),
  defineTest("AI stops on repeated queries, changed context and cancellation", async () => {
    const request = async (): Promise<AiResponse> => ({ kind: "inspect", answer: "Read", commands: ["/graph"] });
    const options = {
      context: context(),
      signal: new AbortController().signal,
      isCurrent: () => true,
      request,
      inspect: async () => ({ ok: true }),
    };
    await assert.rejects(runInspectionLoop(options), /repeated/);
    await assert.rejects(runInspectionLoop({ ...options, isCurrent: () => false }), /changed/);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(runInspectionLoop({ ...options, signal: abort.signal }), /cancelled/);
    assert.equal(isAnalysisOnlyRequest("只分析，不要修改图"), true);
    assert.equal(isAnalysisOnlyRequest("Move A into group G"), false);
  }),
  defineTest("AI context contains domain facts and current mode commands", () => {
    for (const [dag, chart, field] of [
      [space(), "spatial", "coordinateSystem"],
      [timeline(), "timeline", "clock"],
      [base(), "sankey", "balance"],
    ] as const) {
      const packet = buildAiContextPacket({
        harness: createInitialAiHarnessState(),
        dag,
        chartType: chart,
        mode: "edit",
        layoutMode: "sugiyama",
        selection: null,
        contextNodeKey: null,
        consoleEntries: [],
      });
      assert.match(JSON.stringify(packet.graph.domain), new RegExp(field));
      assert.equal(packet.graph.capabilities?.chartType, chart);
    }
  }),
  defineTest("completion resolves node IDs and command catalog is shared", () => {
    assert.equal(getConsoleSuggestions("/use A", { dag: base(), chartType: "node-link" })[0].insertText, "/use A");
    assert.ok(
      getConsoleSuggestions("/flow", { dag: base(), chartType: "sankey" }).some((item) => item.label.includes("set")),
    );
    assert.equal(getConsoleSuggestions("/flow", { dag: base(), chartType: "node-link" }).length, 0);
  }),
  defineTest("persisted batches retain their execution snapshot", () => {
    const harness = createInitialAiHarnessState();
    harness.pendingCommandBatch = {
      id: "test",
      title: "Test",
      executionKey: "snapshot",
      commands: ["/rm A"],
      status: "draft",
      riskLevel: "high",
      expectedGraphEffects: [],
      createdAt: 0,
    };
    assert.equal(parsePersistedAiHarnessState(JSON.stringify(harness))?.pendingCommandBatch?.executionKey, "snapshot");
  }),
]);
