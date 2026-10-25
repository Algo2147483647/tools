import assert from "node:assert/strict";
import { parseAiResponse } from "../ai/protocol/responseParser";
import { parseCompoundLayoutCommand } from "../console/compoundLayout";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { defaultLayoutIntent, parseLayoutIntent, type LayoutIntent } from "../layout/compound/layout-plan";
import { migrateLegacyLayout } from "../schema/layoutMigration";
import { defaultLayoutSession, parseLayoutSession, repairLayoutSession } from "../schema/layoutSession";
import { prepareCommandTransaction } from "../app/document/graphTransactions";
import { prepareWorkspace } from "../workspace/opening";
import { buildCompoundStage } from "../layout/compound/layout";
import { getStageAppearance } from "../layout/shared/appearance";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { validateLayoutGeometry } from "../layout/compound/layout-quality";
import { solveCompoundLayout } from "../layout/compound/layout-solver";
import type { GraphAction } from "../app/document/graphActions";
import { graphReducer } from "../app/document/graphReducer";
import { createInitialGraphState } from "../app/document/initialState";
import { layoutFixture } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

function graph(nested = false) {
  return normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: {
      a: { title: "Start" },
      b: { title: "Process" },
      c: { title: "Finish" },
      ...(nested ? { g: { title: "Flow" }, outside: { title: "Outside" } } : {}),
    },
    edges: [
      { id: "ab", source: "a", target: "b", value: "request" },
      { id: "bc", source: "b", target: "c", value: "result" },
    ],
    ...(nested ? { hierarchy_edges: ["a", "b", "c"].map((id) => ({ id: `h-${id}`, source: "g", target: id })) } : {}),
  });
}
function downIntent(): LayoutIntent {
  return {
    ...defaultLayoutIntent(),
    constraints: [{ type: "direction", scopeId: null, value: "DOWN", strength: "soft" }],
  };
}

