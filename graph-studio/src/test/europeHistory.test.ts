import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseNodeTimeline, parseTimelineDate } from "../graph/timeline";
import { buildTimelineStage } from "../layout/timeline-layout";
import { timelineTimeToY } from "../layout/timeline-axis";
import { EXAMPLE_WORKSPACES } from "../workspace/examples";
import { defineSuite, defineTest } from "./harness";

const root = "public/examples/europe-history/";
const read = async (path: string) => JSON.parse(await readFile(root + path, "utf8"));

export const europeHistorySuite = defineSuite("欧洲历史独立时间画布", [
  defineTest("the corpus preserves original scripts, qualified dates, sources and point-first coverage", async () => {
    const graph = await read("europe-history.json");
    const manifest = await read("graph-studio.workspace.json");
    const dag = normalizeDagInput(graph);
    assert.equal(graph.id, "europe-history");
    assert.equal(Object.keys(dag.nodes).length, 598);
    assert.equal(dag.edges.length, 673);
    assert.equal(manifest.metadata.nodeCount, 598);
    assert.equal(manifest.metadata.edgeCount, 673);
    assert.equal(manifest.metadata.polityCount, 81);
    assert.deepEqual(manifest.graphs, ["europe-history.json"]);
    assert.ok(EXAMPLE_WORKSPACES.some((example) => example.id === "europe-history"));
    assert.equal(Object.values(graph.nodes).filter((node: any) => node.time.at).length, 585);
    assert.equal(Object.values(graph.nodes).filter((node: any) => node.time.end).length, 13);
    assert.deepEqual(graph.nodes["knossos-palace"].time, { at: "-001899" });
    assert.deepEqual(graph.nodes.augustus.time, { at: "-000026" });
    assert.equal(graph.nodes.bulgaria2026.time.at, "2026");
    assert.match(graph.nodes["knossos-palace"].define, /未释读/);
    assert.match(graph.nodes["rome-tradition"].precision, /传统/);
    assert.match(graph.nodes["period-hre"].define, /后世/);
    assert.match(graph.nodes.west476.define, /东|480/);
    assert.match(graph.nodes.february1917.precision, /公历三月/);
    assert.match(graph.nodes.october1917.precision, /11月7日/);
    assert.equal(graph.nodes.otto962.type, "Sacrum Romanum Imperium");
    assert.equal(graph.nodes.constantinople1261.type, "Ῥωμανία");
    assert.equal(graph.nodes.ukraine1991.type, "Україна");
    assert.match(graph.nodes.velvet1989.title, /Sametová.*Nežná/);
    assert.match(graph.nodes.sweden2024.define, /3月7日.*3月11日/);
    for (const [key, node] of Object.entries(dag.nodes)) {
      assert.equal(parseNodeTimeline(node).status, "dated", key);
      assert.match(String(node.define), /[\u4e00-\u9fff]/);
      assert.ok(String(node.precision));
      assert.ok((node.sources as string[]).length);
      for (const url of node.sources as string[]) {
        assert.equal(new URL(url).protocol, "https:");
        assert.ok(String(node.references).includes(url));
      }
      for (const value of Object.values(node.time as Record<string, string>)) {
        assert.equal(parseTimelineDate(value)!.precision, "year");
      }
    }
    assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
  }),
  defineTest("institution stages remain distinct and chronological branches form an acyclic graph", async () => {
    const graph = await read("europe-history.json");
    for (const [earlier, later] of [
      ["maastricht1992", "eu1993"],
      ["euro1999", "euro2002"],
      ["lisbon2007", "lisbon2009"],
      ["wall1989", "germanunity1990"],
      ["brexit2016", "brexit2020"],
      ["october1917", "ussr1922"],
    ]) {
      assert.ok(graph.nodes[earlier] && graph.nodes[later]);
      assert.notEqual(graph.nodes[earlier].time.at, graph.nodes[later].time.at);
    }
    assert.equal(graph.nodes["period-byz1"].time.end, "1204");
    assert.equal(graph.nodes["period-byz2"].time.start, "1261");
    const seen = new Set<string>(),
      active = new Set<string>();
    const next = new Map<string, string[]>();
    for (const edge of graph.edges) {
      assert.ok(graph.nodes[edge.source] && graph.nodes[edge.target]);
      assert.ok(edge.metadata.label);
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
    Object.keys(graph.nodes).forEach(visit);
    assert.equal(seen.size, 598);
    for (const source of ["stalingrad1943", "normandy1944", "period-ww2"]) {
      assert.ok(graph.edges.some((edge: any) => edge.source === source && edge.target === "victory1945"));
    }
    for (const target of ["frg1949", "gdr1949"]) {
      assert.ok(graph.edges.some((edge: any) => edge.source === "potsdam1945" && edge.target === target));
    }
  }),
  defineTest("the full canvas renders original-script points and period joins on actual time rows", async () => {
    const dag = normalizeDagInput(await read("europe-history.json"));
    const stage = buildTimelineStage({ dag, selection: { type: "full" } })!;
    assert.equal(stage.nodes.length, 598);
    assert.equal(stage.edges.length, 673);
    assert.equal(stage.warnings.length, 0);
    assert.equal(stage.timeline!.layout, "flow");
    assert.equal(stage.timeline!.axisMap!.mode, "adaptive");
    assert.ok(stage.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
    assert.ok(stage.edges.every((edge) => !/NaN|Infinity/.test(edge.path)));
    assert.ok(stage.nodes.every((node) => node.y === timelineTimeToY(stage.timeline!.axisMap!, node.timeline!.start!)));
    for (const [period, end] of [
      ["period-gdr", "germanunity1990"],
      ["period-byz1", "constantinople1204"],
      ["period-ussr", "ussrend1991"],
    ]) {
      assert.equal(stage.nodeMap[period].timeline!.endY, stage.nodeMap[end].timeline!.startY);
      assert.equal(stage.nodes.filter((node) => node.key === end).length, 1);
    }
  }),
]);
