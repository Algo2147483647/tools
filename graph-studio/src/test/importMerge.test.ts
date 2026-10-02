import assert from "node:assert/strict";
import { type ImportGraphDocument, type ImportResolutions, analyzeGraphImport } from "../graph/importMerge";
import { createGraphDocument } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { defineSuite, defineTest } from "./harness";
function resolvedImport(documents: ImportGraphDocument[], resolutions: ImportResolutions = {}) {
  const analysis = analyzeGraphImport(documents, resolutions);
  assert.equal(analysis.unresolved.length, 0, "All import conflicts must be resolved.");
  return analysis;
}
const doc = (
  nodes: Record<string, Record<string, unknown>>,
  edges: Parameters<typeof createGraphDocument>[1] = [],
  metadata?: Record<string, unknown>,
) => {
  const value = serializeDag(createGraphDocument(nodes, edges));
  if (metadata) value.metadata = metadata;
  return value;
};
const pair = () => [
  {
    name: "first.json",
    payload: doc({ A: { title: "First", left: 1 }, B: {} }, [{ id: "ab", source: "A", target: "B", value: "old" }]),
  },
  {
    name: "second.json",
    payload: doc({ A: { title: "Second", right: 2 }, C: {} }, [{ id: "ac", source: "A", target: "C", value: "new" }]),
  },
];
export const importMergeSuite = defineSuite("conflict-aware v2 import", [
  defineTest("analysis reports both values without mutating input or implicitly resolving", () => {
    const input = pair();
    const before = structuredClone(input);
    const analysis = analyzeGraphImport(input);
    assert.equal(analysis.unresolved.length, 1);
    assert.equal(analysis.conflicts[0].path, "/nodes/A");
    assert.deepEqual(input, before);
  }),
  defineTest("keep only discards incoming node fields after an explicit choice", () => {
    const input = pair();
    const conflict = analyzeGraphImport(input).conflicts[0];
    const result = resolvedImport(input, { [conflict.id]: { strategy: "keep" } });
    assert.equal(result.dag.nodes.A.title, "First");
    assert.equal(result.dag.nodes.A.right, undefined);
    assert.equal(result.dag.edges.length, 2);
  }),
  defineTest("rename preserves both nodes and rewrites incoming edge references", () => {
    const input = pair();
    const conflict = analyzeGraphImport(input).conflicts[0];
    const result = resolvedImport(input, { [conflict.id]: { strategy: "rename", name: "A_second" } });
    assert.equal(result.dag.nodes.A.title, "First");
    assert.equal(result.dag.nodes.A_second.title, "Second");
    assert.equal(result.dag.edges.find((e) => e.id === "ac")?.source, "A_second");
  }),
  defineTest("merge preserves complementary fields and asks again for scalar conflicts", () => {
    const input = pair();
    const conflict = analyzeGraphImport(input).conflicts[0];
    const choices: ImportResolutions = { [conflict.id]: { strategy: "merge" } };
    const second = analyzeGraphImport(input, choices);
    assert.equal(second.unresolved.length, 1);
    assert.equal(second.unresolved[0].path, "/nodes/A/title");
    assert.equal(second.unresolved[0].canMerge, false);
    choices[second.unresolved[0].id] = { strategy: "rename", name: "importedTitle" };
    const result = resolvedImport(input, choices).dag;
    assert.equal(result.nodes.A.title, "First");
    assert.equal(result.nodes.A.importedTitle, "Second");
    assert.equal(result.nodes.A.left, 1);
    assert.equal(result.nodes.A.right, 2);
  }),
  defineTest("nested metadata merges and array unions preserve values and source headers", () => {
    const input = [
      {
        name: "one.json",
        payload: { ...doc({ A: {} }, [], { info: { left: 1 }, tags: ["x"] }), title: "One", id: "one" },
      },
      {
        name: "two.json",
        payload: { ...doc({ B: {} }, [], { info: { right: 2 }, tags: ["y"] }), title: "Two", id: "two" },
      },
    ];
    const choices: ImportResolutions = {};
    for (const c of analyzeGraphImport(input).conflicts) choices[c.id] = { strategy: c.canMerge ? "merge" : "rename" };
    const result = resolvedImport(input, choices).dag;
    assert.deepEqual(result.metadata?.info, { left: 1, right: 2 });
    assert.deepEqual(result.metadata?.tags, ["x", "y"]);
    assert.deepEqual(
      (result.metadata?.importSources as Array<{ title: string }>).map((s) => s.title),
      ["One", "Two"],
    );
    assert.equal(result.title, "One");
    assert.equal(result.metadata?.title__import_2, "Two");
  }),
  defineTest("edge ID conflicts require a decision and can rename distinct endpoint pairs", () => {
    const input = [
      { name: "one", payload: doc({ A: {}, B: {} }, [{ id: "e", source: "A", target: "B", value: 1 }]) },
      { name: "two", payload: doc({ C: {}, D: {} }, [{ id: "e", source: "C", target: "D", value: 2 }]) },
    ];
    const c = analyzeGraphImport(input).conflicts[0];
    assert.equal(c.kind, "edge");
    const result = resolvedImport(input, { [c.id]: { strategy: "rename", name: "e2" } });
    assert.deepEqual(
      result.dag.edges.map((e) => e.id),
      ["e", "e2"],
    );
  }),
  defineTest("parallel endpoint payload conflicts require explicit choices", () => {
    const input = [
      { name: "one", payload: doc({ A: {}, B: {} }, [{ id: "e", source: "A", target: "B", value: null }]) },
      {
        name: "two",
        payload: doc({ A: {}, B: {} }, [
          { id: "other", source: "A", target: "B", value: "x", metadata: { source: "two" } },
        ]),
      },
    ];
    const c = analyzeGraphImport(input).conflicts[0];
    assert.equal(c.canRename, false);
    const choices: ImportResolutions = { [c.id]: { strategy: "merge" } };
    const valueConflict = analyzeGraphImport(input, choices).unresolved[0];
    choices[valueConflict.id] = { strategy: "rename" };
    const result = resolvedImport(input, choices).dag;
    assert.equal(result.edges[0].value, null);
    assert.equal(result.edges[0].metadata?.source, "two");
    assert.equal(result.edges[0].metadata?.value__import_2, "x");
  }),
  defineTest("reserved or colliding rename targets and unknown formats block import", () => {
    const input = pair();
    const c = analyzeGraphImport(input).conflicts[0];
    assert.throws(() => resolvedImport(input, { [c.id]: { strategy: "rename", name: "B" } }), /already exists/);
    assert.throws(() => analyzeGraphImport([{ name: "bad.json", payload: { A: {} } }]), /bad.json.*Unsupported/);
  }),
  defineTest("three-way imports require resolving each later collision", () => {
    const input = [...pair(), { name: "third", payload: doc({ A: { title: "Third" } }) }];
    const a = analyzeGraphImport(input);
    assert.equal(a.unresolved.length, 2);
    const choices: ImportResolutions = Object.fromEntries(a.conflicts.map((c) => [c.id, { strategy: "rename" }]));
    const result = resolvedImport(input, choices).dag;
    assert.equal(Object.keys(result.nodes).length, 5);
  }),
]);
