import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseNodeTimeline, parseTimelineDate } from "../graph/timeline";
import { buildTimelineStage } from "../layout/timeline-layout";
import { timelineTimeToY } from "../layout/timeline-axis";
import { discoverWorkspace } from "../workspace/discovery";
import { EXAMPLE_WORKSPACES, loadExampleWorkspace } from "../workspace/examples";
import { defineSuite, defineTest } from "./harness";

const root = "public/examples/china-history/";
const read = async (path: string) => JSON.parse(await readFile(root + path, "utf8"));

export const chinaHistorySuite = defineSuite("中国历史时间线示例", [
  defineTest("the Chinese corpus retains BCE/year precision, qualified periods and source attribution", async () => {
    const graph = await read("china-history.json");
    const manifest = await read("graph-studio.workspace.json");
    const dag = normalizeDagInput(graph);
    assert.equal(Object.keys(dag.nodes).length, 192);
    assert.equal(dag.edges.length, 248);
    assert.equal(manifest.metadata.language, "zh-CN");
    assert.equal(manifest.metadata.nodeCount, Object.keys(dag.nodes).length);
    assert.equal(manifest.metadata.edgeCount, dag.edges.length);
    assert.equal(new Set(Object.values(dag.nodes).map((node) => node.type)).size, 61);
    assert.equal(graph.nodes["bi-sheng"].type, "北宋");
    assert.equal(graph.nodes["bi-sheng"].theme, "technology");
    assert.equal(graph.nodes["feishui"].type, "东晋");
    assert.deepEqual(graph.nodes["feishui"].participants, ["东晋", "前秦"]);
    assert.equal(graph.nodes["qing"].time.start, "1636");
    assert.equal(graph.nodes["huang-chao"].time.at, "0881");
    assert.equal(manifest.metadata.polityCount, 61);
    for (const id of [
      "cao-wei",
      "shu-han",
      "eastern-wu",
      "min",
      "ma-chu",
      "southern-han",
      "jingnan",
      "dali",
      "southern-ming",
      "zheng-taiwan",
    ])
      assert.ok(graph.nodes[id]);
    assert.equal(graph.nodes["qin-unification"].time.at, "-000220");
    assert.equal(graph.nodes["cai-lun"].time.at, "0105");
    assert.equal(graph.nodes["prc"].time.at, "1949-10-01");
    assert.deepEqual(graph.nodes["republic"].time, { at: "1912-01-01" });
    assert.match(graph.nodes["bi-sheng"].precision, /年代范围/);
    assert.match(graph.nodes["resistance"].title, /全面/);
    for (const [key, node] of Object.entries(dag.nodes)) {
      const time = parseNodeTimeline(node);
      assert.equal(time.status, "dated", `${key}: valid timeline date`);
      assert.match(String(node.title), /[\u4e00-\u9fff]/);
      assert.match(String(node.define), /[\u4e00-\u9fff]/);
      const urls = node.sources as string[];
      assert.ok(urls.length > 0);
      for (const url of urls) {
        assert.equal(new URL(url).protocol, "https:");
        assert.ok(String(node.references).includes(url));
      }
      for (const value of Object.values(node.time as Record<string, string>)) {
        const parsed = parseTimelineDate(value)!;
        assert.ok(parsed);
        assert.equal(parsed.precision, value.length === 10 ? "date" : "year");
      }
    }
    assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
  }),
  defineTest("branches and cross-category joins preserve one event and its actual timestamp", async () => {
    const dag = normalizeDagInput(await read("china-history.json"));
    const stage = buildTimelineStage({ dag, selection: { type: "full" } })!;
    assert.equal(stage.timeline!.layout, "flow");
    assert.equal(stage.timeline!.axisMap!.mode, "adaptive");
    assert.equal(stage.nodes.length, 192);
    assert.equal(stage.edges.length, 248);
    assert.equal(stage.warnings.length, 0);
    assert.ok(stage.stageWidth < 1800, "the expanded relation flow remains compact");
    assert.ok(stage.edges.every((edge) => !/NaN|Infinity/.test(edge.path)));
    assert.ok(stage.nodes.every((node) => node.timeline!.status === "dated"));
    for (const target of ["eastern-wei", "western-wei"]) {
      assert.ok(dag.edges.some((edge) => edge.source === "northern-wei" && edge.target === target));
    }
    for (const source of ["sui", "chen"]) {
      assert.ok(dag.edges.some((edge) => edge.source === source && edge.target === "sui-unification"));
      if (source === "chen") assert.notEqual(dag.nodes[source].type, dag.nodes["sui-unification"].type);
    }
    assert.equal(stage.nodes.filter((node) => node.key === "sui-unification").length, 1);
    assert.equal(stage.nodeMap["chen"].timeline!.endY, stage.nodeMap["sui-unification"].timeline!.startY);
    assert.equal(stage.nodeMap["qin"].timeline!.startY, stage.nodeMap["qin-unification"].timeline!.startY);
    assert.equal(stage.nodeMap["northern-song"].timeline!.endY, stage.nodeMap["jingkang"].timeline!.startY);
    assert.equal(stage.nodeMap["southern-song"].timeline!.startY, stage.nodeMap["jingkang"].timeline!.startY);
    const timestamp = (value: string) => parseTimelineDate(value)!.timestamp;
    const linear = buildTimelineStage({ dag, selection: { type: "full" }, timelineSettings: { axis: "linear" } })!;
    const share = (view: typeof stage, a: string, b: string) => {
      const map = view.timeline!.axisMap!;
      return (timelineTimeToY(map, timestamp(b)) - timelineTimeToY(map, timestamp(a))) / map.height;
    };
    assert.ok(share(stage, "1911", "1913") > share(linear, "1911", "1913"), "dense modern years expand");
  }),
  defineTest("the gallery opens the Chinese timeline and exposes its source and theme notes", async () => {
    const fetcher = (async (url: string) =>
      new Response(await readFile(root + url.split("/examples/china-history/")[1], "utf8"))) as typeof fetch;
    const folder = await loadExampleWorkspace("china-history", "/", fetcher);
    const workspace = await discoverWorkspace(folder);
    assert.equal(workspace.activePath, "china-history.json");
    assert.equal(workspace.graphs.length, 1);
    assert.equal(workspace.graphs[0].error, undefined);
    assert.equal(workspace.graphs[0].nodeCount, 192);
    assert.ok(folder.files.has("SOURCES.md"));
    assert.ok(folder.files.has("notes/technology.md"));
    assert.match(EXAMPLE_WORKSPACES.find((example) => example.id === "china-history")!.detail, /^192/);
  }),
]);
