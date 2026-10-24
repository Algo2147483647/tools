import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNodeChildKeys, getNodeChildren, getNodeParentKeys, getNodeParents } from "../graph/accessors";
import { applyGraphCommand, collectSubtreeNodeKeys } from "../graph/commands";
import { createInitialCanvasDag } from "../graph/initialCanvas";
import { buildRawNodeEditorValue, parseRawNodeEditorValue } from "../graph/nodeJson";
import { createGraphDocument, normalizeDagInput } from "../graph/normalize";
import { formatRelationValue, parseRelationValue } from "../graph/relations";
import {
  findRootsFromDag,
  getInitialSelection,
  getParentLevelSelection,
  remapSelectionKeys,
  removeSelectionKeys,
  sanitizeNodeLabel,
} from "../graph/selectors";
import { cloneGraphDocument, projectGraphDocument, serializeDag } from "../graph/serialize";
import { projectGraphByTimelineTrack } from "../graph/timeline/view";
import { collectDescendantKeys } from "../graph/traversal";
import { getGraphTypeOptions, projectGraphByType } from "../graph/typeFilter";
import { buildLevelLayout } from "../layout/node-link/algorithms/level";
import { buildVisibleGraph } from "../layout/node-link/algorithms/shared";
import { buildStageData } from "../layout/node-link/layout";
import { createForestDag, createSampleDag } from "./fixtures";
import { defineSuite, defineTest } from "./harness";

