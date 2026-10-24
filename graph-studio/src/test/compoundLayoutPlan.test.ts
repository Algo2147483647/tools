import assert from "node:assert/strict";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { applyGraphCommand } from "../graph/commands";
import { analyzeGraphImport } from "../graph/importMerge";
import { parseAiResponse } from "../ai/responseParser";
import { parseCompoundLayoutCommand } from "../console/compoundLayout";
import {
  defaultLayoutIntent,
  parseLayoutIntent,
  parseLayoutSnapshot,
  readLayoutData,
  writeLayoutData,
  type LayoutIntent,
} from "../layout/compound-layout-plan";
import { solveCompoundLayout, validateLayoutConstraints } from "../layout/compound-layout-solver";
import { validateLayoutGeometry } from "../layout/compound-layout-quality";
import { applyLayoutSnapshot } from "../layout/compound-layout-stage";
import { graphReducer } from "../state/graphReducer";
import { createInitialGraphState } from "../state/initialState";
import type { GraphAction } from "../state/graphActions";
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
  defineTest("validates intent, rejects executable extras, unknown constraints and supplied pin coordinates", () => {
    assert.deepEqual(parseLayoutIntent(downIntent()), downIntent());
    assert.throws(() => parseLayoutIntent({ ...downIntent(), code: "alert(1)" }), /Unknown/);
    assert.throws(
      () =>
        parseLayoutIntent({
          ...downIntent(),
          constraints: [{ type: "pin", nodeId: "a", space: "canvas", strength: "hard", x: 10 }],
        }),
      /Unknown/,
    );
    assert.throws(() => parseLayoutIntent({ ...downIntent(), constraints: [{ type: "teleport" }] }), /Unsupported/);
    assert.throws(
      () => parseLayoutIntent({ ...downIntent(), constraints: Array(101).fill(downIntent().constraints[0]) }),
      /at most/,
    );
    assert.throws(() => parseLayoutSnapshot({ boxes: {}, routes: {}, width: NaN, height: 1 }), /coordinate/);
  }),
  defineTest("AI and console use the same typed layout intent", () => {
    const intent = downIntent();
    const response = parseAiResponse(
      JSON.stringify({
        kind: "propose_layout",
        layoutProtocolVersion: 1,
        answer: "Arrange the flow vertically.",
        intent,
      }),
    );
    assert.equal(response.kind, "propose_layout");
    if (response.kind === "propose_layout") assert.deepEqual(response.intent, intent);
    assert.deepEqual(parseCompoundLayoutCommand(`/compound-layout propose ${JSON.stringify(intent)}`), {
      type: "propose",
      intent,
    });
    assert.throws(
      () =>
        parseAiResponse(
          JSON.stringify({ kind: "propose_layout", layoutProtocolVersion: 9, answer: "Invalid", intent }),
        ),
      /version/,
    );
    assert.throws(() => parseCompoundLayoutCommand("/compound-layout apply one\n/rm a"), /separately/);
  }),
  defineTest("generates deterministic vertical layouts without changing business edges", async () => {
    const dag = graph(),
      source = JSON.stringify(serializeDag(dag));
    const stage = await layoutFixture(dag),
      problem = stage.compoundLayout!;
    const first = solveCompoundLayout(problem, downIntent()),
      second = solveCompoundLayout(problem, downIntent());
    assert.ok(first.candidates.length, first.diagnostics.join("\n"));
    assert.deepEqual(first, second);
    const candidate = first.candidates[0];
    assert.ok(candidate.snapshot.boxes.a.y < candidate.snapshot.boxes.b.y);
    assert.ok(candidate.snapshot.boxes.b.y < candidate.snapshot.boxes.c.y);
    assert.ok(validateLayoutGeometry(problem, candidate.snapshot).valid);
    assert.equal(JSON.stringify(serializeDag(dag)), source);
    const preview = applyLayoutSnapshot(stage, candidate.snapshot);
    assert.equal(preview.nodeMap.a.x, candidate.snapshot.boxes.a.x + candidate.snapshot.boxes.a.width / 2);
    assert.notEqual(preview, stage);
  }),
  defineTest("pins capture current geometry and constrain later placement", async () => {
    const problem = (await layoutFixture(graph())).compoundLayout!;
    const intent = downIntent();
    intent.constraints.push({ type: "pin", nodeId: "a", space: "canvas", strength: "hard" });
    const solved = solveCompoundLayout(problem, intent);
    assert.ok(solved.candidates.length, solved.diagnostics.join("\n"));
    const candidate = solved.candidates[0];
    assert.deepEqual(candidate.snapshot.boxes.a, problem.baseline.boxes.a);
    assert.equal(candidate.data.pins[0].x, problem.baseline.boxes.a.x);
    const broken = structuredClone(candidate.snapshot);
    broken.boxes.a.x += 1;
    assert.ok(
      validateLayoutConstraints(problem, broken, candidate.data, intent).some((error) => error.includes("Pinned node")),
    );
  }),
  defineTest("route-only requests preserve every rectangle and route requested edges outside", async () => {
    const problem = (await layoutFixture(graph())).compoundLayout!;
    const intent: LayoutIntent = {
      ...defaultLayoutIntent(),
      operation: "route-only",
      constraints: [{ type: "prefer-outer-route", edgeId: "ab", strength: "soft" }],
    };
    const solved = solveCompoundLayout(problem, intent);
    assert.ok(solved.candidates.length, solved.diagnostics.join("\n"));
    for (const candidate of solved.candidates) {
      assert.deepEqual(candidate.snapshot.boxes, problem.baseline.boxes);
      assert.equal(candidate.metrics.movedNodes, 0);
      const edge = problem.projection.edges.find((e) => e.originalEdgeIds.includes("ab"))!;
      assert.ok(candidate.snapshot.routes[edge.id].points.some((p) => p.y > problem.baseline.height));
    }
  }),
  defineTest("strict scopes preserve their frame and unrelated nodes", async () => {
    const problem = (await layoutFixture(graph(true))).compoundLayout!;
    const intent: LayoutIntent = {
      ...defaultLayoutIntent("g"),
      operation: "route-only",
      constraints: [{ type: "pin", nodeId: "a", space: "parent", strength: "hard" }],
    };
    const result = solveCompoundLayout(problem, intent);
    assert.ok(result.candidates.length, result.diagnostics.join("\n"));
    assert.deepEqual(result.candidates[0].snapshot.boxes.g, problem.baseline.boxes.g);
    assert.deepEqual(result.candidates[0].snapshot.boxes.outside, problem.baseline.boxes.outside);
    const tooTall = {
      ...downIntent(),
      scope: { groupId: "g", includeDescendants: true },
      constraints: [{ type: "direction" as const, scopeId: "g", value: "DOWN" as const, strength: "soft" as const }],
    };
    const impossible = solveCompoundLayout(problem, tooTall);
    assert.ok(impossible.candidates.length || impossible.diagnostics.length);
    for (const candidate of impossible.candidates)
      assert.deepEqual(candidate.snapshot.boxes.g, problem.baseline.boxes.g);
    const conflicting = structuredClone(problem);
    conflicting.stored.pins = ["a", "b"].map((nodeId) => ({
      nodeId,
      parentId: "g",
      space: "canvas" as const,
      x: problem.baseline.boxes.a.x,
      y: problem.baseline.boxes.a.y,
    }));
    const blocked = solveCompoundLayout(conflicting, tooTall);
    assert.equal(blocked.candidates.length, 0);
    assert.ok(blocked.diagnostics.some((d) => d.includes("Locked rectangles")));
    assert.throws(
      () =>
        solveCompoundLayout(problem, {
          ...intent,
          constraints: [{ type: "pin", nodeId: "outside", space: "canvas", strength: "hard" }],
        }),
      /outside/,
    );
  }),
  defineTest("geometry validation rejects collisions, missing routes and diagonal routes", async () => {
    const problem = (await layoutFixture(graph())).compoundLayout!;
    assert.ok(validateLayoutGeometry(problem, problem.baseline).valid);
    const overlap = structuredClone(problem.baseline);
    overlap.boxes.b = { ...overlap.boxes.a };
    assert.ok(validateLayoutGeometry(problem, overlap).errors.some((e) => e.includes("Sibling overlap")));
    const missing = structuredClone(problem.baseline);
    delete missing.routes[problem.projection.edges[0].id];
    assert.ok(!validateLayoutGeometry(problem, missing).valid);
    const diagonal = structuredClone(problem.baseline);
    diagonal.routes[problem.projection.edges[0].id].points[1].y += 7;
    assert.ok(!validateLayoutGeometry(problem, diagonal).valid);
    const resized = structuredClone(problem.baseline);
    resized.boxes.a.width = 1;
    assert.ok(validateLayoutGeometry(problem, resized).errors.some((e) => e.includes("measured content")));
  }),
  defineTest("acceptance is one undoable transaction and stale revisions cannot apply", async () => {
    const dag = graph(),
      problem = (await layoutFixture(dag)).compoundLayout!,
      intent = downIntent();
    const candidate = solveCompoundLayout(problem, intent).candidates[0];
    assert.ok(candidate);
    let state = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: "layout-test",
      dag,
      fileName: "layout.json",
      selection: { type: "full" },
      status: "Loaded",
    });
    state = graphReducer(state, { type: "chartTypeChanged", chartType: "compound" });
    const action: GraphAction = {
      type: "compoundLayoutCommitted",
      generation: state.document.generation,
      revision: state.editHistory.revision,
      beforeDag: dag,
      historyBase: state.editHistory,
      problem,
      intent,
      candidate,
    };
    const applied = graphReducer(state, action);
    assert.equal(applied.editHistory.undoStack.length, 1);
    assert.equal(applied.source.dirty, true);
    assert.deepEqual(applied.dag!.edges, dag.edges);
    const undone = graphReducer(applied, { type: "undoRequested" });
    assert.deepEqual(serializeDag(undone.dag!), serializeDag(dag));
    assert.equal(
      graphReducer(undone, action).dag,
      undone.dag,
      "Undo must not revive old candidates even when the graph reference and revision match.",
    );
    const redone = graphReducer(undone, { type: "redoRequested" });
    assert.deepEqual(readLayoutData(redone.dag!).data, candidate.data);
    const stale = graphReducer(applied, action);
    assert.equal(stale.dag, applied.dag);
    assert.match(stale.ui.status, /stale/);
    const anotherDocument = graphReducer(state, { ...action, generation: state.document.generation + 1 });
    assert.equal(anotherDocument.dag, dag);
    const broken = structuredClone(candidate);
    delete broken.snapshot.boxes.a;
    assert.equal(
      graphReducer(state, { ...action, candidate: broken }).dag,
      dag,
      "Corrupt candidates must be rejected without throwing.",
    );
  }),
  defineTest("accepted geometry survives JSON round trips and uses measured-size fingerprints", async () => {
    const dag = graph(),
      stage = await layoutFixture(dag),
      problem = stage.compoundLayout!;
    const candidate = solveCompoundLayout(problem, downIntent()).candidates[0];
    assert.ok(candidate);
    const document = serializeDag(dag);
    writeLayoutData(document, candidate.data);
    const restored = normalizeDagInput(JSON.parse(JSON.stringify(document)));
    const reopened = await layoutFixture(restored);
    assert.deepEqual(reopened.compoundLayout!.baseline, candidate.snapshot);
    const changed = applyGraphCommand(restored, {
      type: "updateNodeFields",
      key: "a",
      fields: { title: "A changed title" },
    }).dag;
    assert.equal(readLayoutData(changed).data.accepted, undefined);
  }),
  defineTest("renames and deletions repair durable constraints and preserve unknown metadata", async () => {
    const dag = graph(true),
      problem = (await layoutFixture(dag)).compoundLayout!;
    const intent: LayoutIntent = {
      ...defaultLayoutIntent("g"),
      operation: "route-only",
      constraints: [
        { type: "pin", nodeId: "a", space: "parent", strength: "hard" },
        { type: "prefer-outer-route", edgeId: "ab", strength: "soft" },
      ],
    };
    const candidate = solveCompoundLayout(problem, intent).candidates[0];
    assert.ok(candidate);
    const doc = serializeDag(dag);
    writeLayoutData(doc, candidate.data);
    const renamed = applyGraphCommand(normalizeDagInput(doc), {
      type: "renameNode",
      oldKey: "a",
      newKey: "renamed",
    }).dag;
    assert.equal(readLayoutData(renamed).data.pins[0].nodeId, "renamed");
    assert.equal(readLayoutData(renamed).data.accepted, undefined);
    const moved = applyGraphCommand(renamed, { type: "groupMove", memberIds: ["renamed"], parentId: null }).dag;
    assert.equal(readLayoutData(moved).data.pins.length, 0);
    const deleted = applyGraphCommand(renamed, { type: "deleteNode", key: "renamed" }).dag;
    assert.equal(readLayoutData(deleted).data.pins.length, 0);
    assert.equal(readLayoutData(deleted).data.constraints.length, 0);
    const future = normalizeDagInput({
      ...serializeDag(dag),
      metadata: { layout: { compound: { version: 42, future: true } } },
    });
    assert.match(readLayoutData(future).warning!, /Unsupported/);
    const editedFuture = applyGraphCommand(future, { type: "renameNode", oldKey: "a", newKey: "future-a" }).dag;
    assert.deepEqual(editedFuture.metadata, future.metadata);
  }),
  defineTest("folded groups cannot be silently expanded by the solver", async () => {
    const problem = (await layoutFixture(graph(true), { focusGroupId: null, collapsedGroupIds: ["g"] }))
      .compoundLayout!;
    assert.throws(() => solveCompoundLayout(problem, defaultLayoutIntent("g")), /expanded/);
    assert.throws(
      () =>
        solveCompoundLayout(problem, {
          ...defaultLayoutIntent(),
          constraints: [{ type: "pin", nodeId: "a", space: "canvas", strength: "hard" }],
        }),
      /outside/,
    );
  }),
  defineTest("import conflict renames map pins and invalidate accepted snapshots", async () => {
    const incoming = graph(),
      problem = (await layoutFixture(incoming)).compoundLayout!;
    const intent: LayoutIntent = {
      ...defaultLayoutIntent(),
      operation: "route-only",
      constraints: [{ type: "pin", nodeId: "a", space: "parent", strength: "hard" }],
    };
    const candidate = solveCompoundLayout(problem, intent).candidates[0];
    assert.ok(candidate);
    const incomingDocument = serializeDag(incoming);
    writeLayoutData(incomingDocument, candidate.data);
    const base = { format: "graph-studio", version: 3, nodes: { a: { title: "Existing node" } }, edges: [] };
    const documents = [
      { name: "base.json", payload: base },
      { name: "incoming.json", payload: incomingDocument },
    ];
    const analysis = analyzeGraphImport(documents);
    const conflict = analysis.conflicts.find((c) => c.path === "/nodes/a")!;
    assert.ok(conflict);
    const merged = analyzeGraphImport(documents, { [conflict.id]: { strategy: "rename", name: "imported-a" } });
    assert.equal(merged.unresolved.length, 0);
    assert.equal(readLayoutData(merged.dag).data.pins[0].nodeId, "imported-a");
    assert.equal(readLayoutData(merged.dag).data.accepted, undefined);
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
      operation: "route-only",
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
