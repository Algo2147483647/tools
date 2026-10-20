import assert from "node:assert/strict";
import { getNodeChildKeys, getNodeParentKeys } from "../graph/accessors";
import { createGraphDocument, normalizeDagInput } from "../graph/normalize";
import { projectGraphDocument } from "../graph/projection";
import { serializeDag } from "../graph/serialize";
import { findRootsFromDag } from "../graph/selectors";
import { projectGraphByTimelineTrack } from "../graph/timelineView";
import { projectGraphByType } from "../graph/typeFilter";
import { buildLevelLayout } from "../layout/algorithms/level";
import { buildVisibleGraph } from "../layout/algorithms/shared";
import { defineSuite, defineTest } from "./harness";

export const projectionSuite = defineSuite("Graph projections and breadth-first traversal", [
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
