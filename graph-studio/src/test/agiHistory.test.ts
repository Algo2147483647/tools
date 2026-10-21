import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseNodeTimeline, parseTimelineDate } from "../graph/timeline";
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
      assert.equal(Object.keys(graph.nodes).length, 256);
      assert.equal(new Set(Object.values(graph.nodes).map((node: any) => node.track)).size, 13);
      assert.equal(graph.metadata.latestIncludedDate, "2026-10-09");
      assert.doesNotMatch(JSON.stringify(graph), /[\u3400-\u9fff]/);
      for (const [id, node] of Object.entries(graph.nodes) as [string, any][]) {
        assert.equal(parseNodeTimeline(node).status, "dated", id);
        assert.deepEqual(Object.keys(node.time), node.time.at ? ["at"] : ["start", "end"]);
        for (const date of Object.values(node.time) as string[]) {
          assert.match(date, /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);
          assert.ok(date <= graph.metadata.compiledAsOf);
        }
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
    assert.equal(edges.length, 484);
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
  defineTest(
    "project durations and overlapping phases retain honest boundaries and local milestone anchors",
    async () => {
      const graph = await read();
      const intervals = Object.entries(graph.nodes).filter(([, node]: [string, any]) => node.time.start);
      assert.equal(intervals.length, 25);
      assert.equal(Object.values(graph.nodes).filter((node: any) => node.time.at).length, 231);
      assert.equal(intervals.filter(([, node]: [string, any]) => node.type === "Research program").length, 5);
      assert.equal(intervals.filter(([, node]: [string, any]) => node.type === "Research phase").length, 20);
      assert.equal(new Set(intervals.map(([, node]: [string, any]) => node.track)).size, 13);
      for (const [id, raw] of intervals) {
        const node = raw as any;
        const time = parseNodeTimeline(node);
        assert.ok(time.status === "dated");
        assert.ok(time.start < time.end, id);
        assert.ok(node.intervalBasis && node.precision);
        if (node.type === "Research phase") {
          assert.match(node.evidenceType, /Editorial synthesis/);
          assert.match(node.precision, /not a field-wide founding or termination date/);
          for (const milestone of node.milestones) {
            const edge = graph.edges.find((e: any) => e.source === id && e.target === milestone);
            assert.equal(edge?.metadata.timeline.kind, "part-of");
            const anchor = parseTimelineDate(edge.metadata.timeline.sourceTime)!.timestamp;
            const member = parseNodeTimeline(graph.nodes[milestone]);
            assert.ok(member.status === "dated");
            assert.ok(anchor >= time.start && anchor <= time.end, `${id}/${milestone}: within phase`);
            assert.equal(anchor, member.start, `${id}/${milestone}: actual milestone date`);
          }
        }
      }
      assert.deepEqual(graph.nodes.shakey.time, { start: "1966", end: "1972" });
      assert.deepEqual(graph.nodes["dartmouth-workshop"].time, { start: "1956-06", end: "1956-08" });
      assert.match(graph.nodes["dartmouth-workshop"].precision, /Approximate/);
      assert.deepEqual(graph.nodes["program-fgcs"].time, { start: "1982", end: "1992" });
      assert.equal(graph.nodes["deep-blue"].time.at, "1997-05-11");
      assert.match(graph.nodes["program-deep-blue"].precision, /not an asserted exact project shutdown/);
      assert.match(graph.nodes["phase-reasoning-agents"].precision, /evidence cutoff/);
    },
  ),
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
      for (const node of stage.nodes) {
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
        if (node.timeline?.kind === "range") assert.ok(node.timeline.endY > node.timeline.startY);
      }
      for (const edge of stage.edges) {
        for (const point of edge.points || []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        if (edge.timeline?.kind === "part-of" && edge.points?.length)
          assert.ok(Math.abs(edge.points[0].y - edge.points[edge.points.length - 1].y) < 1);
      }
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
    for (const file of ["README.md", "OVERVIEW.md", "CATALOG.md", "SOURCES.md", "PERIODS.md", "agi-history.style.json"])
      assert.ok(folder.files.has(`agi/${file}`), file);
    for (const code of "fscnprblaeivh") assert.ok(folder.files.has(`agi/notes/${code}.md`));
    const manifest = await read("graph-studio.workspace.json");
    assert.equal(manifest.metadata.nodeCount, 804);
    assert.equal(manifest.metadata.edgeCount, 1209);
    assert.equal(manifest.metadata.graphStats[path].nodeCount, 256);
    assert.equal(manifest.metadata.graphStats[path].edgeCount, 484);
    assert.equal(manifest.metadata.graphStats[path].intervalCount, 25);
  }),
]);
