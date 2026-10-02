import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { findRootsFromDag, getInitialSelection } from "../graph/selectors";
import { buildStageData } from "../layout/stage-layout";
import type { StageData } from "../layout/types";
import { discoverWorkspace } from "../workspace/discovery";
import { EXAMPLE_WORKSPACES, loadExampleWorkspace } from "../workspace/examples";
import { defineSuite, defineTest } from "./harness";

const root = "public/examples/mathematics/";
const subjects = [
  "complex-analysis",
  "real-analysis",
  "functional-analysis",
  "group-theory",
  "number-theory",
  "probability-theory",
  "set-theory-logic",
  "topology",
  "differential-geometry",
  "algebraic-geometry",
];
async function graph(name: string) {
  return normalizeDagInput(JSON.parse(await readFile(`${root}${name}.json`, "utf8")));
}

export const mathematicsSuite = defineSuite("Mathematics curriculum", [
  defineTest("ten subject views share one corpus and retain all internal prerequisite edges", async () => {
    const full = await graph("all-mathematics");
    const manifest = JSON.parse(await readFile(`${root}graph-studio.workspace.json`, "utf8"));
    assert.equal(manifest.defaultGraph, "mathematics.json");
    assert.deepEqual(manifest.graphs, [
      "mathematics.json",
      ...subjects.map((s) => `${s}.json`),
      "all-mathematics.json",
    ]);
    const owned = new Set<string>();
    for (const subject of subjects) {
      const view = await graph(subject);
      let localCount = 0;
      for (const [id, node] of Object.entries(view.nodes)) {
        assert.ok(full.nodes[id], `${subject}: ${id} must occur in complete atlas`);
        assert.deepEqual({ ...node }, { ...full.nodes[id] }, `${id}: shared mathematical content must agree`);
        if (node.kind === "Subject guide") continue;
        assert.equal(node.type, view.nodes[`subject.${subject}`].type, `${id}: only local concepts on the canvas`);
        assert.ok(!owned.has(id), `${id}: one home subject only`);
        owned.add(id);
        localCount++;
        const expectedEdges = full.edges.filter((edge) => edge.target === id && view.nodes[edge.source]);
        assert.deepEqual(
          view.edges.filter((edge) => edge.target === id),
          expectedEdges,
        );
        for (const edge of expectedEdges) assert.ok(view.nodes[edge.source]);
      }
      assert.equal(localCount, view.metadata!.localConceptCount);
    }
    assert.equal(owned.size, manifest.metadata.conceptCount);
    assert.equal(Object.keys(full.nodes).length, owned.size + subjects.length + 1);
    const overview = await graph("mathematics");
    assert.equal(Object.keys(overview.nodes).length, subjects.length + 1);
    assert.equal(overview.metadata!.conceptCount, owned.size);
    assert.equal(EXAMPLE_WORKSPACES[0].detail, `${owned.size} concepts · ${subjects.length} subjects`);
  }),
  defineTest(
    "external prerequisites stay linked in details and notes and connected in the complete atlas",
    async () => {
      const full = await graph("all-mathematics");
      const crossEdges = full.edges.filter(
        (edge) => edge.value === "prerequisite" && full.nodes[edge.source].type !== full.nodes[edge.target].type,
      );
      assert.ok(crossEdges.length > 0, "The complete atlas must retain cross-subject dependencies");
      for (const subject of subjects) {
        const view = await graph(subject);
        const external = new Set<string>();
        for (const [id, node] of Object.entries(view.nodes)) {
          if (node.kind === "Subject guide") continue;
          const expected = crossEdges
            .filter((edge) => edge.target === id)
            .map((edge) => edge.source)
            .sort();
          expected.forEach((source) => external.add(source));
          const details = String(node.prerequisites).split("**From other subjects**")[1] ?? "";
          const note = await readFile(`${root}notes/${id}.md`, "utf8");
          const noteSection = note.split("**From other subjects**")[1]?.split("\n## ")[0] ?? "";
          assert.deepEqual(
            [...details.matchAll(/\]\(\.\/notes\/([a-z]+\.[a-z-]+)\.md\)/g)].map((match) => match[1]).sort(),
            expected,
            `${id}: details must retain every external prerequisite`,
          );
          assert.deepEqual(
            [...noteSection.matchAll(/\]\(\.\/([a-z]+\.[a-z-]+)\.md\)/g)].map((match) => match[1]).sort(),
            expected,
            `${id}: study note must retain every external prerequisite`,
          );
        }
        assert.equal(external.size, view.metadata!.externalPrerequisiteCount);
        for (const id of external) assert.ok(!view.nodes[id], `${id}: external prerequisite stays off the canvas`);
      }
    },
  ),
  defineTest("theorems retain assumptions, examples, proof ideas and linked study notes", async () => {
    const full = await graph("all-mathematics");
    let theorems = 0;
    for (const [id, node] of Object.entries(full.nodes)) {
      if (node.kind === "Navigation" || node.kind === "Subject guide") continue;
      const note = await readFile(`${root}notes/${id}.md`, "utf8");
      for (const field of ["define", "statement", "hypotheses", "example", "caution"] as const) {
        assert.equal(typeof node[field], "string");
        assert.ok(note.includes(String(node[field])), `${id}: note must contain ${field}`);
      }
      assert.match(String(node.references), /https:\/\//);
      assert.doesNotMatch(String(node.define), /[$\\]/, `${id}: canvas caption must not lose inline mathematics`);
      assert.doesNotMatch(String(node.references), /undefined/);
      assert.match(note, /## Reference reading/);
      if (node.kind === "Theorem") {
        theorems++;
        assert.ok(String(node.proof_idea).length > 30, `${id}: substantive proof idea`);
        assert.ok(note.includes(String(node.proof_idea)));
      }
    }
    assert.ok(theorems > 80, "The corpus must contain substantial theorem-level material");
  }),
  defineTest("each graph opens at a single root and both layouts retain every node and edge", async () => {
    for (const name of ["mathematics", ...subjects, "all-mathematics"]) {
      const dag = await graph(name);
      const entry = subjects.includes(name) ? `subject.${name}` : "mathematics";
      assert.deepEqual(findRootsFromDag(dag), [entry], `${name}: one entry point`);
      const selection = getInitialSelection(dag);
      assert.deepEqual(selection, { type: "node", key: entry });
      for (const layoutMode of ["dagre", "sugiyama"] as const) {
        const stage: StageData | null = buildStageData({ dag, selection, layoutMode });
        assert.ok(stage, `${name}/${layoutMode}: initial selection must produce a layout`);
        assert.equal(stage.nodes.length, Object.keys(dag.nodes).length, `${name}/${layoutMode}: no hidden branches`);
        assert.equal(stage.edges.length, dag.edges.length);
        assert.ok(stage.nodes.every((node) => [node.x, node.y, node.height].every(Number.isFinite)));
        assert.ok(stage.edges.every((edge) => !/NaN|Infinity/.test(edge.path)));
      }
    }
  }),
  defineTest("obsolete Mathematics recent paths reopen the new overview", async () => {
    const fetcher = (async (url: string) => {
      const file = url.split("/examples/mathematics/")[1];
      return new Response(await readFile(root + file, "utf8"));
    }) as typeof fetch;
    const folder = await loadExampleWorkspace("mathematics", "/", fetcher);
    for (const oldPath of [
      "analysis.json",
      "algebra.json",
      "geometry.json",
      "mathematical-logic-and-foundations.json",
    ]) {
      const workspace = await discoverWorkspace(folder, oldPath);
      assert.equal(workspace.activePath, "mathematics.json");
      assert.ok(workspace.graphs.every((entry) => !entry.error));
      assert.ok(!folder.files.has(oldPath));
    }
    assert.ok(!folder.files.has("notes/Set.md"));
  }),
]);
