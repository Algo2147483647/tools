import assert from "node:assert/strict";
import { getDefaultFieldMapping } from "../graph/fieldMapping";
import { buildImportedDag } from "../graph/importMerge";
import { serializeDag } from "../graph/serialize";
import { defineSuite, defineTest } from "./harness";

export const importMergeSuite = defineSuite("import merge", [
  defineTest("merges JSON documents using one inferred field mapping", () => {
    const result = buildImportedDag([
      {
        name: "default.json",
        payload: {
          A: {
            title: "Alpha",
            children: { B: "edge_ab" },
          },
          B: {
            title: "Beta",
            parents: { A: "edge_ab" },
          },
        },
      },
      {
        name: "mapped.json",
        payload: {
          C: {
            label: "Gamma",
            next: { D: "edge_cd" },
          },
          D: {
            label: "Delta",
            prev: { C: "edge_cd" },
          },
        },
      },
    ], getDefaultFieldMapping());

    assert.equal(Object.keys(result.dag).length, 4);
    assert.deepEqual(result.dag.C.children, { D: "edge_cd" });
    assert.deepEqual(result.dag.D.parents, { C: "edge_cd" });
    assert.equal("next" in result.dag.C, false);
    assert.equal("prev" in result.dag.D, false);
    assert.deepEqual(serializeDag(result.dag, result.mapping).C, {
      title: "Gamma",
      children: { D: "edge_cd" },
      parents: {},
    });
  }),

  defineTest("renames later duplicate node keys and rewrites local relations", () => {
    const result = buildImportedDag([
      {
        name: "first.json",
        payload: {
          A: { children: { B: "edge_ab" } },
          B: { parents: { A: "edge_ab" } },
        },
      },
      {
        name: "second.json",
        payload: {
          A: { children: { C: "edge_ac" } },
          C: { parents: { A: "edge_ac" } },
        },
      },
    ], getDefaultFieldMapping());

    assert.equal(result.duplicateRenameCount, 1);
    assert.ok(result.dag.A);
    assert.ok(result.dag.A__second);
    assert.deepEqual(result.dag.A__second.children, { C: "edge_ac" });
    assert.deepEqual(result.dag.C.parents, { A__second: "edge_ac" });
  }),

  defineTest("reconciles parent-only and child-only relation declarations", () => {
    const result = buildImportedDag([
      {
        name: "relations.json",
        payload: {
          A: { children: { B: "edge_ab" } },
          B: { parents: { C: "edge_cb" } },
          C: {},
        },
      },
    ], getDefaultFieldMapping());

    assert.deepEqual(result.dag.A.children, { B: "edge_ab" });
    assert.deepEqual(result.dag.B.parents, { A: "edge_ab", C: "edge_cb" });
    assert.deepEqual(result.dag.C.children, { B: "edge_cb" });
  }),

  defineTest("keeps children relation labels when imported parents disagree", () => {
    const result = buildImportedDag([
      {
        name: "conflict.json",
        payload: {
          A: { children: { B: "child_label" } },
          B: { parents: { A: "parent_label" } },
        },
      },
    ], getDefaultFieldMapping());

    assert.deepEqual(result.dag.A.children, { B: "child_label" });
    assert.deepEqual(result.dag.B.parents, { A: "child_label" });
    assert.ok(result.warnings.some((warning) => warning.type === "relation-conflict"));
  }),

  defineTest("creates empty nodes for missing relation endpoints", () => {
    const result = buildImportedDag([
      {
        name: "missing.json",
        payload: {
          A: { children: { B: "edge_ab" } },
        },
      },
    ], getDefaultFieldMapping());

    assert.ok(result.dag.B);
    assert.deepEqual(result.dag.B.parents, { A: "edge_ab" });
    assert.ok(result.warnings.some((warning) => warning.type === "missing-relation-node"));
  }),
]);
