import assert from "node:assert/strict";
import { normalizeDagInput } from "../graph/normalize";
import { emptyTypeFilter, matchesTypes, projectGraphByType, type TypeFilter } from "../graph/typeFilter";
import { projectCompoundGraph } from "../graph/compound/projection";
import { compoundViewKey, loadCompoundView, saveCompoundView } from "../viewport/compoundViewStorage";
import { defineSuite, defineTest } from "./harness";

const dag = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  nodes: { a: { type: "red" }, b: { type: "blue" }, c: { type: "green" }, d: {}, group: {} },
  edges: [
    { id: "ab", source: "a", target: "b" },
    { id: "bc", source: "b", target: "c" },
  ],
  hierarchy_edges: [
    { id: "ga", source: "group", target: "a" },
    { id: "gb", source: "group", target: "b" },
  ],
});
const filter = (values: string[], operation: "include" | "exclude" = "include"): TypeFilter => ({
  ...emptyTypeFilter(),
  enabled: true,
  selection: "multiple",
  values,
  operation,
});
export const workbenchSuite = defineSuite("Workbench type filters and view persistence", [
  defineTest("multi-select includes any selected type; exclusion retains untyped nodes", () => {
    assert.deepEqual(Object.keys(projectGraphByType(dag, filter(["red", "blue"])).nodes), ["a", "b"]);
    assert.deepEqual(Object.keys(projectGraphByType(dag, filter(["red", "blue"], "exclude")).nodes), [
      "c",
      "d",
      "group",
    ]);
    assert.equal(matchesTypes(["red", "blue"], filter(["blue"])), true);
    assert.equal(matchesTypes(["red", "blue"], filter(["blue"], "exclude")), false);
    assert.equal(projectGraphByType(dag, emptyTypeFilter()), dag);
    assert.deepEqual(Object.keys(projectGraphByType(dag, filter([])).nodes), []);
    assert.deepEqual(Object.keys(projectGraphByType(dag, filter([], "exclude")).nodes), Object.keys(dag.nodes));
  }),
  defineTest("selection complements preserve measured flows and historical relationships", () => {
    const selected = filter(["blue"], "exclude");
    for (const chart of ["timeline", "sankey", "spatial"] as const) {
      assert.equal(projectGraphByType(dag, selected, chart).edges.length, 0);
    }
    const projected = projectGraphByType(dag, selected, "node-link");
    assert.equal(projected.edges.length, 1);
    assert.equal(projected.edges[0].source, "a");
    assert.equal(projected.edges[0].target, "c");
    assert.equal(projected.edges[0].metadata?.projected, true);
    assert.equal(dag.edges.length, 2);
  }),
  defineTest("Nested filters preserve required containers and never escape focused scope", () => {
    const view = { collapsedGroupIds: [], focusGroupId: null };
    assert.deepEqual(
      projectCompoundGraph(dag, view, filter(["red"]))
        .items.map((item) => item.id)
        .sort(),
      ["a", "group"],
    );
    const focused = projectCompoundGraph(dag, { ...view, focusGroupId: "group" }, filter(["green"], "exclude"));
    assert.deepEqual(
      focused.items.map((item) => item.id),
      ["a", "b"],
    );
    assert.deepEqual(
      focused.edges.flatMap((edge) => edge.originalEdgeIds),
      ["ab"],
    );
  }),
  defineTest("browser storage restores expansion and focus, isolates documents and drops deleted groups", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => data.get(key) ?? null,
          setItem: (key: string, value: string) => data.set(key, value),
        },
      },
    });
    try {
      const key = compoundViewKey("document-a");
      saveCompoundView(key, { collapsedGroupIds: ["child", "deleted", "child"], focusGroupId: "parent" });
      assert.deepEqual(loadCompoundView(key, ["parent", "child"]), {
        collapsedGroupIds: ["child"],
        focusGroupId: "parent",
      });
      assert.deepEqual(loadCompoundView(key, ["child"]), { collapsedGroupIds: ["child"], focusGroupId: null });
      assert.deepEqual(loadCompoundView(compoundViewKey("document-b"), ["parent"]), {
        collapsedGroupIds: ["parent"],
        focusGroupId: null,
      });
      data.set(key, "corrupted");
      assert.deepEqual(loadCompoundView(key, ["parent"]), { collapsedGroupIds: ["parent"], focusGroupId: null });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        get() {
          throw new Error("blocked");
        },
      });
      assert.doesNotThrow(() => saveCompoundView(key, { collapsedGroupIds: [], focusGroupId: null }));
      assert.equal(loadCompoundView(key, ["parent"]).collapsedGroupIds[0], "parent");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
      else Reflect.deleteProperty(globalThis, "window");
    }
  }),
]);
