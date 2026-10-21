import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseNodeTimeline } from "../graph/timeline";
import { projectGraphByTimelineTrack } from "../graph/timelineView";
import { buildTimelineStage } from "../layout/timeline-layout";
import { discoverWorkspace } from "../workspace/discovery";
import { loadExampleWorkspace } from "../workspace/examples";
import { defineSuite, defineTest } from "./harness";

const root = "public/examples/space-history/";
const path = "agi/agi-history.json";
const read = async (file = path) => JSON.parse(await readFile(root + file, "utf8"));

export const agiHistorySuite = defineSuite("AGI research history", [
  defineTest(
    "the English corpus preserves evidence, limitations and date precision across thirteen strands",
    async () => {
      const graph = await read();
      assert.equal(graph.title, "History of AGI Research");
      assert.equal(Object.keys(graph.nodes).length, 233);
      assert.equal(new Set(Object.values(graph.nodes).map((node: any) => node.track)).size, 13);
      assert.equal(graph.metadata.latestIncludedDate, "2026-10-09");
      assert.doesNotMatch(JSON.stringify(graph), /[\u3400-\u9fff]/);
      for (const [id, node] of Object.entries(graph.nodes) as [string, any][]) {
        assert.equal(parseNodeTimeline(node).status, "dated", id);
        assert.deepEqual(Object.keys(node.time), ["at"]);
        assert.match(node.time.at, /^\d{4}(?:-\d{2}-\d{2})?$/);
        assert.ok(node.time.at <= graph.metadata.compiledAsOf);
        for (const field of ["define", "significance", "limitation", "precision"])
          assert.ok(node[field].length > 35, `${id}: ${field}`);
        assert.ok(node.contributors && node.notes && node.evidenceType && node.sources.length);
        for (const source of node.sources) {
          assert.equal(new URL(source).protocol, "https:");
          assert.ok(node.references.includes(source));
        }
      }
      assert.equal(graph.nodes.leibniz.time.at, "1666");
      assert.match(graph.nodes.good.precision, /1965.*1966/);
      assert.match(graph.nodes.kolmogorov.precision, /1965.*1968/);
      assert.equal(graph.nodes["sleeper-agents"].time.at, "2024-01-10");
      assert.equal(graph.nodes["alignment-faking"].time.at, "2024-12-18");
      const dag = normalizeDagInput(graph);
      assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
    },
  ),
  defineTest("historical connections are distinct, connected and acyclic", async () => {
    const { nodes, edges, metadata } = await read();
    assert.equal(edges.length, 368);
    assert.equal(new Set(edges.map((edge: any) => `${edge.source}\0${edge.target}`)).size, edges.length);
    const next = new Map<string, string[]>();
    const neighbors = new Map<string, string[]>();
    for (const edge of edges) {
      assert.ok(nodes[edge.source] && nodes[edge.target]);
      assert.ok(metadata.edgeSemantics[edge.metadata.timeline.kind]);
      assert.ok(edge.metadata.label.length > 25 && edge.metadata.sources.length > 0);
      next.set(edge.source, [...(next.get(edge.source) || []), edge.target]);
      neighbors.set(edge.source, [...(neighbors.get(edge.source) || []), edge.target]);
      neighbors.set(edge.target, [...(neighbors.get(edge.target) || []), edge.source]);
    }
    const seen = new Set<string>(),
      active = new Set<string>();
    function visit(id: string) {
      assert.ok(!active.has(id), `Cycle at ${id}`);
      if (seen.has(id)) return;
      active.add(id);
      for (const target of next.get(id) || []) visit(target);
      active.delete(id);
      seen.add(id);
    }
    Object.keys(nodes).forEach(visit);
    const connected = new Set<string>(),
      pending = [Object.keys(nodes)[0]];
    while (pending.length) {
      const id = pending.pop()!;
      if (connected.has(id)) continue;
      connected.add(id);
      pending.push(...(neighbors.get(id) || []));
    }
    assert.equal(connected.size, Object.keys(nodes).length);
    for (const [source, target, kind] of [
      ["attention", "transformer", "dependency"],
      ["deepseek-v3", "deepseek-r1", "dependency"],
      ["cot", "react", "dependency"],
      ["causality", "v-jepa2", "reference"],
      ["arc2", "arc3", "dependency"],
    ]) {
      const edge = edges.find((item: any) => item.source === source && item.target === target);
      assert.equal(edge?.metadata.timeline.kind, kind, `${source} -> ${target}`);
    }
  }),
  defineTest("the complete timeline and every individual strand have finite layouts", async () => {
    const graph = await read();
    const dag = normalizeDagInput(graph);
    const style = await read("agi/agi-history.style.json");
    assert.equal(style.chartType, "timeline");
    const tracks = [...new Set(Object.values(graph.nodes).map((node: any) => node.track as string))];
    for (const view of [dag, ...tracks.map((track) => projectGraphByTimelineTrack(dag, track))]) {
      const stage = buildTimelineStage({
        dag: view,
        selection: { type: "full" },
        timelineSettings: style.style.timeline,
      })!;
      assert.ok(stage);
      assert.equal(stage.nodes.length, Object.keys(view.nodes).length);
      for (const node of stage.nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
      for (const edge of stage.edges)
        for (const point of edge.points || []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }),
  defineTest("History of Technology loads all three canvases and the complete AGI reading collection", async () => {
    const fetcher = (async (url: string) =>
      new Response(await readFile(root + url.split("/examples/space-history/")[1], "utf8"))) as typeof fetch;
    const folder = await loadExampleWorkspace("space-history", "/", fetcher);
    const workspace = await discoverWorkspace(folder, path);
    assert.equal(workspace.activePath, path);
    assert.equal(workspace.graphs.length, 3);
    assert.ok(workspace.graphs.every((graph) => !graph.error));
    for (const file of ["README.md", "OVERVIEW.md", "CATALOG.md", "SOURCES.md", "agi-history.style.json"])
      assert.ok(folder.files.has(`agi/${file}`), file);
    for (const code of "fscnprblaeivh") assert.ok(folder.files.has(`agi/notes/${code}.md`));
    const manifest = await read("graph-studio.workspace.json");
    assert.equal(manifest.metadata.nodeCount, 781);
    assert.equal(manifest.metadata.edgeCount, 1093);
    assert.equal(manifest.metadata.graphStats[path].nodeCount, 233);
    assert.equal(manifest.metadata.graphStats[path].edgeCount, 368);
  }),
]);
