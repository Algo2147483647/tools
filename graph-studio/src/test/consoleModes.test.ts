import { axisRotation } from "../viewport/camera/quaternion";
import assert from "node:assert/strict";
import { defineSuite, defineTest } from "./harness";
import { createGraphDocument, normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import type { GraphChartType } from "../graph/types";
import { parseToolOperations, type ToolOperation } from "../ai/tools/catalog";
import { executeConsoleInstructions } from "../console/executor";
import type { ConsoleEnvironment } from "../console/runtime";
import { DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { serializeChartStyle, parseChartStyleFile } from "../schema/styleProtocol";
import { createInitialGraphState } from "../app/document/initialState";
import { graphReducer } from "../app/document/graphReducer";
import { prepareConsoleTransaction } from "../app/document/graphTransactions";
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
function run(
  operations: ToolOperation[],
  dag = base(),
  chart: GraphChartType = "node-link",
  environment: ConsoleEnvironment = {},
) {
  try {
    const instructions =
      operations.length === 1
        ? parseToolOperations(operations[0].tool, operations[0].arguments, { dag, chartType: chart })
        : parseToolOperations("edit_batch", { operations }, { dag, chartType: chart });
    return executeConsoleInstructions(dag, instructions, DEFAULT_GRAPH_APPEARANCE, chart, {
      referenceTime: Date.UTC(2026, 9, 27),
      ...environment,
    });
  } catch (error) {
    return { ok: false as const, message: String(error) };
  }
}
function success(
  operations: ToolOperation[],
  dag = base(),
  chart: GraphChartType = "node-link",
  environment: ConsoleEnvironment = {},
) {
  const result = run(operations, dag, chart, environment);
  assert.ok(result.ok, result.ok ? "" : result.message);
  return result;
}

export const consoleModesSuite = defineSuite("AI tool domains and transactions", [
  defineTest("group create and move change containment without changing ordinary edges", () => {
    const dag = base();
    const result = success(
      [
        { tool: "group_create", arguments: { id: "G", title: "Group", members: ["A", "B"] } },
        { tool: "group_move", arguments: { members: ["C"], parent: "G" } },
      ],
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
      [
        { tool: "group_create", arguments: { id: "G", title: "Group", members: ["A"] } },
        { tool: "group_move", arguments: { members: ["G"], parent: "A" } },
      ],
      dag,
      "compound",
    );
    assert.equal(result.ok, false);
    assert.equal(dag.nodes.G, undefined);
  }),
  defineTest("group deletion follows containment and keeps unrelated ordinary descendants", () => {
    const dag = success(
      [{ tool: "group_create", arguments: { id: "G", title: "Group", members: ["A"] } }],
      base(),
      "compound",
    ).dag;
    const deleted = success([{ tool: "group_delete", arguments: { id: "G" } }], dag, "compound");
    assert.deepEqual(Object.keys(deleted.dag.nodes).sort(), ["B", "C"]);
    const dissolved = success([{ tool: "group_dissolve", arguments: { id: "G" } }], dag, "compound");
    assert.ok(dissolved.dag.nodes.G);
    assert.ok(dissolved.dag.nodes.A);
    assert.deepEqual(dissolved.dag.edges, dag.edges);
    assert.equal(
      success([{ tool: "node_delete", arguments: { id: "A", recursive: true } }], dag, "compound").dag.nodes.C,
      undefined,
    );
  }),
  defineTest("timeline changes preserve interval duration and assign tracks", () => {
    const result = success(
      [
        { tool: "timeline_shift", arguments: { ids: ["A", "B"], amount: 3, unit: "day" } },
        { tool: "timeline_track", arguments: { ids: ["A"], track: "Delivery" } },
      ],
      timeline(),
      "timeline",
    );
    assert.deepEqual(result.dag.nodes.A.time, { at: "2026-10-30" });
    assert.deepEqual(result.dag.nodes.B.time, { start: "2026-10-29", end: "2026-11-02" });
    assert.equal(result.dag.nodes.A.track, "Delivery");
  }),
  defineTest("timeline rejects invalid dates, inverted intervals and wrong units", () => {
    for (const time of [{ at: "2026-02-30" }, { start: "2026-10-28", end: "2026-10-27" }, { at: 5 }]) {
      assert.equal(run([{ tool: "timeline_set", arguments: { id: "A", time } }], timeline(), "timeline").ok, false);
    }
    assert.equal(
      run([{ tool: "timeline_shift", arguments: { ids: ["A"], amount: 1, unit: "month" } }], timeline(), "timeline").ok,
      false,
    );
  }),
  defineTest("relative clocks require the declared unit and preserve numeric values", () => {
    const dag = normalizeDagInput({
      ...serializeDag(timeline()),
      metadata: { timeline: { clock: { mode: "relative", unit: "cycle" } } },
      nodes: { A: { time: { basis: "relative", at: 2 } } },
      edges: [],
    });
    assert.deepEqual(
      success([{ tool: "timeline_shift", arguments: { ids: ["A"], amount: 3, unit: "cycle" } }], dag, "timeline").dag
        .nodes.A.time,
      { basis: "relative", at: 5 },
    );
    assert.equal(
      run([{ tool: "timeline_shift", arguments: { ids: ["A"], amount: 3, unit: "day" } }], dag, "timeline").ok,
      false,
    );
  }),
  defineTest("ongoing events use a fixed operation reference time", () => {
    const source = [{ tool: "timeline_set", arguments: { id: "A", time: { start: "2026-10-28", end: null } } }];
    assert.equal(run(source, timeline(), "timeline", { referenceTime: Date.UTC(2026, 9, 27) }).ok, false);
    assert.equal(run(source, timeline(), "timeline", { referenceTime: Date.UTC(2026, 9, 29) }).ok, true);
  }),
  defineTest("timeline range inspection reports missing times and supports pagination", () => {
    const all = success([{ tool: "timeline_inspect", arguments: { limit: 1 } }], timeline(), "timeline")
      .queryResults[0];
    assert.equal(all.total, 3);
    assert.equal(all.nextOffset, 1);
    const range = success(
      [{ tool: "timeline_inspect", arguments: { start: "2026-10-29", end: "2026-10-31" } }],
      timeline(),
      "timeline",
    ).queryResults[0];
    assert.equal(range.total, 1);
    assert.match(JSON.stringify(range.data), /"id":"B"/);
  }),
  defineTest("flow weights and metadata produce concrete diffs and preserve IDs", () => {
    const result = success(
      [
        { tool: "flow_set", arguments: { edge: "ab", value: 140 } },
        { tool: "edge_data_set", arguments: { id: "ab", metadata: { feedback: true } } },
      ],
      base(),
      "sankey",
    );
    assert.equal(result.dag.edges[0].id, "ab");
    assert.equal(result.dag.edges[0].value, 140);
    assert.deepEqual(result.dag.edges[0].metadata, { feedback: true });
    assert.ok(result.diff.some((line) => line.includes("edges.ab.value: 10 → 140")));
    assert.ok(result.diff.some((line) => line.includes("edges.ab.metadata")));
    for (const source of [
      [{ tool: "flow_set", arguments: { edge: "ab", value: -1 } }],
      [{ tool: "flow_scale", arguments: { edges: ["ab"], factor: -1 } }],
      [{ tool: "edge_set", arguments: { source: "A", target: "B", value: "label" } }],
    ])
      assert.equal(run(source, base(), "sankey").ok, false);
  }),
  defineTest("Sankey cycles and imbalance remain valid diagnostics", () => {
    const dag = createGraphDocument(serializeDag(base()).nodes, [
      ...base().edges,
      { id: "ca", source: "C", target: "A", value: 4 },
    ]);
    const result = success([{ tool: "flow_inspect", arguments: {} }], dag, "sankey");
    assert.match(JSON.stringify(result.queryResults), /"feedback":true/);
    assert.equal(result.mutationCount, 0);
    assert.deepEqual(result.dag.edges, dag.edges);
  }),
  defineTest("coordinate changes respect dimensionality and coordinate system", () => {
    assert.deepEqual(
      success([{ tool: "space_translate", arguments: { ids: ["A", "B"], delta: [1, 0, -1] } }], space(), "spatial").dag
        .nodes.A.space,
      [2, 2, 2],
    );
    assert.equal(
      run([{ tool: "space_set", arguments: { id: "A", coordinates: [1, 2] } }], space(), "spatial").ok,
      false,
    );
    assert.equal(
      run([{ tool: "space_set", arguments: { id: "A", coordinates: [1, 95, 0] } }], space("geographic"), "spatial").ok,
      false,
    );
    assert.equal(
      run([{ tool: "space_translate", arguments: { ids: ["A"], delta: [1, 0, 0] } }], space("geographic"), "spatial")
        .ok,
      false,
    );
  }),
  defineTest("view effects never edit domain coordinates and reject mixed batches", () => {
    const env: ConsoleEnvironment = { view: {} };
    const dag = space();
    const result = success(
      [{ tool: "view_set", arguments: { patch: { orientation: axisRotation([0, 1, 0], 30) } } }],
      dag,
      "spatial",
      env,
    );
    assert.equal(result.mutationCount, 0);
    assert.equal(result.runtimeEffects.length, 1);
    assert.deepEqual(serializeDag(result.dag), serializeDag(dag));
    for (const source of [
      [{ tool: "view_set", arguments: { patch: { orientation: [0, 0, 0, 0] } } }],
      [{ tool: "view_set", arguments: { patch: { projection: "map" } } }],
      [
        { tool: "node_set", arguments: { id: "A", field: "title", value: "changed" } },
        { tool: "view_set", arguments: { patch: { orientation: axisRotation([0, 1, 0], 30) } } },
      ],
    ])
      assert.equal(run(source, dag, "spatial", env).ok, false);
  }),
  defineTest("layout tasks require a ready, compatible service and valid arguments", () => {
    const environment: ConsoleEnvironment = { layout: { ready: true, busy: false } };
    assert.equal(
      success([{ tool: "layout_run", arguments: { method: "dagre" } }], base(), "node-link", environment).runtimeEffects
        .length,
      1,
    );
    assert.equal(
      run([{ tool: "layout_run", arguments: { prompt: "arrange" } }], base(), "node-link", environment).ok,
      false,
    );
    assert.equal(run([{ tool: "layout_resume", arguments: {} }], base(), "compound", environment).ok, false);
    assert.equal(
      run([{ tool: "layout_run", arguments: { method: "dagre" } }], space(), "spatial", environment).ok,
      false,
    );
    assert.equal(
      run([{ tool: "layout_run", arguments: { method: "dagre" } }], base(), "node-link", {
        layout: { ready: false, busy: false },
      }).ok,
      false,
    );
  }),
  defineTest("schema style commands reject unsupported fields and expose supported values", () => {
    const result = success(
      [{ tool: "style_set", arguments: { path: "style.timeline.orientation", value: "horizontal" } }],
      timeline(),
      "timeline",
    );
    assert.equal(result.style.timeline?.orientation, "horizontal");
    assert.equal(
      run(
        [{ tool: "style_set", arguments: { path: "style.timeline.orientation", value: "horizontal" } }],
        base(),
        "node-link",
      ).ok,
      false,
    );
    assert.match(
      JSON.stringify(
        success([{ tool: "style_inspect", arguments: { path: "style.timeline.orientation" } }], timeline(), "timeline")
          .queryResults,
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
      [
        { tool: "timeline_track", arguments: { ids: ["A"], track: "New" } },
        { tool: "style_set", arguments: { path: "style.timeline.orientation", value: "horizontal" } },
      ],
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
      success([{ tool: "style_set", arguments: { path: "style.appearance.nodes.height", value: 120 } }], dag),
      "Adjust",
    )!;
    first.transaction.adjustmentId = "drag";
    const middle = graphReducer(initial, first);
    const second = prepareConsoleTransaction(
      middle,
      success(
        [{ tool: "style_set", arguments: { path: "style.appearance.nodes.height", value: 150 } }],
        dag,
        "node-link",
        {
          style: middle.documentStyles["node-link"],
        },
      ),
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
      [
        { tool: "style_set", arguments: { path: "style.appearance.display.showEdgeLabels", value: true } },
        { tool: "node_delete", arguments: { id: "Missing" } },
      ],
      dag,
    );
    assert.equal(result.ok, false);
    assert.deepEqual(serializeDag(dag), serializeDag(base()));
  }),
  defineTest("domain data and style survive serialization without persisting session geometry", () => {
    const result = success(
      [
        { tool: "timeline_shift", arguments: { ids: ["A"], amount: 1, unit: "day" } },
        { tool: "style_set", arguments: { path: "style.timeline.orientation", value: "horizontal" } },
      ],
      timeline(),
      "timeline",
    );
    const reopened = normalizeDagInput(JSON.parse(JSON.stringify(serializeDag(result.dag))));
    assert.deepEqual(reopened.nodes.A.time, { at: "2026-10-28" });
    const style = parseChartStyleFile(JSON.parse(serializeChartStyle("timeline", result.style)), "timeline");
    assert.equal(style.timeline?.orientation, "horizontal");
    assert.equal((style as unknown as Record<string, unknown>).geometry, undefined);
  }),
]);
