import { getGroupNodes } from "../graph/hierarchy";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import { prepareGraphTransaction, prepareCommandTransaction } from "../state/graphTransactions";
import { roundedPolylinePath } from "../layout/rounded-path";
import { getContextMenuPages } from "../components/contextMenuModel";
import { placeContextMenu, placeContextSubmenu } from "../components/contextMenuPosition";
import { createInitialGraphState } from "../state/initialState";
import { defineSuite, defineTest } from "./harness";

export const compoundFixture = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: {
      ...{
        a: { title: "A", type: "service" },
        d: { title: "D", type: "service" },
        x: { title: "X", type: "external" },
        isolated: {},
      },
      ...{ b: { title: "B" }, c: { title: "C" } },
    },
    edges: [
      { id: "ad", source: "a", target: "d", value: "request" },
      { id: "ax", source: "a", target: "x", value: "request" },
      { id: "dx", source: "d", target: "x", value: "request" },
      { id: "xa", source: "x", target: "a", value: "response" },
    ],
    hierarchy_edges: Object.entries({ a: "b", b: "c", d: "c", isolated: "c" }).map(([target, source]) => ({
      id: `hierarchy:${target}`,
      source,
      target,
    })),
  });
const view = (collapsedGroupIds: string[] = [], focusGroupId: string | null = null) => ({
  collapsedGroupIds,
  focusGroupId,
});
const layout = (dag = compoundFixture(), currentView = view()) =>
  buildCompoundStage({
    dag,
    view: currentView,
    appearance: getStageAppearance(DEFAULT_GRAPH_APPEARANCE),
    showNodeDetail: true,
    alignNodeWidthsToMax: false,
  });

