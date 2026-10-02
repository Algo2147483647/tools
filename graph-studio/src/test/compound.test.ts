import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ELK from "elkjs/lib/elk.bundled.js";
import { applyGraphCommand } from "../graph/commands";
import { projectCompoundGraph } from "../graph/compoundProjection";
import { indexHierarchy } from "../graph/hierarchy";
import { analyzeGraphImport } from "../graph/importMerge";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { projectGraphByType } from "../graph/typeFilter";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getStageAppearance } from "../layout/appearance";
import { buildCompoundStage } from "../layout/compound-layout";
import { buildStageData } from "../layout/stage-layout";
import { graphReducer } from "../state/graphReducer";
import { prepareGraphTransaction } from "../state/graphTransactions";
import { createInitialGraphState } from "../state/initialState";
import { defineSuite, defineTest } from "./harness";

export const compoundFixture = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: {
      a: { title: "A", type: "service" },
      d: { title: "D", type: "service" },
      x: { title: "X", type: "external" },
      isolated: {},
    },
    edges: [
      { id: "ad", source: "a", target: "d", value: "request" },
      { id: "ax", source: "a", target: "x", value: "request" },
      { id: "dx", source: "d", target: "x", value: "request" },
      { id: "xa", source: "x", target: "a", value: "response" },
    ],
    hierarchy: {
      id: "H",
      groups: { b: { title: "B" }, c: { title: "C" } },
      parentById: { a: "b", b: "c", d: "c", isolated: "c" },
    },
  });
const view = (collapsedGroupIds: string[] = [], focusGroupId: string | null = null) => ({
  collapsedGroupIds,
  focusGroupId,
});
const layout = (dag = compoundFixture(), currentView = view()) =>
  buildCompoundStage(
    {
      dag,
      view: currentView,
      appearance: getStageAppearance(DEFAULT_GRAPH_APPEARANCE),
      showNodeDetail: true,
      alignNodeWidthsToMax: false,
    },
    new ELK(),
  );