export const compoundLayoutPlanSuite = defineSuite("Compound layout planning", [
  defineTest("protocol rejects snapshots, coordinates, pins and route-only requests", () => {
    const base = defaultLayoutSession();
    for (const field of ["accepted", "snapshot", "geometry", "pins", "boxes", "routes", "x", "width"]) {
      assert.throws(
        () => parseLayoutSession({ ...base, charts: { compound: { ...base.charts.compound, [field]: {} } } }),
        /Unknown/,
      );
    }
    assert.throws(() => parseLayoutIntent({ ...downIntent(), operation: "route-only" }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), constraints: [{ type: "pin", nodeId: "a" }] }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), objective: "stability" }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), code: "run()" }));
    assert.throws(() =>
      parseLayoutIntent({ ...downIntent(), constraints: Array(101).fill(downIntent().constraints[0]) }),
    );
  }),
  defineTest("generic AI rejects layout operations while explicit console intents remain typed", () => {
    const intent = downIntent();
    assert.throws(() =>
      parseAiResponse(JSON.stringify({ kind: "propose_layout", layoutProtocolVersion: 1, answer: "Arrange", intent })),
    );
    assert.deepEqual(parseCompoundLayoutCommand(`/compound-layout propose ${JSON.stringify(intent)}`), {
      type: "propose",
      intent,
    });
    for (const command of ["apply one", "compare one"])
      assert.throws(() => parseCompoundLayoutCommand(`/compound-layout ${command}`));
  }),
  defineTest("automatic first render selects valid deterministic geometry and reports its quality", async () => {
    const dag = graph(true),
      original = serializeDag(dag);
    const config = defaultLayoutSession().charts.compound;
    config.direction = "DOWN";
    const input = {
      dag,
      view: { focusGroupId: null, collapsedGroupIds: [] },
      layout: config,
      appearance: getStageAppearance(getDefaultChartStyle("compound").appearance, "compound"),
      showNodeDetail: false,
      alignNodeWidthsToMax: true,
    };
    const first = await buildCompoundStage(input),
      second = await buildCompoundStage(input);
    assert.deepEqual(first.nodes, second.nodes);
    assert.deepEqual(first.edges, second.edges);
    assert.equal(first.layoutQuality!.validation.valid, true);
    assert.ok(first.nodeMap.a.y < first.nodeMap.b.y);
    assert.ok(first.nodeMap.b.y < first.nodeMap.c.y);
    assert.deepEqual(serializeDag(dag), original);
    assert.equal(validateLayoutGeometry(first.compoundLayout!, first.compoundLayout!.baseline).valid, true);
  }),
  defineTest("graph layout is a path association; embedded legacy geometry requires migration", () => {
    const raw = serializeDag(graph());
    raw.metadata = { author: "User", layout: "layouts/flow.layout.json" };
    assert.deepEqual(serializeDag(normalizeDagInput(raw)).metadata, raw.metadata);
    raw.metadata.layout = { compound: { accepted: { snapshot: { boxes: { a: { x: 9999 } } } } } };
    assert.throws(() => normalizeDagInput(raw), /Migrate embedded layout/);
  }),
  defineTest("explicit migration preserves graph content and declarations but discards geometry", () => {
    const original = serializeDag(graph());
    original.metadata = {
      author: "User",
      layout: {
        compound: {
          constraints: [downIntent().constraints[0], { type: "pin", nodeId: "a" }],
          accepted: { snapshot: { boxes: { a: { x: 999 } } } },
          pins: [{ nodeId: "a" }],
        },
      },
    };
    const before = JSON.stringify(original);
    const result = migrateLegacyLayout(original, "flow.layout.json");
    assert.equal(result.graph.metadata!.layout, "flow.layout.json");
    assert.deepEqual(result.graph.nodes, original.nodes);
    assert.equal(result.layout.format, "graph-studio-layout-settings");
    assert.ok(!("constraints" in result.layout.settings));
    assert.ok(!/snapshot|accepted|boxes|pins/.test(JSON.stringify(result.layout)));
    assert.equal(JSON.stringify(original), before);
  }),
  defineTest("layout edits undo without dirtying graph and stale imports cannot replace another document", () => {
    let state = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: "a",
      dag: graph(true),
      fileName: "a.json",
      selection: { type: "full" },
      status: "Loaded",
    });
    const original = state.dag;
    const data = defaultLayoutSession();
    data.charts.compound.direction = "DOWN";
    const action: GraphAction = { type: "layoutSessionChanged", generation: state.document.generation, data };
    state = graphReducer(state, action);
    assert.equal(state.dag, original);
    assert.equal(state.source.dirty, false);
    assert.equal(state.layoutSession.data.charts.compound.direction, "DOWN");
    state = graphReducer(state, { type: "undoRequested" });
    assert.equal(state.layoutSession.data.charts.compound.direction, "AUTO");
    state = graphReducer(state, { type: "redoRequested" });
    assert.equal(state.layoutSession.data.charts.compound.direction, "DOWN");
    assert.equal(graphReducer(state, { ...action, generation: state.document.generation - 1 }), state);
  }),
  defineTest("graph renames and deletion repair layout references in the same undo transaction", () => {
    const data = defaultLayoutSession();
    data.charts.compound.constraints = [{ type: "direction", scopeId: "g", value: "DOWN", strength: "soft" }];
    let state = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: "g",
      dag: graph(true),
      fileName: "g.json",
      linkedLayout: data,
      selection: { type: "full" },
      status: "Loaded",
    });
    const action = prepareCommandTransaction(
      state,
      [{ type: "renameNode", oldKey: "g", newKey: "renamed" }],
      "Rename group",
    )!;
    state = graphReducer(state, action);
    assert.equal((state.layoutSession.data.charts.compound.constraints[0] as { scopeId: string }).scopeId, "renamed");
    state = graphReducer(state, { type: "undoRequested" });
    assert.deepEqual(state.layoutSession.data, data);
    const removed = serializeDag(graph());
    assert.deepEqual(repairLayoutSession(data, removed).charts.compound.constraints, []);
  }),
  defineTest("workspace loads only metadata.layout; missing or invalid associations use defaults", async () => {
    const data = defaultLayoutSession();
    data.charts.compound.direction = "DOWN";
    const raw = serializeDag(graph());
    const contents: Record<string, unknown> = { "graph.json": raw, "graph.layout.json": data };
    const open = () =>
      prepareWorkspace({
        name: "Test",
        handle: null,
        files: new Map(
          Object.entries(contents).map(([path, value]) => [
            path,
            { path, handle: null, file: new File([JSON.stringify(value)], path) },
          ]),
        ),
      });
    let loaded = await open();
    assert.equal(loaded.linkedLayout, undefined, "An unreferenced neighboring layout is ignored.");
    raw.metadata = { layout: "graph.layout.json" };
    loaded = await open();
    assert.equal(loaded.linkedLayout!.charts.compound.direction, "DOWN");
    assert.equal(loaded.workspace.graphs.length, 1);
    raw.metadata.layout = "layouts/custom.layout.json";
    contents["layouts/custom.layout.json"] = { ...data, charts: { compound: { direction: "RIGHT" } } };
    loaded = await open();
    assert.equal(loaded.linkedLayout!.charts.compound.direction, "RIGHT");
    contents["layouts/custom.layout.json"] = { ...data, version: 99 };
    loaded = await open();
    assert.equal(loaded.linkedLayout, undefined);
    assert.match(loaded.layoutNotice!, /default/i);
    for (const reference of ["missing.json", "../../outside.json", "https://example.com/layout.json"]) {
      raw.metadata.layout = reference;
      loaded = await open();
      assert.equal(loaded.linkedLayout, undefined);
      assert.match(loaded.layoutNotice!, /default/i);
    }
  }),
  defineTest("folded connections report incompatible original edge port preferences", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { g: {}, a: {}, b: {}, target: {} },
      hierarchy_edges: [
        { id: "ha", source: "g", target: "a" },
        { id: "hb", source: "g", target: "b" },
      ],
      edges: [
        { id: "at", source: "a", target: "target" },
        { id: "bt", source: "b", target: "target" },
      ],
    });
    const problem = (await layoutFixture(dag, { focusGroupId: null, collapsedGroupIds: ["g"] })).compoundLayout!;
    const intent: LayoutIntent = {
      ...defaultLayoutIntent(),
      constraints: [
        { type: "port-side", edgeId: "at", end: "source", side: "east", strength: "soft" },
        { type: "port-side", edgeId: "bt", end: "source", side: "west", strength: "soft" },
      ],
    };
    const solved = solveCompoundLayout(problem, intent);
    assert.ok(solved.candidates.length, solved.diagnostics.join("\n"));
    assert.ok(solved.candidates.every((c) => c.unmetPreferences.some((w) => w.includes("conflicting source"))));
  }),
]);