export const graphSuite = defineSuite("v3 document and graph", [
  defineTest("shared traversal preserves depth-first order and handles cycles, duplicate and missing roots", () => {
    const graph = createGraphDocument({ A: {}, B: {}, C: {} }, [
      { id: "ab", source: "A", target: "B" },
      { id: "ac", source: "A", target: "C" },
      { id: "ba", source: "B", target: "A" },
    ]);
    const before = serializeDag(graph);
    const nodes = { ...graph.nodes, missing: undefined };
    assert.deepEqual(collectDescendantKeys(nodes, ["A", "A", "missing", "constructor"]), ["A", "C", "B"]);
    assert.deepEqual(collectSubtreeNodeKeys(graph, "A"), ["A", "C", "B"]);
    assert.deepEqual(serializeDag(graph), before);
  }),
  defineTest("bundled sample uses the native protocol and preserves its edges", () => {
    const sample = JSON.parse(readFileSync(new URL("../../public/example.json", import.meta.url), "utf8"));
    const dag = normalizeDagInput(sample);
    assert.equal(Object.keys(dag.nodes).length, 111);
    assert.equal(dag.edges.length, 141);
    assert.deepEqual(serializeDag(dag), sample);
  }),
  defineTest("relation form values round-trip scalars without changing strings to booleans or numbers", () => {
    for (const value of [null, true, false, 12, 1e30, "true", "null", "12", "", "  spaced  ", "a\nb"]) {
      assert.equal(parseRelationValue(formatRelationValue(value)), value);
    }
    const source = createGraphDocument({ A: {}, B: {} }, [{ id: "ab", source: "A", target: "B", value: null }]);
    const updated = applyGraphCommand(source, { type: "setChildren", key: "A", children: ["B"] }).dag;
    assert.equal(updated.edges[0].value, null);
  }),
  defineTest("stage uses edge IDs and synthetic roots cannot replace real nodes", () => {
    const source = createGraphDocument({ __graph_root__: { title: "Real root" }, A: {}, B: {} }, [
      { id: "stable-id", source: "A", target: "B" },
    ]);
    for (const layoutMode of ["level", "sugiyama", "dagre"] as const) {
      const stage = buildStageData({ dag: source, selection: { type: "full" }, layoutMode });
      assert.ok(stage);
      assert.equal(stage.nodes.length, 3);
      assert.equal(stage.edges[0].id, "stable-id");
    }
  }),
  defineTest("document metadata and arbitrary node/edge metadata round-trip without adjacency fields", () => {
    const input = {
      format: "graph-studio",
      version: 3,
      id: "test",
      title: "Test",
      metadata: { owner: "me", nested: [null, true, 3] },
      nodes: { A: { title: "Alpha", custom: { x: [1, 2] } }, B: {} },
      edges: [{ id: "edge", source: "A", target: "B", value: null, metadata: { source: "book" } }],
    };
    const dag = normalizeDagInput(input);
    assert.deepEqual(serializeDag(dag), input);
    assert.deepEqual(getNodeChildren(dag.nodes.A), { B: null });
    assert.deepEqual(getNodeParents(dag.nodes.B), { A: null });
    assert.deepEqual(Object.keys(dag.nodes.A), ["title", "custom"]);
    assert.throws(() => {
      dag.nodes.A.children = {};
    });
    assert.deepEqual(serializeDag(normalizeDagInput(serializeDag(dag))), input);
  }),
  defineTest("old and unknown document formats are rejected", () => {
    for (const input of [
      { A: {} },
      [{ key: "A" }],
      { nodes: [{ key: "A" }] },
      { format: "unknown", version: 3, nodes: {}, edges: [] },
      { format: "graph-studio", version: 99, nodes: {}, edges: [] },
    ])
      assert.throws(() => normalizeDagInput(input), /Unsupported graph format/);
    assert.throws(
      () => normalizeDagInput({ format: "graph-studio", version: 3, nodes: {}, edges: [], extra: 1 }),
      /Unknown document field/,
    );
  }),
  defineTest("invalid node fields, missing endpoints and duplicate edge identities are rejected", () => {
    const base = { format: "graph-studio", version: 3, nodes: { A: {}, B: {}, C: {} }, edges: [] };
    for (const node of [null, 3, [], { parents: {} }, { children: {} }, { key: "A" }, { type: ["x"] }])
      assert.throws(() => normalizeDagInput({ ...base, nodes: { A: node } }));
    assert.throws(
      () => normalizeDagInput({ ...base, edges: [{ id: "e", source: "A", target: "Missing" }] }),
      /endpoints/,
    );
    assert.throws(
      () =>
        normalizeDagInput({
          ...base,
          edges: [
            { id: "e", source: "A", target: "B" },
            { id: "e", source: "A", target: "C" },
          ],
        }),
      /duplicate edge ID/,
    );
    assert.throws(() => normalizeDagInput({ ...base, edges: [{ id: "e", source: "A", target: "A" }] }), /self-loops/);
    assert.throws(
      () => normalizeDagInput({ ...base, edges: [{ id: "e", source: "A", target: "B", value: { x: 1 } }] }),
      /scalar/,
    );
  }),
  defineTest("special object keys survive serialization and edge indexes", () => {
    const dag = normalizeDagInput(
      JSON.parse(
        '{"format":"graph-studio","version":3,"nodes":{"__proto__":{},"constructor":{}},"edges":[{"id":"e","source":"__proto__","target":"constructor","value":false}]}',
      ),
    );
    assert.deepEqual(Object.keys(dag.nodes), ["__proto__", "constructor"]);
    const constructorKey: string = "constructor";
    assert.deepEqual(getNodeParents(dag.nodes[constructorKey]), JSON.parse('{"__proto__":false}'));
    assert.equal(Object.keys(serializeDag(dag).nodes).length, 2);
    for (const layoutMode of ["level", "sugiyama", "dagre"] as const) {
      assert.equal(buildStageData({ dag, selection: { type: "full" }, layoutMode })?.nodes.length, 2);
    }
  }),
  defineTest("node edits preserve incident edges and metadata", () => {
    const source = createSampleDag();
    source.metadata = { title: "metadata" };
    source.edges[0].metadata = { proof: 1 };
    const edited = applyGraphCommand(source, { type: "updateNodeFields", key: "B", fields: { title: "Beta 2" } }).dag;
    assert.deepEqual(edited.edges, source.edges);
    assert.deepEqual(edited.metadata, source.metadata);
    assert.equal(edited.nodes.B.title, "Beta 2");
    assert.equal(source.nodes.B.title, "Beta");
    assert.throws(
      () => applyGraphCommand(source, { type: "updateNodeFields", key: "B", fields: { children: { D: "new" } } }),
      /not allowed/,
    );
  }),
  defineTest("relation editing changes one edge and derives both indexes, preserving edge identity", () => {
    const source = createSampleDag();
    source.edges[0].metadata = { proof: 1 };
    const updated = applyGraphCommand(source, { type: "setParentRelations", key: "B", parents: { A: "new" } }).dag;
    assert.deepEqual(updated.edges[0], { ...source.edges[0], value: "new" });
    assert.deepEqual(getNodeChildren(updated.nodes.A), { B: "new", C: "edge_ac" });
    assert.deepEqual(getNodeParents(updated.nodes.B), { A: "new" });
    assert.equal(source.edges[0].value, "edge_ab");
  }),
  defineTest("rename and delete update authoritative edge endpoints", () => {
    const source = createSampleDag();
    const renamed = applyGraphCommand(source, { type: "renameNode", oldKey: "B", newKey: "Renamed" }).dag;
    assert.equal(renamed.edges[0].target, "Renamed");
    assert.equal(renamed.edges[2].source, "Renamed");
    assert.equal(renamed.edges[0].id, "ab");
    assert.equal(source.edges[0].target, "B");
    assert.deepEqual(collectSubtreeNodeKeys(source, "B").sort(), ["B", "D"]);
    const deleted = applyGraphCommand(source, { type: "deleteSubtree", rootKey: "B" }).dag;
    assert.deepEqual(Object.keys(deleted.nodes), ["A", "C"]);
    assert.deepEqual(deleted.edges, [source.edges[1]]);
  }),
  defineTest("cloning and empty documents keep a consistent graph model", () => {
    const source = createSampleDag();
    const clone = cloneGraphDocument(source);
    assert.deepEqual(getNodeChildren(clone.nodes.A), { B: "edge_ab", C: "edge_ac" });
    assert.equal(buildStageData({ dag: createGraphDocument(), selection: { type: "full" } }), null);
    assert.equal(serializeDag(createInitialCanvasDag()).version, 3);
    assert.deepEqual(serializeDag(clone), serializeDag(source));
    assert.notEqual(clone.nodes.A, source.nodes.A);
  }),
  defineTest("type projection bridges hidden paths and layouts use derived indexes", () => {
    const source = createSampleDag();
    source.nodes.A.type = source.nodes.C.type = source.nodes.D.type = "visible";
    source.nodes.B.type = "hidden";
    const before = serializeDag(source);
    const projected = projectGraphByType(source, "visible");
    assert.deepEqual(Object.keys(projected.nodes).sort(), ["A", "C", "D"]);
    assert.equal(projected.edges.find((e) => e.target === "D")?.value, "filtered_path");
    assert.deepEqual(serializeDag(source), before);
    assert.deepEqual(getGraphTypeOptions(source), ["hidden", "visible"]);
    assert.equal(projectGraphByType(source, ""), source);
    assert.equal(Object.keys(projectGraphByType(source, "missing").nodes).length, 0);
    for (const layoutMode of ["level", "sugiyama", "dagre"] as const) {
      const stage = buildStageData({ dag: projected, selection: { type: "full" }, layoutMode });
      assert.ok(stage);
      assert.equal(stage.nodes.length, 3);
      assert.equal(stage.edges.length, 2);
    }
  }),
  defineTest("selectors still navigate and repair node selections", () => {
    const source = createSampleDag();
    assert.deepEqual(getInitialSelection(source), { type: "node", key: "A" });
    assert.deepEqual(getInitialSelection(createForestDag()), { type: "full" });
    assert.deepEqual(getParentLevelSelection(source, ["D"]), { type: "node", key: "B" });
    assert.deepEqual(
      remapSelectionKeys({ type: "node", key: "B" }, (k) => (k === "B" ? "B2" : k)),
      { type: "node", key: "B2" },
    );
    assert.equal(removeSelectionKeys({ type: "node", key: "B" }, new Set(["B"])), null);
    assert.equal(sanitizeNodeLabel("Alpha-Beta_Title"), "Alpha-Beta Title");
  }),
  defineTest("raw node editor uses explicit id/data envelope and does not guess wrappers", () => {
    const raw = buildRawNodeEditorValue("A", { metadata: { difficulty: "easy" } });
    assert.deepEqual(parseRawNodeEditorValue(raw), {
      ok: true,
      nextKey: "A",
      fields: { metadata: { difficulty: "easy" } },
    });
    assert.equal(parseRawNodeEditorValue('{"metadata":{"difficulty":"easy"}}').ok, false);
    for (const field of ["parents", "children"]) {
      assert.equal(parseRawNodeEditorValue(JSON.stringify({ id: "A", data: { [field]: ["B"] } })).ok, false);
    }
  }),
  defineTest("projections retain metadata and isolated nodes without sharing mutable source data", () => {
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      title: "Projection",
      metadata: { nested: { value: 1 } },
      nodes: {
        group: {},
        A: { custom: { values: [1, 2] } },
        B: {},
        C: {},
        ["__proto__"]: {},
      },
      edges: [
        { id: "ab", source: "A", target: "B", value: null, metadata: { origin: "source" } },
        { id: "bc", source: "B", target: "C" },
      ],
      hierarchy_edges: [{ id: "group-a", source: "group", target: "A" }],
    });
    const before = serializeDag(source);
    const projected = projectGraphDocument(source, new Set(["A", "B", "__proto__", "missing"]));
    assert.deepEqual(Object.keys(projected.nodes), ["A", "B", "__proto__"]);
    assert.equal(projected.hierarchy_edges, undefined);
    assert.deepEqual(projected.edges, [source.edges[0]]);
    assert.deepEqual(getNodeChildKeys(projected.nodes.A), ["B"]);
    assert.deepEqual(getNodeChildKeys(projected.nodes.B), []);
    assert.deepEqual(getNodeParentKeys(projected.nodes.B), ["A"]);
    assert.deepEqual(serializeDag(normalizeDagInput(serializeDag(projected))), serializeDag(projected));
    (projected.nodes.A.custom as { values: number[] }).values.push(3);
    (projected.metadata!.nested as { value: number }).value = 2;
    projected.edges[0].metadata!.origin = "changed";
    assert.deepEqual(serializeDag(source), before);
    assert.deepEqual(findRootsFromDag(projected), ["A", "__proto__"]);
  }),
  defineTest("type shortcuts preserve direct edges, traversal order and length-based IDs through cycles", () => {
    const source = createGraphDocument({ A: { type: "show" }, hidden: {}, C: { type: "show" }, D: { type: "show" } }, [
      { id: "edge-2", source: "A", target: "C", value: "direct" },
      { id: "ah", source: "A", target: "hidden" },
      { id: "hc", source: "hidden", target: "C" },
      { id: "hd", source: "hidden", target: "D" },
      { id: "ha", source: "hidden", target: "A" },
    ]);
    const projected = projectGraphByType(source, "show");
    assert.deepEqual(projected.edges, [
      source.edges[0],
      { id: "edge-3", source: "A", target: "D", value: "filtered_path", metadata: { projected: true } },
    ]);
    assert.deepEqual(getNodeChildKeys(projected.nodes.A), ["C", "D"]);
    for (const type of ["timeline", "sankey"] as const)
      assert.deepEqual(projectGraphByType(source, "show", type).edges, [source.edges[0]]);
    assert.deepEqual(projectGraphDocument(source, new Set()).nodes, Object.create(null));
  }),
  defineTest("track projections normalize track names and preserve the default Events track", () => {
    const source = createGraphDocument(
      { A: { track: " Science " }, B: { track: "Science" }, C: { track: "" }, D: {} },
      [{ id: "ab", source: "A", target: "B" }],
    );
    assert.equal(projectGraphByTimelineTrack(source, ""), source);
    assert.deepEqual(Object.keys(projectGraphByTimelineTrack(source, "Science").nodes), ["A", "B"]);
    assert.deepEqual(Object.keys(projectGraphByTimelineTrack(source, "Events").nodes), ["C", "D"]);
    assert.equal(projectGraphByTimelineTrack(source, "missing").edges.length, 0);
  }),
  defineTest("wide cyclic graphs retain breadth-first ordering and level coordinates", () => {
    const keys = Array.from({ length: 2000 }, (_, i) => `child-${i}`);
    const source = createGraphDocument(Object.fromEntries(["root", ...keys, "leaf"].map((key) => [key, {}])), [
      ...keys.map((key, i) => ({ id: `edge-${i}`, source: "root", target: key })),
      { id: "leaf", source: keys[0], target: "leaf" },
      { id: "cycle", source: "leaf", target: "root" },
    ]);
    const roots = ["root", "root", "missing"];
    const visible = buildVisibleGraph(source.nodes, roots);
    assert.deepEqual(visible.nodeKeys, ["root", ...keys, "leaf"]);
    const layout = buildLevelLayout(source.nodes, roots);
    assert.deepEqual(layout.coordinates.get("root"), [0, 0]);
    assert.deepEqual(layout.coordinates.get(keys[1999]), [1, 1999]);
    assert.deepEqual(layout.coordinates.get("leaf"), [2, 0]);
    assert.equal(layout.coordinates.size, 2002);
    assert.deepEqual(findRootsFromDag(source), Object.keys(source.nodes));
  }),
]);