export const compoundSuite = defineSuite("Compound hierarchy, projection and layout", [
  defineTest("v3 preserves independent G and H and rejects v2", () => {
    const doc = compoundFixture();
    assert.deepEqual(normalizeDagInput(serializeDag(doc)), doc);
    assert.throws(() => normalizeDagInput({ ...serializeDag(doc), version: 2 }), /version 3/);
    assert.deepEqual(Object.keys(doc.nodes.a.parents as object), ["x"]);
    assert.equal(doc.hierarchy!.parentById.a, "b");
  }),
  defineTest("invalid references, cycles, empty groups and node/group collisions are rejected", () => {
    for (const hierarchy of [
      { id: "H", groups: { b: { title: "B" } }, parentById: { missing: "b" } },
      { id: "H", groups: { b: { title: "B" }, c: { title: "C" } }, parentById: { b: "c", c: "b", a: "b" } },
      { id: "H", groups: { b: { title: "B" } }, parentById: {} },
      { id: "H", groups: { a: { title: "A" } }, parentById: { d: "a" } },
      { id: "H", groups: {}, parentById: { a: "d" } },
    ])
      assert.throws(() => normalizeDagInput({ ...serializeDag(compoundFixture()), hierarchy }));
  }),
  defineTest("deep hierarchies validate and index without recursive stack overflow", () => {
    const count = 5000;
    const groups = Object.fromEntries(Array.from({ length: count }, (_, i) => [`g${i}`, { title: `Group ${i}` }]));
    const parentById = Object.fromEntries(Array.from({ length: count - 1 }, (_, i) => [`g${i + 1}`, `g${i}`]));
    parentById.a = `g${count - 1}`;
    const doc = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {} },
      edges: [],
      hierarchy: { id: "H", groups, parentById },
    });
    assert.equal(indexHierarchy(doc).leafCount.get("g0"), 1);
    const p = projectCompoundGraph(doc, view(["g0"]));
    assert.deepEqual(
      p.items.map((item) => item.id),
      ["g0"],
    );
  }),
  defineTest("nested folding preserves original edges and uses the outermost collapsed ancestor", () => {
    const doc = compoundFixture();
    const before = JSON.stringify(doc);
    const p = projectCompoundGraph(doc, view(["b", "c"]));
    assert.equal(p.representative.get("a"), "c");
    assert.deepEqual(p.edges.find((edge) => edge.source === "c")!.originalEdgeIds, ["ax", "dx"]);
    assert.deepEqual(p.edges.find((edge) => edge.target === "c")!.originalEdgeIds, ["xa"]);
    assert.deepEqual(p.items.find((item) => item.id === "c")!.internalEdgeIds, ["ad"]);
    assert.equal(JSON.stringify(doc), before);
    assert.equal(projectCompoundGraph(doc, view(["b"])).representative.get("a"), "b");
    assert.equal(projectCompoundGraph(doc, view()).representative.get("a"), "a");
  }),
  defineTest("drill-down retains isolated members and incoming/outgoing external boundaries", () => {
    const p = projectCompoundGraph(compoundFixture(), view(["c"], "c"));
    assert.ok(p.items.some((item) => item.id === "isolated"));
    assert.ok(p.items.some((item) => item.id === "x" && item.external));
    assert.equal(p.edges.flatMap((edge) => edge.originalEdgeIds).length, 4);
    assert.ok(!p.items.some((item) => item.id === "c"));
    const inner = projectCompoundGraph(compoundFixture(), view([], "b"));
    assert.ok(inner.items.some((item) => item.id === "d" && item.external));
    assert.ok(!inner.items.some((item) => item.id === "c"));
  }),
  defineTest("type filtering retains ancestor containers without synthesizing paths", () => {
    const p = projectCompoundGraph(compoundFixture(), view(), "service");
    assert.deepEqual(p.items.map((item) => item.id).sort(), ["a", "b", "c", "d"]);
    assert.deepEqual(
      p.edges.flatMap((edge) => edge.originalEdgeIds),
      ["ad"],
    );
    assert.ok(!projectGraphByType(compoundFixture(), "service").hierarchy);
  }),
  defineTest("grouping, moving and dissolving only modify H and reject cycles atomically", () => {
    const doc = compoundFixture();
    const grouped = applyGraphCommand(doc, { type: "groupCreate", id: "top", title: "Top", memberIds: ["c", "x"] }).dag;
    assert.deepEqual(grouped.edges, doc.edges);
    assert.deepEqual(grouped.nodes, doc.nodes);
    assert.throws(
      () => applyGraphCommand(grouped, { type: "groupMove", memberIds: ["top"], parentId: "b" }),
      /descendants/,
    );
    const moved = applyGraphCommand(grouped, { type: "groupMove", memberIds: ["a"], parentId: "c" }).dag;
    assert.ok(!Object.prototype.hasOwnProperty.call(moved.hierarchy!.groups, "b"));
    const dissolved = applyGraphCommand(moved, { type: "groupDissolve", id: "c" }).dag;
    assert.equal(dissolved.hierarchy!.parentById.a, "top");
    assert.deepEqual(dissolved.edges, doc.edges);
  }),
  defineTest("node rename/delete repair H and undo restores complete hierarchy", () => {
    const doc = compoundFixture();
    const renamed = applyGraphCommand(doc, { type: "renameNode", oldKey: "a", newKey: "a2" }).dag;
    assert.equal(renamed.hierarchy!.parentById.a2, "b");
    assert.ok(!renamed.hierarchy!.parentById.a);
    const removed = applyGraphCommand(renamed, { type: "deleteNode", key: "a2" });
    assert.ok(!removed.dag.hierarchy!.groups.b);
    const state = { ...createInitialGraphState(), dag: renamed, selection: { type: "full" } as const };
    const transaction = prepareGraphTransaction(state, [removed], "Delete");
    const edited = graphReducer(state, transaction!);
    const undone = graphReducer(edited, { type: "undoRequested" });
    assert.deepEqual(undone.dag, renamed);
    assert.deepEqual(graphReducer(undone, { type: "redoRequested" }).dag, removed.dag);
  }),
  defineTest("ordinary node-link ignores H and keeps disconnected cyclic components", () => {
    const doc = compoundFixture();
    for (const mode of ["level", "dagre", "sugiyama"] as const) {
      const stage = buildStageData({ dag: doc, selection: { type: "full" }, layoutMode: mode })!;
      assert.deepEqual(stage.nodes.map((node) => node.key).sort(), Object.keys(doc.nodes).sort());
      assert.equal(stage.edges.length, doc.edges.length);
      assert.ok(!stage.groups);
    }
  }),
  defineTest("compound and ordinary chart switching preserves the same document", () => {
    const doc = compoundFixture();
    const state = { ...createInitialGraphState(), dag: doc };
    const compound = graphReducer(state, { type: "chartTypeChanged", chartType: "compound" });
    assert.equal(compound.chartType, "compound");
    assert.equal(compound.dag, doc);
    assert.equal(graphReducer(compound, { type: "chartTypeChanged", chartType: "node-link" }).dag, doc);
  }),
  defineTest("merging documents preserves and remaps incoming hierarchy", () => {
    const first = compoundFixture();
    const second = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { y: {} },
      edges: [],
      hierarchy: { id: "other", groups: { z: { title: "Z" } }, parentById: { y: "z" } },
    });
    const result = analyzeGraphImport([
      { name: "one", payload: serializeDag(first) },
      { name: "two", payload: serializeDag(second) },
    ]);
    assert.equal(result.unresolved.length, 0);
    assert.equal(result.dag.hierarchy!.parentById.y, "z");
    assert.equal(result.dag.hierarchy!.parentById.a, "b");
  }),
  defineTest("ELK routes cross-boundary and reverse edges for expanded, folded and focused views", async () => {
    for (const state of [view(), view(["b"]), view(["b", "c"]), view([], "b")]) {
      const stage = await layout(compoundFixture(), state);
      assert.ok(Number.isFinite(stage.stageWidth));
      for (const edge of stage.edges) {
        assert.ok(!/NaN|Infinity|undefined/.test(edge.path), edge.path);
        assert.ok(edge.path.startsWith("M"));
        assert.ok(edge.originalEdgeIds!.length);
      }
      for (const node of stage.nodes) assert.ok([node.x, node.y, node.width, node.height].every(Number.isFinite));
      for (const group of stage.groups ?? []) {
        assert.ok(group.width > 0 && group.height > 0);
        const parentById = compoundFixture().hierarchy!.parentById;
        for (const node of stage.nodes.filter((item) => parentById[item.key] === group.id)) {
          assert.ok(node.x - node.width / 2 >= group.x);
          assert.ok(node.y - node.height / 2 >= group.y + 50);
          assert.ok(node.x + node.width / 2 <= group.x + group.width);
          assert.ok(node.y + node.height / 2 <= group.y + group.height);
        }
      }
    }
  }),
  defineTest("hierarchy import conflicts require explicit parent choices and remap renamed groups", () => {
    const first = {
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, x: {} },
      edges: [],
      hierarchy: { id: "H", groups: { b: { title: "B" } }, parentById: { a: "b" } },
    };
    const incoming = {
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, y: {} },
      edges: [],
      hierarchy: { id: "H2", groups: { b: { title: "Different B" } }, parentById: { y: "b" } },
    };
    const documents = [
      { name: "one", payload: first },
      { name: "two", payload: incoming },
    ];
    const analysis = analyzeGraphImport(documents);
    const group = analysis.unresolved.find((conflict) => conflict.path === "/hierarchy/groups/b")!;
    const membership = analysis.unresolved.find((conflict) => conflict.path === "/hierarchy/parentById/a")!;
    assert.ok(group.canRename);
    assert.equal(membership.incoming, null);
    assert.equal(analysis.dag.hierarchy!.parentById.a, "b");
    const resolved = analyzeGraphImport(documents, {
      [group.id]: { strategy: "rename", name: "b2" },
      [membership.id]: { strategy: "replace" },
    });
    assert.equal(resolved.unresolved.length, 0);
    assert.equal(resolved.dag.hierarchy!.parentById.y, "b2");
    assert.equal(resolved.dag.hierarchy!.parentById.a, undefined);
    assert.equal(resolved.dag.hierarchy!.groups.b, undefined);
  }),
  defineTest("special object-key IDs remain ordinary members and stale focus falls back safely", () => {
    const doc = normalizeDagInput(
      JSON.parse(
        '{"format":"graph-studio","version":3,"nodes":{"__proto__":{},"constructor":{}},"edges":[],"hierarchy":{"id":"H","groups":{"toString":{"title":"Group"}},"parentById":{"__proto__":"toString","constructor":"toString"}}}',
      ),
    );
    const p = projectCompoundGraph(doc, view(["toString"], "deleted"));
    assert.equal(p.focusGroupId, null);
    assert.equal(p.items[0].leafCount, 2);
    const renamed = applyGraphCommand(doc, { type: "renameNode", oldKey: "__proto__", newKey: "renamed" }).dag;
    assert.equal(renamed.hierarchy!.parentById.renamed, "toString");
  }),
  defineTest("commerce workspace demonstrates nested groups and complete relationship provenance", async () => {
    const doc = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    assert.ok(Object.keys(doc.hierarchy!.groups).length >= 8);
    assert.ok(Math.max(...indexHierarchy(doc).depth.values()) >= 3);
    const stage = await layout(doc, view(Object.keys(doc.hierarchy!.groups)));
    assert.ok(stage.nodes.length < Object.keys(doc.nodes).length);
    const p = projectCompoundGraph(doc, view(Object.keys(doc.hierarchy!.groups)));
    const ids = [
      ...p.edges.flatMap((edge) => edge.originalEdgeIds),
      ...p.items.flatMap((item) => item.internalEdgeIds),
    ];
    assert.deepEqual(ids.sort(), doc.edges.map((edge) => edge.id).sort());
  }),
]);