export const compoundSuite = defineSuite("Compound hierarchy, projection and layout", [
  defineTest("context menus stay within the viewport and flyouts flip or fall back to one panel", () => {
    const viewport = { width: 1280, height: 720 };
    const size = { width: 304, height: 250 };
    assert.deepEqual(placeContextMenu({ x: 1279, y: 719 }, size, viewport), { left: 968, top: 462 });
    const root = { left: 100, right: 380, top: 100, width: 280, height: 390 };
    assert.deepEqual(placeContextSubmenu(root, 200, size, viewport), {
      left: 384,
      top: 194,
      side: "right",
      inline: false,
    });
    const flipped = placeContextSubmenu({ ...root, left: 900, right: 1180 }, 700, size, viewport);
    assert.deepEqual(flipped, { left: 592, top: 462, side: "left", inline: false });
    const narrow = placeContextSubmenu({ ...root, left: 72, right: 352 }, 200, size, { width: 360, height: 640 });
    assert.equal(narrow.inline, true);
    assert.equal(narrow.left, 72);
  }),
  defineTest("rounded routes preserve endpoints and clamp bends on short and repeated segments", () => {
    assert.equal(
      roundedPolylinePath([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ]),
      "M0,0 L28,0 Q40,0 40,12 L40,40",
    );
    assert.equal(
      roundedPolylinePath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
      ]),
      "M0,0 L3,0 Q4,0 4,1 L4,2",
    );
    assert.equal(
      roundedPolylinePath([
        { x: 4, y: 2 },
        { x: 0, y: 2 },
      ]),
      "M4,2 L0,2",
    );
    assert.equal(roundedPolylinePath([]), "");
  }),
  defineTest("context menus distinguish G connections, H membership and external summaries", () => {
    const dag = compoundFixture();
    const group = getContextMenuPages({ kind: "group", id: "b" }, dag, "compound", view());
    const actions = Object.values(group).flatMap((page) => page.sections.flat().map((item) => item.action));
    assert.ok(
      actions.includes("group-dissolve") && actions.includes("group-members") && actions.includes("group-move"),
    );
    assert.ok(actions.includes("delete-node") && actions.includes("edit-parents") && actions.includes("view-node"));
    const node = getContextMenuPages({ kind: "node", id: "a" }, dag, "compound", view());
    assert.ok(node.root.sections.flat().some((item) => item.page === "organize"));
    assert.ok(node.connections.sections.flat().some((item) => item.action === "edit-parents"));
    assert.ok(!node.connections.sections.flat().some((item) => item.action === "delete-subtree"));
    const ordinary = getContextMenuPages({ kind: "node", id: "a" }, dag, "node-link", view());
    assert.ok(!ordinary.root.sections.flat().some((item) => item.page === "organize"));
    const external = getContextMenuPages({ kind: "group", id: "c" }, dag, "compound", view([], "b"));
    assert.ok(!external.root.sections.flat().some((item) => item.action === "group-toggle"));
    const promote = external.organize.sections.flat().find((item) => item.action === "group-promote")!;
    assert.equal(promote.disabled, true);
    assert.equal(promote.disabledReason, "Already at the top level");
  }),
  defineTest("adding a group member is one atomic undoable edit and adds no G relationship", () => {
    const dag = compoundFixture();
    const state = { ...createInitialGraphState(), dag, selection: { type: "full" } as const };
    const action = prepareCommandTransaction(
      state,
      [
        { type: "addNodeFromFields", key: "new", fields: { title: "New member" } },
        { type: "groupMove", memberIds: ["new"], parentId: "b" },
      ],
      "Add member",
    )!;
    const edited = graphReducer(state, action);
    assert.equal(indexHierarchy(edited.dag!).parent.get("new"), "b");
    assert.deepEqual(edited.dag!.edges, dag.edges);
    assert.equal(edited.editHistory.undoStack.length, 1);
    assert.deepEqual(graphReducer(edited, { type: "undoRequested" }).dag, dag);
    assert.throws(() =>
      prepareCommandTransaction(
        state,
        [
          { type: "addNode", key: "new" },
          { type: "groupMove", memberIds: ["new"], parentId: "missing" },
        ],
        "Invalid member",
      ),
    );
    assert.equal(dag.nodes.new, undefined);
  }),
  defineTest("v3 preserves independent G and H and rejects v2", () => {
    const doc = compoundFixture();
    assert.deepEqual(normalizeDagInput(serializeDag(doc)), doc);
    assert.throws(() => normalizeDagInput({ ...serializeDag(doc), version: 2 }), /version 3/);
    assert.deepEqual(Object.keys(doc.nodes.a.parents as object), ["x"]);
    assert.equal(indexHierarchy(doc).parent.get("a"), "b");
  }),
  defineTest(
    "new containment validation rejects dangling edges, cycles, duplicate IDs and multiple parents; old hierarchy is rejected",
    () => {
      const doc = serializeDag(compoundFixture());
      for (const hierarchy_edges of [
        [{ id: "1", source: "missing", target: "a" }],
        [{ id: "1", source: "a", target: "a" }],
        [
          { id: "1", source: "b", target: "c" },
          { id: "2", source: "c", target: "b" },
        ],
        [
          { id: "1", source: "b", target: "a" },
          { id: "2", source: "c", target: "a" },
        ],
        [
          { id: "1", source: "b", target: "a" },
          { id: "1", source: "c", target: "d" },
        ],
        [{ id: "1", source: "b", target: "a", value: "not allowed" }],
      ])
        assert.throws(() => normalizeDagInput({ ...doc, hierarchy_edges }));
      assert.throws(
        () => normalizeDagInput({ ...doc, hierarchy: { id: "H", groups: {}, parentById: {} } }),
        /Unknown document field/,
      );
      const plain = normalizeDagInput({ ...doc, hierarchy_edges: [] });
      assert.ok(plain.nodes.b);
      assert.equal(indexHierarchy(plain).groups.size, 0);
    },
  ),
  defineTest("parent nodes retain fields and can be ordinary edge endpoints in every compound view", async () => {
    const original = serializeDag(compoundFixture());
    original.nodes.b.define = "Parent node details";
    original.nodes.b.type = "service";
    original.edges.push(
      { id: "bx", source: "b", target: "x", value: "parent out" },
      { id: "xb", source: "x", target: "b" },
      { id: "ba", source: "b", target: "a" },
      { id: "ab", source: "a", target: "b" },
    );
    const dag = normalizeDagInput(original);
    for (const currentView of [view(), view(["b"]), view(["c"]), view([], "b")]) {
      const projection = projectCompoundGraph(dag, currentView);
      const ids = [
        ...projection.edges.flatMap((edge) => edge.originalEdgeIds),
        ...projection.items.flatMap((item) => item.internalEdgeIds),
      ];
      for (const id of ["bx", "xb", "ba", "ab"])
        assert.ok(ids.includes(id), `${id} missing in ${JSON.stringify(currentView)}`);
      const stage = await layout(dag, currentView);
      assert.ok(stage.edges.every((edge) => !/NaN|Infinity|undefined/.test(edge.path)));
      for (const edge of stage.edges) assert.ok(stage.nodeMap[edge.source] && stage.nodeMap[edge.target]);
    }
    const descriptionStage = await buildCompoundStage({
      dag,
      view: view(["b"]),
      appearance: getStageAppearance({
        ...DEFAULT_GRAPH_APPEARANCE,
        display: { ...DEFAULT_GRAPH_APPEARANCE.display, showGroupStats: false },
      }),
      showNodeDetail: true,
      alignNodeWidthsToMax: false,
    });
    assert.equal(descriptionStage.nodeMap.b.detail, "Parent node details");
    assert.equal(descriptionStage.nodeMap.b.groupStatsOnly, false);
    const renamed = applyGraphCommand(dag, { type: "renameNode", oldKey: "b", newKey: "parent" }).dag;
    assert.equal(indexHierarchy(renamed).parent.get("a"), "parent");
    assert.equal(renamed.edges.find((edge) => edge.id === "bx")!.source, "parent");
    assert.equal(renamed.nodes.parent.define, "Parent node details");
    const dissolved = applyGraphCommand(dag, { type: "groupDissolve", id: "b" }).dag;
    assert.deepEqual(dissolved.nodes.b, dag.nodes.b);
    assert.deepEqual(dissolved.edges, dag.edges);
    const removed = applyGraphCommand(dag, { type: "deleteNode", key: "b" }).dag;
    assert.ok(removed.nodes.a);
    assert.ok(!removed.hierarchy_edges!.some((edge) => edge.source === "b" || edge.target === "b"));
  }),
  defineTest("deep hierarchies validate and index without recursive stack overflow", () => {
    const count = 5000;
    const groups = Object.fromEntries(Array.from({ length: count }, (_, i) => [`g${i}`, { title: `Group ${i}` }]));
    const parentById = Object.fromEntries(Array.from({ length: count - 1 }, (_, i) => [`g${i + 1}`, `g${i}`]));
    parentById.a = `g${count - 1}`;
    const doc = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { ...{ a: {} }, ...groups },
      edges: [],
      hierarchy_edges: Object.entries(parentById).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
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
  defineTest("folded and external summaries merge mixed relationships by directed visible endpoints", () => {
    const doc = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        ...{ a: {}, b: {}, c: {}, x: {}, y: {}, z: {} },
        ...{ left: { title: "Left" }, right: { title: "Right" } },
      },
      edges: [
        { id: "request", source: "a", target: "x", value: "request" },
        { id: "event", source: "a", target: "y", value: "event" },
        { id: "amount", source: "b", target: "y", value: 10 },
        { id: "flag", source: "a", target: "z", value: true },
        { id: "unlabelled", source: "c", target: "x" },
        { id: "response", source: "x", target: "a", value: "response" },
        { id: "internal", source: "a", target: "b", value: "handover" },
      ],
      hierarchy_edges: Object.entries({ a: "left", b: "left", c: "left", x: "right", y: "right", z: "right" }).map(
        ([target, source]) => ({ id: `hierarchy:${target}`, source, target }),
      ),
    });
    const before = JSON.stringify(doc);
    const folded = projectCompoundGraph(doc, view(["left", "right"]));
    assert.equal(folded.edges.length, 2);
    const forward = folded.edges.find((edge) => edge.source === "left")!;
    assert.equal(forward.target, "right");
    assert.equal(forward.label, "5 edges");
    assert.deepEqual(forward.originalEdgeIds, ["request", "event", "amount", "flag", "unlabelled"]);
    assert.deepEqual(folded.edges.find((edge) => edge.source === "right")!.originalEdgeIds, ["response"]);
    assert.deepEqual(folded.items.find((item) => item.id === "left")!.internalEdgeIds, ["internal"]);

    // One collapsed endpoint is enough; distinct visible leaves stay separate.
    const partial = projectCompoundGraph(doc, view(["left"]));
    assert.deepEqual(partial.edges.find((edge) => edge.source === "left" && edge.target === "x")!.originalEdgeIds, [
      "request",
      "unlabelled",
    ]);
    assert.deepEqual(partial.edges.find((edge) => edge.target === "y")!.originalEdgeIds, ["event", "amount"]);
    assert.deepEqual(partial.edges.find((edge) => edge.target === "z")!.originalEdgeIds, ["flag"]);

    // The outside group is a summary even without an explicit collapse preference.
    const focused = projectCompoundGraph(doc, view([], "left"));
    assert.ok(focused.items.find((item) => item.id === "right")!.external);
    assert.deepEqual(focused.edges.find((edge) => edge.source === "a")!.originalEdgeIds, ["request", "event", "flag"]);
    assert.equal(focused.edges.filter((edge) => edge.source === "a" && edge.target === "right").length, 1);

    const expanded = projectCompoundGraph(doc, view());
    assert.equal(expanded.edges.length, doc.edges.length);
    assert.ok(expanded.edges.every((edge) => edge.originalEdgeIds.length === 1));
    assert.deepEqual(
      expanded.edges.flatMap((edge) => edge.originalEdgeIds).sort(),
      doc.edges.map((edge) => edge.id).sort(),
    );
    assert.equal(JSON.stringify(doc), before);
  }),
  defineTest("type filtering retains ancestor containers without synthesizing paths", () => {
    const p = projectCompoundGraph(compoundFixture(), view(), "service");
    assert.deepEqual(p.items.map((item) => item.id).sort(), ["a", "b", "c", "d"]);
    assert.deepEqual(
      p.edges.flatMap((edge) => edge.originalEdgeIds),
      ["ad"],
    );
    assert.ok(!projectGraphByType(compoundFixture(), "service").hierarchy_edges);
  }),
  defineTest("grouping, moving and dissolving preserve ordinary relationships and reject cycles atomically", () => {
    const doc = compoundFixture();
    const grouped = applyGraphCommand(doc, { type: "groupCreate", id: "top", title: "Top", memberIds: ["c", "x"] }).dag;
    assert.deepEqual(grouped.edges, doc.edges);
    assert.deepEqual(grouped.nodes.top, { title: "Top" });
    for (const id of Object.keys(doc.nodes)) assert.deepEqual(grouped.nodes[id], doc.nodes[id]);
    assert.throws(
      () => applyGraphCommand(grouped, { type: "groupMove", memberIds: ["top"], parentId: "b" }),
      /descendants/,
    );
    const moved = applyGraphCommand(grouped, { type: "groupMove", memberIds: ["a"], parentId: "c" }).dag;
    assert.ok(!Object.prototype.hasOwnProperty.call(getGroupNodes(moved), "b"));
    assert.ok(moved.nodes.b);
    const dissolved = applyGraphCommand(moved, { type: "groupDissolve", id: "c" }).dag;
    assert.equal(indexHierarchy(dissolved).parent.get("a"), "top");
    assert.deepEqual(dissolved.edges, doc.edges);
  }),
  defineTest("node rename/delete repair H and undo restores complete hierarchy", () => {
    const doc = compoundFixture();
    const renamed = applyGraphCommand(doc, { type: "renameNode", oldKey: "a", newKey: "a2" }).dag;
    assert.equal(indexHierarchy(renamed).parent.get("a2"), "b");
    assert.ok(!indexHierarchy(renamed).parent.get("a"));
    const removed = applyGraphCommand(renamed, { type: "deleteNode", key: "a2" });
    assert.ok(!getGroupNodes(removed.dag).b);
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
      nodes: { ...{ y: {} }, ...{ z: { title: "Z" } } },
      edges: [],
      hierarchy_edges: Object.entries({ y: "z" }).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
    });
    const result = analyzeGraphImport([
      { name: "one", payload: serializeDag(first) },
      { name: "two", payload: serializeDag(second) },
    ]);
    assert.equal(result.unresolved.length, 0);
    assert.equal(indexHierarchy(result.dag).parent.get("y"), "z");
    assert.equal(indexHierarchy(result.dag).parent.get("a"), "b");
  }),
  defineTest(
    "fixed-layout routing preserves cross-boundary and reverse edges in expanded, folded and focused views",
    async () => {
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
          const parentById = Object.fromEntries(indexHierarchy(compoundFixture()).parent);
          for (const node of stage.nodes.filter((item) => parentById[item.key] === group.id)) {
            assert.ok(node.x - node.width / 2 >= group.x);
            assert.ok(node.y - node.height / 2 >= group.y + 50);
            assert.ok(node.x + node.width / 2 <= group.x + group.width);
            assert.ok(node.y + node.height / 2 <= group.y + group.height);
          }
        }
      }
    },
  ),
  defineTest("hierarchy import conflicts require explicit parent choices and remap renamed groups", () => {
    const first = {
      format: "graph-studio",
      version: 3,
      nodes: { ...{ a: {}, x: {} }, ...{ b: { title: "B" } } },
      edges: [],
      hierarchy_edges: Object.entries({ a: "b" }).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
    };
    const incoming = {
      format: "graph-studio",
      version: 3,
      nodes: { ...{ a: {}, y: {} }, ...{ b: { title: "Different B" } } },
      edges: [],
      hierarchy_edges: Object.entries({ y: "b" }).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
    };
    const documents = [
      { name: "one", payload: first },
      { name: "two", payload: incoming },
    ];
    const analysis = analyzeGraphImport(documents);
    const group = analysis.unresolved.find((conflict) => conflict.path === "/nodes/b")!;
    assert.ok(group.canRename);
    assert.equal(indexHierarchy(analysis.dag).parent.get("a"), "b");
    const resolved = analyzeGraphImport(documents, {
      [group.id]: { strategy: "rename", name: "b2" },
    });
    assert.equal(resolved.unresolved.length, 0);
    assert.equal(indexHierarchy(resolved.dag).parent.get("y"), "b2");
    assert.equal(indexHierarchy(resolved.dag).parent.get("a"), "b");
    assert.ok(resolved.dag.nodes.b);
  }),
  defineTest("membership import resolves parent and ID conflicts without silently creating two parents", () => {
    const nodes = { a: {}, b: {}, x: {}, y: {} };
    const document = (hierarchy_edges: { id: string; source: string; target: string }[]) => ({
      format: "graph-studio",
      version: 3,
      nodes,
      edges: [],
      hierarchy_edges,
    });
    const documents = [
      {
        name: "one",
        payload: document([
          { id: "h1", source: "a", target: "x" },
          { id: "h2", source: "a", target: "y" },
        ]),
      },
      { name: "two", payload: document([{ id: "h1", source: "b", target: "y" }]) },
    ];
    const analysis = analyzeGraphImport(documents);
    assert.equal(analysis.unresolved.length, 1);
    const conflict = analysis.unresolved[0];
    assert.equal(conflict.canRename, false);
    assert.equal(conflict.canReplace, true);
    assert.deepEqual(analysis.dag.hierarchy_edges, documents[0].payload.hierarchy_edges);
    const replaced = analyzeGraphImport(documents, { [conflict.id]: { strategy: "replace" } });
    assert.equal(replaced.unresolved.length, 0);
    assert.deepEqual(replaced.dag.hierarchy_edges, [{ id: "h1", source: "b", target: "y" }]);
    const renamedDocuments = [
      { name: "one", payload: document([{ id: "h", source: "a", target: "x" }]) },
      { name: "two", payload: document([{ id: "h", source: "b", target: "y" }]) },
    ];
    const idConflict = analyzeGraphImport(renamedDocuments).unresolved[0];
    assert.ok(idConflict.canRename);
    const renamed = analyzeGraphImport(renamedDocuments, { [idConflict.id]: { strategy: "rename", name: "h-new" } });
    assert.deepEqual(renamed.dag.hierarchy_edges, [
      { id: "h", source: "a", target: "x" },
      { id: "h-new", source: "b", target: "y" },
    ]);
    assert.throws(
      () =>
        analyzeGraphImport([
          { name: "one", payload: document([{ id: "ab", source: "a", target: "b" }]) },
          { name: "two", payload: document([{ id: "ba", source: "b", target: "a" }]) },
        ]),
      /cycle/i,
    );
  }),
  defineTest("special object-key IDs remain ordinary members and stale focus falls back safely", () => {
    const doc = normalizeDagInput(
      JSON.parse(
        '{"format":"graph-studio","version":3,"nodes":{"__proto__":{},"constructor":{},"toString":{"title":"Group"}},"edges":[],"hierarchy_edges":[{"id":"h:__proto__","source":"toString","target":"__proto__"},{"id":"h:constructor","source":"toString","target":"constructor"}]}',
      ),
    );
    const p = projectCompoundGraph(doc, view(["toString"], "deleted"));
    assert.equal(p.focusGroupId, null);
    assert.equal(p.items[0].leafCount, 2);
    const renamed = applyGraphCommand(doc, { type: "renameNode", oldKey: "__proto__", newKey: "renamed" }).dag;
    assert.equal(indexHierarchy(renamed).parent.get("renamed"), "toString");
  }),
  defineTest("commerce workspace demonstrates nested groups and complete relationship provenance", async () => {
    const doc = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    assert.ok(Object.keys(getGroupNodes(doc)).length >= 8);
    assert.ok(Math.max(...indexHierarchy(doc).depth.values()) >= 3);
    const stage = await layout(doc, view(Object.keys(getGroupNodes(doc))));
    assert.ok(stage.nodes.length < Object.keys(doc.nodes).length);
    assert.equal(
      new Set(stage.edges.map((edge) => JSON.stringify([edge.source, edge.target]))).size,
      stage.edges.length,
    );
    const platformEdges = stage.edges.filter((edge) => edge.source === "commerce" && edge.target === "platform");
    assert.equal(platformEdges.length, 1);
    assert.equal(platformEdges[0].label, "5 edges");
    const platformOriginals = doc.edges.filter((edge) => platformEdges[0].originalEdgeIds!.includes(edge.id));
    assert.equal(platformOriginals.length, 5);
    for (const edge of platformOriginals) {
      assert.ok(platformEdges[0].description!.includes(`${edge.id}: ${edge.source} → ${edge.target} (${edge.value})`));
    }
    const p = projectCompoundGraph(doc, view(Object.keys(getGroupNodes(doc))));
    const ids = [
      ...p.edges.flatMap((edge) => edge.originalEdgeIds),
      ...p.items.flatMap((item) => item.internalEdgeIds),
    ];
    assert.deepEqual(ids.sort(), doc.edges.map((edge) => edge.id).sort());
  }),
]);
