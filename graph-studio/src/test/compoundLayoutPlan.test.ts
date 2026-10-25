import assert from "node:assert/strict";
import { parseAiResponse } from "../ai/protocol/responseParser";
import { parseCompoundLayoutCommand } from "../console/compoundLayout";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { defaultLayoutIntent, parseLayoutIntent, type LayoutIntent } from "../layout/compound/layout-plan";
import { defaultLayoutDocument, parseLayoutDocument, repairLayoutDocument } from "../schema/layoutProtocol";
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
    const base = defaultLayoutDocument();
    for (const field of ["accepted", "snapshot", "geometry", "pins", "boxes", "routes", "x", "width"]) {
      assert.throws(() => parseLayoutDocument({ ...base, charts: { compound: { ...base.charts.compound, [field]: {} } } }), /Unknown/);
    }
    assert.throws(() => parseLayoutIntent({ ...downIntent(), operation: "route-only" }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), constraints: [{ type: "pin", nodeId: "a" }] }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), objective: "stability" }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), code: "run()" }));
    assert.throws(() => parseLayoutIntent({ ...downIntent(), constraints: Array(101).fill(downIntent().constraints[0]) }));
  }),
  defineTest("AI and console share declarative intent and no longer accept review commands", () => {
    const intent = downIntent();
    const response = parseAiResponse(JSON.stringify({ kind: "propose_layout", layoutProtocolVersion: 1, answer: "Arrange", intent }));
    assert.equal(response.kind, "propose_layout");
    assert.deepEqual(parseCompoundLayoutCommand(`/compound-layout propose ${JSON.stringify(intent)}`), { type: "propose", intent });
    for (const command of ["apply one", "compare one"]) assert.throws(() => parseCompoundLayoutCommand(`/compound-layout ${command}`));
  }),
  defineTest("automatic first render selects valid deterministic geometry and reports its quality", async () => {
    const dag = graph(true), original = serializeDag(dag);
    const config = defaultLayoutDocument().charts.compound;
    config.direction = "DOWN";
    const input = { dag, view: { focusGroupId: null, collapsedGroupIds: [] }, layout: config,
      appearance: getStageAppearance(getDefaultChartStyle("compound").appearance, "compound"), showNodeDetail: false, alignNodeWidthsToMax: true };
    const first = await buildCompoundStage(input), second = await buildCompoundStage(input);
    assert.deepEqual(first.nodes, second.nodes);
    assert.deepEqual(first.edges, second.edges);
    assert.equal(first.layoutQuality!.validation.valid, true);
    assert.ok(first.nodeMap.a.y < first.nodeMap.b.y);
    assert.ok(first.nodeMap.b.y < first.nodeMap.c.y);
    assert.deepEqual(serializeDag(dag), original);
    assert.equal(validateLayoutGeometry(first.compoundLayout!, first.compoundLayout!.baseline).valid, true);
  }),
  defineTest("legacy geometry is discarded at graph load and cannot return through save", () => {
    const raw = serializeDag(graph());
    raw.metadata = { author: "User", layout: { compound: { accepted: { snapshot: { boxes: { a: { x: 9999 } } } } } } };
    const dag = normalizeDagInput(raw);
    assert.deepEqual(dag.metadata, { author: "User" });
    assert.deepEqual(serializeDag(dag).metadata, { author: "User" });
    assert.ok(raw.metadata.layout, "Loading must not mutate the source object.");
  }),
  defineTest("layout edits undo without dirtying graph and stale imports cannot replace another document", () => {
    let state = graphReducer(createInitialGraphState(), { type: "graphLoaded", documentId: "a", dag: graph(true), fileName: "a.json", selection: { type: "full" }, status: "Loaded" });
    const original = state.dag;
    const data = defaultLayoutDocument(); data.charts.compound.direction = "DOWN";
    const action: GraphAction = { type: "layoutDocumentChanged", generation: state.document.generation, data };
    state = graphReducer(state, action);
    assert.equal(state.dag, original); assert.equal(state.source.dirty, false);
    assert.equal(state.layoutDocument.data.charts.compound.direction, "DOWN");
    state = graphReducer(state, { type: "undoRequested" });
    assert.equal(state.layoutDocument.data.charts.compound.direction, "AUTO");
    state = graphReducer(state, { type: "redoRequested" });
    assert.equal(state.layoutDocument.data.charts.compound.direction, "DOWN");
    assert.equal(graphReducer(state, { ...action, generation: state.document.generation - 1 }), state);
  }),
  defineTest("graph renames and deletion repair layout references in the same undo transaction", () => {
    const data = defaultLayoutDocument(); data.charts.compound.constraints = [{ type: "direction", scopeId: "g", value: "DOWN", strength: "soft" }];
    let state = graphReducer(createInitialGraphState(), { type: "graphLoaded", documentId: "g", dag: graph(true), fileName: "g.json", linkedLayout: data, selection: { type: "full" }, status: "Loaded" });
    const action = prepareCommandTransaction(state, [{ type: "renameNode", oldKey: "g", newKey: "renamed" }], "Rename group")!;
    state = graphReducer(state, action);
    assert.equal((state.layoutDocument.data.charts.compound.constraints[0] as { scopeId: string }).scopeId, "renamed");
    state = graphReducer(state, { type: "undoRequested" });
    assert.deepEqual(state.layoutDocument.data, data);
    const removed = serializeDag(graph());
    assert.deepEqual(repairLayoutDocument(data, removed).charts.compound.constraints, []);
  }),
  defineTest("workspace loads a sidecar, respects explicit binding and falls back on invalid data", async () => {
    const data = defaultLayoutDocument(); data.charts.compound.direction = "DOWN";
    const contents: Record<string, unknown> = { "graph.json": serializeDag(graph()), "graph.layout.json": data };
    const open = () => prepareWorkspace({ name: "Test", handle: null, files: new Map(Object.entries(contents).map(([path, value]) => [path, { path, handle: null, file: new File([JSON.stringify(value)], path) }])) });
    let loaded = await open();
    assert.equal(loaded.linkedLayout!.charts.compound.direction, "DOWN");
    assert.equal(loaded.workspace.graphs.length, 1);
    contents["custom.json"] = { ...data, charts: { compound: { direction: "RIGHT" } } };
    contents["graph-studio.workspace.json"] = { format: "graph-studio-workspace", version: 1, graphs: ["graph.json"], layouts: { "graph.json": "custom.json" } };
    loaded = await open(); assert.equal(loaded.linkedLayout!.charts.compound.direction, "RIGHT");
    contents["custom.json"] = { ...data, version: 99 };
    loaded = await open(); assert.equal(loaded.linkedLayout, undefined); assert.match(loaded.layoutNotice!, /default/i);
    delete contents["graph-studio.workspace.json"]; delete contents["graph.layout.json"]; delete contents["custom.json"];
    loaded = await open(); assert.equal(loaded.linkedLayout, undefined);
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
