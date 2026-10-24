import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseNodeTimeline, parseTimelineDate } from "../graph/timeline";
import { projectGraphByTimelineTrack } from "../graph/timelineView";
import { buildTimelineStage } from "../layout/timeline/layout";
import { discoverWorkspace } from "../workspace/discovery";
import { loadExampleWorkspace, EXAMPLE_WORKSPACES } from "../workspace/examples";
import { defineSuite, defineTest } from "./harness";

const root = "public/examples/space-history/";
const path = "mathematics-physics/mathematics-physics.json";
const read = async (file = path) => JSON.parse(await readFile(root + file, "utf8"));

export const scienceHistorySuite = defineSuite("Combined mathematics and physics history", [
  defineTest("both disciplines share one sourced point-event canvas separate from spaceflight", async () => {
    const graph = await read();
    const manifest = await read("graph-studio.workspace.json");
    assert.equal(graph.title, "History of Mathematics and Physics");
    assert.deepEqual(manifest.graphs, ["space-history.json", path, "agi/agi-history.json"]);
    assert.equal(manifest.defaultGraph, "space-history.json");
    assert.equal(manifest.metadata.nodeCount, 804);
    assert.equal(manifest.metadata.edgeCount, 1209);
    assert.equal(manifest.metadata.graphStats[path].nodeCount, 250);
    assert.equal(manifest.metadata.graphStats[path].edgeCount, 317);
    assert.match(EXAMPLE_WORKSPACES.find((item) => item.id === "space-history")!.detail, /804.*1209/);
    const disciplines = new Set<string>();
    for (const [id, node] of Object.entries(graph.nodes) as [string, any][]) {
      disciplines.add(node.discipline);
      assert.equal(parseNodeTimeline(node).status, "dated", id);
      assert.equal(parseTimelineDate(node.time.at)!.precision, "year");
      assert.deepEqual(Object.keys(node.time), ["at"], "no unnecessary era bars");
      assert.ok(node.define.length > 100 && node.precision.length > 30);
      assert.ok(node.sources.length && node.references && node.notes);
      for (const source of node.sources) assert.equal(new URL(source).protocol, "https:");
      let prose = JSON.stringify(node);
      for (const name of graph.metadata.nativeNameForms) prose = prose.split(name).join("");
      assert.doesNotMatch(
        prose,
        /[\u3400-\u9fff\u0400-\u04ff\u0600-\u06ff\u0900-\u0d7f]/,
        `${id}: English except registered personal names`,
      );
    }
    assert.deepEqual([...disciplines].sort(), ["Mathematics", "Mathematics and Physics", "Physics"]);
    assert.equal(new Set(Object.values(graph.nodes).map((n: any) => n.track)).size, 11);
    const dag = normalizeDagInput(graph);
    assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
  }),
  defineTest("dating and attribution separate proposals, discoveries, publications and verification", async () => {
    const { nodes } = await read();
    assert.equal(nodes["moscow-papyrus"].time.at, "-001849");
    assert.match(nodes["madhava"].precision, /later texts/i);
    assert.match(nodes["riemann-geometry"].precision, /1854.*1868/);
    assert.equal(nodes["fission-observation"].time.at, "1938");
    assert.equal(nodes["fission-explanation"].time.at, "1939");
    assert.match(nodes["fission-explanation"].fullTitle, /Lise Meitner.*Otto Robert Frisch/);
    assert.equal(nodes["symmetry-breaking"].time.at, "1964");
    assert.equal(nodes["higgs-observation"].time.at, "2012");
    assert.equal(nodes["gw-detection"].time.at, "2015");
    assert.equal(nodes["gw-announcement"].time.at, "2016");
    assert.match(nodes["wiles"].define, /1993.*repair/);
    assert.match(nodes["perelman"].define, /verification/);
    assert.match(nodes["parity-test"].title, /吳健雄/);
    assert.match(nodes["liu-hui"].title, /劉徽/);
    assert.match(nodes["bose"].title, /সত্যেন্দ্রনাথ বসু/);
    assert.match(nodes["sphere-eight"].title, /Марина Вязовська/);
    assert.equal(nodes["top-entanglement"].time.at, "2024");
  }),
  defineTest("specific mathematics-physics junctions remain acyclic and connected", async () => {
    const { nodes, edges } = await read();
    for (const [from, to] of [
      ["lagrange-variation", "lagrange-mechanics"],
      ["riemann-geometry", "general-relativity"],
      ["cayley-matrices", "matrix-mechanics"],
      ["lebesgue", "kolmogorov"],
      ["yang-mills", "donaldson"],
      ["quantum-hall", "tknn"],
      ["symmetry-breaking", "higgs-observation"],
    ]) {
      const edge = edges.find((e: any) => e.source === from && e.target === to);
      assert.ok(edge, `${from} -> ${to}`);
      assert.equal(edge.metadata.timeline.kind, "reference");
      assert.ok(edge.metadata.label.length > 30);
    }
    const seen = new Set<string>(),
      active = new Set<string>(),
      touched = new Set<string>();
    const next = new Map<string, string[]>();
    for (const edge of edges) {
      assert.ok(nodes[edge.source] && nodes[edge.target]);
      touched.add(edge.source);
      touched.add(edge.target);
      next.set(edge.source, [...(next.get(edge.source) || []), edge.target]);
    }
    function visit(id: string) {
      assert.ok(!active.has(id), `Cycle at ${id}`);
      if (seen.has(id)) return;
      active.add(id);
      for (const target of next.get(id) || []) visit(target);
      active.delete(id);
      seen.add(id);
    }
    Object.keys(nodes).forEach(visit);
    assert.equal(seen.size, 250);
    assert.equal(touched.size, 250);
  }),
  defineTest("the complete and filtered timelines lay out every original-script point", async () => {
    const dag = normalizeDagInput(await read());
    for (const view of [dag, projectGraphByTimelineTrack(dag, "Quantum theory and information")]) {
      const stage = buildTimelineStage({
        dag: view,
        selection: { type: "full" },
        timelineSettings: (await read("mathematics-physics/mathematics-physics.style.json")).style.timeline,
      })!;
      assert.ok(stage);
      assert.equal(stage.nodes.length, Object.keys(view.nodes).length);
      for (const node of stage.nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
      for (const edge of stage.edges)
        for (const point of edge.points || []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }),
  defineTest("the new canvas opens from the existing workspace with its guides available", async () => {
    const fetcher = (async (url: string) =>
      new Response(await readFile(root + url.split("/examples/space-history/")[1], "utf8"))) as typeof fetch;
    const folder = await loadExampleWorkspace("space-history", "/", fetcher);
    const workspace = await discoverWorkspace(folder, path);
    assert.equal(workspace.activePath, path);
    assert.equal(workspace.graphs.length, 3);
    assert.ok(workspace.graphs.every((graph) => !graph.error));
    for (const section of ["ancient", "earlyModern", "nineteenth", "foundations", "contemporary"]) {
      assert.ok(folder.files.has(`mathematics-physics/notes/${section}.md`));
      assert.ok(folder.files.has(`mathematics-physics/notes/${section}-catalog.md`));
    }
  }),
]);
