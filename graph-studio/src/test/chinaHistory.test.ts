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
    assert.equal(Object.keys(dag.nodes).length, 1273);
    assert.equal(dag.edges.length, 2322);
    assert.equal(manifest.metadata.language, "zh-CN");
    assert.equal(manifest.metadata.graphStats["china-history.json"].nodeCount, Object.keys(dag.nodes).length);
    assert.equal(manifest.metadata.graphStats["china-history.json"].edgeCount, dag.edges.length);
    assert.equal(new Set(Object.values(dag.nodes).map((node) => node.type)).size, 109);
    assert.equal(graph.nodes["bi-sheng"].type, "北宋");
    assert.equal(graph.nodes["bi-sheng"].theme, "technology");
    assert.equal(graph.nodes["feishui"].type, "东晋");
    assert.deepEqual(graph.nodes["feishui"].participants, ["东晋", "前秦"]);
    assert.equal(graph.nodes["qing"].time.start, "1636");
    assert.equal(graph.nodes["huang-chao"].time.at, "0881");
    assert.equal(manifest.metadata.graphStats["china-history.json"].polityCount, 109);
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
      for (const value of Object.values(node.time as Record<string, string | null>)) {
        if (value === null) continue;
        const parsed = parseTimelineDate(value)!;
        assert.ok(parsed);
        assert.equal(parsed.precision, value.length === 10 ? "date" : "year");
      }
    }
    assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
  }),
  defineTest("branches and cross-category joins preserve one event and its actual timestamp", async () => {
    const dag = normalizeDagInput(await read("china-history.json"));
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: (await read("china-history.style.json")).style.timeline,
    })!;
    assert.equal(stage.timeline!.layout, "flow");
    assert.equal(stage.timeline!.axisMap!.mode, "adaptive");
    assert.equal(stage.nodes.length, 1273);
    assert.equal(stage.edges.length, 2322);
    assert.equal(stage.warnings.length, 0);
    assert.ok(
      stage.nodes.every((node) => node.y === timelineTimeToY(stage.timeline!.axisMap!, node.timeline!.start!)),
      "markers preserve time rows independently of text",
    );
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
    const linear = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: { ...(await read("china-history.style.json")).style.timeline, axis: "linear" },
    })!;
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
    assert.equal(workspace.graphs.length, 2);
    assert.equal(workspace.graphs[0].error, undefined);
    assert.equal(workspace.graphs[0].nodeCount, 1273);
    assert.ok(folder.files.has("SOURCES.md"));
    assert.ok(folder.files.has("notes/technology.md"));
    assert.ok(folder.files.has("notes/early-china.md"));
    assert.ok(folder.files.has("notes/early-catalog.md"));
    assert.ok(folder.files.has("notes/pre-zhou.md"));
    assert.ok(folder.files.has("notes/pre-zhou-catalog.md"));
    assert.ok(folder.files.has("notes/pre-zhou-sources.md"));
    assert.match(EXAMPLE_WORKSPACES.find((example) => example.id === "china-history")!.detail, /^2 timelines/);
    assert.match(EXAMPLE_WORKSPACES.find((example) => example.id === "china-history")!.detail, /c\. 1900 BCE/);
  }),
  defineTest("pre-Zhou archaeology remains qualified and joins the existing Eastern Zhou chronology", async () => {
    const graph = await read("china-history.json");
    assert.equal(graph.metadata.supplements.preZhou.addedNodes, 66);
    assert.equal(graph.nodes.erlitou.type, "二里头遗址");
    assert.deepEqual(graph.nodes.erlitou.time, { start: "-001749", end: "-001519" });
    assert.match(graph.nodes.erlitou.precision, /方案/);
    assert.match(graph.nodes.erlitou.define, /不将其认定/);
    assert.equal(graph.nodes["wei-kangshu"].type, "卫国");
    assert.equal(graph.nodes["wei-state"].type, "魏国");
    assert.equal(graph.nodes["zhou-revolt841"].time.at, "-000840");
    assert.equal(graph.nodes["western-zhou-fall"].time.at, "-000770");
    assert.equal(graph.nodes["zhou-east"].time.at, "-000769");
    assert.match(graph.nodes.gonghe.define, /周召.*共伯和/);
    assert.match(graph.nodes["jinsha-ritual"].precision, /771不是遗址终止年/);
    assert.match(graph.nodes["muye"].precision, /争议/);
    assert.ok(
      !Object.values(graph.nodes).some((node: any) => ["夏", "夏朝", "旧石器时代", "新石器时代"].includes(node.type)),
    );
    const dag = normalizeDagInput(graph);
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: (await read("china-history.style.json")).style.timeline,
    })!;
    for (const [source, target] of [
      ["shang-period", "muye"],
      ["western-zhou", "western-zhou-fall"],
    ]) {
      const edge = dag.edges.find((item) => item.source === source && item.target === target)!;
      assert.equal((edge.metadata!.timeline as { kind: string }).kind, "rendezvous");
      assert.equal(stage.nodeMap[source].timeline!.endY, stage.nodeMap[target].timeline!.startY);
    }
    assert.ok(dag.edges.some((edge) => edge.source === "western-zhou-fall" && edge.target === "zhou-east"));
    assert.ok(!dag.edges.some((edge) => edge.source === "wei-kangshu" && edge.target === "wei-state"));
    for (const edge of graph.edges.filter((edge: any) => edge.id.startsWith("pre-zhou:"))) {
      const source = graph.nodes[edge.source];
      const target = graph.nodes[edge.target];
      const relation = edge.metadata.timeline;
      const from =
        relation.sourceTime ||
        (relation.sourceAnchor === "end" ? source.time.end : source.time.at || source.time.start);
      const to = target.time.at || target.time.start;
      assert.ok(Number(from) <= Number(to), edge.id);
      if (relation.kind === "part-of") {
        assert.ok(Number(source.time.start) <= Number(from) && Number(from) <= Number(source.time.end));
      }
    }
  }),
  defineTest("early history distinguishes staged transitions and preserves later namesakes", async () => {
    const graph = await read("china-history.json");
    const dag = normalizeDagInput(graph);
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: (await read("china-history.style.json")).style.timeline,
    })!;
    assert.equal(graph.metadata.supplements.earlyChina.addedNodes, 124);
    for (const [id, date] of [
      ["jinyang", "-000452"],
      ["three-jin", "-000402"],
      ["jin-state-end", "-000375"],
      ["conquer-zhao", "-000227"],
      ["conquer-yan", "-000221"],
      ["xiang-partition", "-000205"],
      ["han-emperor", "-000201"],
      ["jing-accession", "-000156"],
      ["jing-tax", "-000155"],
      ["wu-accession", "-000140"],
    ])
      assert.equal(graph.nodes[id].time.at, date, id);
    assert.equal(graph.nodes["jin-end"].time.at, "1234", "金朝覆亡不能与春秋晋国共用标识");
    assert.equal(graph.nodes["jin-state-end"].type, "晋国");
    assert.equal(graph.nodes["jin-end"].type, "金");
    assert.match(graph.nodes["mohist-texts"].precision, /约/);
    assert.match(graph.nodes["laozi-text"].define, /不为老子个人编造生卒年/);
    assert.match(graph.nodes["ziying-surrender"].precision, /207.*206/);
    assert.match(graph.nodes["jing-restrict-kings"].define, /仍有诸侯国/);
    for (const [source, target] of [
      ["wu-state", "yue-conquers-wu"],
      ["han-state", "conquer-han"],
      ["zhao-state", "conquer-zhao"],
      ["tian-qi", "conquer-qi"],
    ]) {
      const edge = dag.edges.find((item) => item.source === source && item.target === target)!;
      assert.equal((edge.metadata!.timeline as { kind: string }).kind, "rendezvous");
      assert.equal(stage.nodeMap[source].timeline!.endY, stage.nodeMap[target].timeline!.startY);
    }
    assert.equal(stage.nodes.filter((item) => item.key === "gaixia").length, 1);
    assert.ok(dag.edges.some((item) => item.source === "weishui" && item.target === "gaixia"));
    assert.ok(dag.edges.some((item) => item.source === "honggou" && item.target === "gaixia"));
  }),
  defineTest("Han–Three Kingdoms points preserve BCE conversion and separate accession from unification", async () => {
    const graph = await read("china-history.json");
    const catalog = await readFile(root + "notes/han-three-catalog.md", "utf8");
    const supplement = graph.metadata.supplements.hanThreeKingdoms;
    assert.equal(supplement.addedNodes, 143);
    assert.equal(supplement.revisedNodes, 12);
    const ids = [...catalog.matchAll(/图中标识：`([^`]+)`/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, 155);
    for (const id of ids) {
      assert.deepEqual(Object.keys(graph.nodes[id].time), ["at"], `${id}: point, not another long range`);
      assert.ok(graph.nodes[id].sources.length && graph.nodes[id].references);
    }
    for (const [id, at] of [
      ["mobei-campaign", "-000118"],
      ["mang-returns", "0000"],
      ["mang-regency", "0006"],
      ["mang-emperor", "0009"],
      ["guangwu-accession", "0025"],
      ["han-reunification", "0036"],
      ["red-cliffs", "0208"],
      ["caopi-emperor", "0220"],
      ["liubei-emperor", "0221"],
      ["sunquan-wei-king", "0221"],
      ["wu-huangwu", "0222"],
      ["wu-emperor", "0229"],
      ["shu-conquest", "0263"],
      ["jin-emperor265", "0265"],
      ["jin-wu-campaign279", "0279"],
      ["jin-unification", "0280"],
    ])
      assert.equal(graph.nodes[id].time.at, at, id);
    assert.equal(graph.nodes["sunquan-wei-king"].type, "孙权集团");
    assert.equal(graph.nodes["eastern-wu"].time.start, "0222");
    assert.equal(graph.nodes["eastern-wu"].time.end, "0280");
    const dag = normalizeDagInput(graph);
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: (await read("china-history.style.json")).style.timeline,
    })!;
    for (const [source, target] of [
      ["western-han", "mang-emperor"],
      ["xin", "xin-fall"],
      ["gengshi", "gengshi-fall"],
      ["eastern-han", "caopi-emperor"],
      ["cao-wei", "jin-emperor265"],
    ]) {
      const edge = dag.edges.find((item) => item.source === source && item.target === target)!;
      assert.equal((edge.metadata!.timeline as { sourceAnchor: string }).sourceAnchor, "end");
      assert.equal(stage.nodeMap[source].timeline!.endY, stage.nodeMap[target].timeline!.startY);
    }
    for (const edge of graph.edges.filter((item: { id: string }) => item.id.startsWith("han-three:"))) {
      const anchor = edge.metadata.timeline;
      const source = graph.nodes[edge.source].time;
      const target = graph.nodes[edge.target].time;
      const from = anchor.sourceTime || (anchor.sourceAnchor === "end" ? source.end : source.at || source.start);
      assert.ok(Number(from) <= Number(target.at || target.start), edge.id);
    }
    assert.equal(graph.metadata.asOf, "2026-10-14");
  }),
  defineTest("Jin–Sui points preserve parallel states, qualified dates and period-end joins", async () => {
    const graph = await read("china-history.json");
    const catalog = await readFile(root + "notes/jin-sui-catalog.md", "utf8");
    const ids = [...catalog.matchAll(/图中标识：`([^`]+)`/g)].map((match) => match[1]);
    const revised = new Set([
      "eight-princes",
      "yongjia",
      "eastern-jin",
      "feishui",
      "kumarajiva",
      "northern-wei",
      "luoyang",
      "zhou-conquers-qi",
      "sui-unification",
      "grand-canal",
    ]);
    assert.equal(new Set(ids).size, 164);
    assert.equal(graph.metadata.supplements.jinSui.addedNodes, 154);
    assert.equal(graph.metadata.supplements.jinSui.revisedNodes, revised.size);
    const added = ids.filter((id) => !revised.has(id));
    assert.equal(added.length, 154);
    for (const id of added) {
      assert.deepEqual(Object.keys(graph.nodes[id].time), ["at"], `${id}: no new period bar`);
      assert.ok(graph.nodes[id].sources.length && graph.nodes[id].references && graph.nodes[id].precision);
    }
    for (const [id, at] of [
      ["jin-changan316", "0316"],
      ["simarui-king317", "0317"],
      ["simarui-emperor318", "0318"],
      ["wei-split534", "0534"],
      ["westwei535", "0535"],
      ["suchuo-laws544", "0544"],
      ["zhou-conquers-qi", "0577"],
      ["sui-founded581", "0581"],
      ["sui-liang587", "0587"],
      ["sui-unification", "0589"],
      ["sui-tongji605", "0605"],
      ["sui-yongji608", "0608"],
      ["sui-jiangnan610", "0610"],
      ["tang-founded618", "0618"],
    ])
      assert.equal(graph.nodes[id].time.at, at, id);
    assert.equal(graph.nodes["westernliang555"].type, "后梁（江陵）");
    assert.ok(added.some((id) => graph.nodes[id].type === "胡夏"));
    assert.match(graph.nodes["qimin540"].precision, /约540.*533—544.*不认定/);
    assert.match(graph.nodes["mogao366"].precision, /传统|传说/);
    assert.deepEqual(graph.nodes["eastern-jin"].time, { start: "0317", end: "0420" });
    assert.deepEqual(graph.nodes["grand-canal"].time, { start: "0605", end: "0610" });
    const dag = normalizeDagInput(graph);
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: (await read("china-history.style.json")).style.timeline,
    })!;
    const edges = dag.edges.filter((edge) => edge.id.startsWith("jin-sui:"));
    assert.equal(edges.length, 312);
    for (const edge of edges) {
      const anchor = edge.metadata!.timeline as { sourceAnchor: string; sourceTime?: string };
      const source = graph.nodes[edge.source].time;
      const target = graph.nodes[edge.target].time;
      const from = anchor.sourceTime || (anchor.sourceAnchor === "end" ? source.end : source.at || source.start);
      assert.ok(Number(from) <= Number(target.at || target.start), edge.id);
      if (anchor.sourceAnchor === "end")
        assert.equal(stage.nodeMap[edge.source].timeline!.endY, stage.nodeMap[edge.target].timeline!.startY);
    }
    assert.equal(graph.metadata.asOf, "2026-10-14");
  }),
  defineTest(
    "Tang–Song expansion keeps point events, calendar qualifications and separate conquest stages",
    async () => {
      const graph = await read("china-history.json");
      const catalog = await readFile(root + "notes/tang-song-catalog.md", "utf8");
      const ids = [...catalog.matchAll(/图中标识：`([^`]+)`/g)].map((match) => match[1]);
      const added = ids.filter((id) => id.startsWith("ts-"));
      assert.equal(new Set(ids).size, 222);
      assert.equal(added.length, 209);
      assert.equal(graph.metadata.supplements.tangSong.addedNodes, added.length);
      assert.equal(graph.metadata.supplements.tangSong.revisedNodes, 13);
      for (const id of added) {
        const node = graph.nodes[id];
        assert.deepEqual(Object.keys(node.time), ["at"], `${id}: no new period bar`);
        assert.ok(node.sources.length && node.references && node.precision, id);
        assert.match(node.notes, /tang-song\.md/);
      }
      for (const [id, at] of [
        ["ts-wuzhou690", "0690"],
        ["ts-wu902", "0902"],
        ["ts-wu919", "0919"],
        ["ts-wudi927", "0927"],
        ["ts-liaofall1125", "1125"],
        ["ts-qinzong1125", "1126"],
        ["ts-kaifeng1126", "1126"],
        ["ts-gaozong1127", "1127"],
        ["ts-yue1142", "1142"],
        ["ts-xiangfan1268", "1268"],
        ["ts-xiangfan1273", "1273"],
        ["ts-linan1276", "1276"],
        ["ts-duanzong1276", "1276"],
        ["ts-wentian1278", "1278"],
        ["song-end", "1279"],
      ])
        assert.equal(graph.nodes[id].time.at, at, id);
      assert.match(graph.nodes["ts-qinzong1125"].precision, /宣和七年十二月/);
      assert.match(graph.nodes["ts-kaifeng1126"].precision, /1127/);
      assert.match(graph.nodes["ts-jiaozhi1076"].precision, /1077/);
      assert.equal(graph.nodes["ts-susong1088"].kind, "约年定位点");
      assert.match(graph.nodes["ts-susong1088"].precision, /不认定为确切完工年/);
      assert.deepEqual(graph.nodes.tang.time, { start: "0618", end: "0907" });
      assert.deepEqual(graph.nodes["southern-song"].time, { start: "1127", end: "1279" });
      const dag = normalizeDagInput(graph);
      const stage = buildTimelineStage({
        dag,
        selection: { type: "full" },
        timelineSettings: (await read("china-history.style.json")).style.timeline,
      })!;
      const edges = dag.edges.filter((edge) => edge.id.startsWith("tang-song:"));
      assert.equal(edges.length, 462);
      for (const edge of edges) {
        const anchor = edge.metadata!.timeline as { sourceAnchor: string; sourceTime?: string };
        const source = graph.nodes[edge.source].time;
        const target = graph.nodes[edge.target].time;
        const from = anchor.sourceTime || (anchor.sourceAnchor === "end" ? source.end : source.at || source.start);
        assert.ok(Number(from) <= Number(target.at || target.start), edge.id);
        if (anchor.sourceAnchor === "end")
          assert.equal(stage.nodeMap[edge.source].timeline!.endY, stage.nodeMap[edge.target].timeline!.startY);
      }
      assert.equal(graph.metadata.asOf, "2026-10-14");
    },
  ),
  defineTest(
    "Yuan–Qing expansion separates dated milestones and preserves the inherited period boundaries",
    async () => {
      const graph = await read("china-history.json");
      const catalog = await readFile(root + "notes/yuan-qing-catalog.md", "utf8");
      const added = Object.keys(graph.nodes).filter((id) => id.startsWith("yq-"));
      assert.equal(added.length, 236);
      assert.equal(catalog.match(/^## /gm)!.length, 249);
      assert.equal(graph.metadata.supplements.yuanQing.addedNodes, 236);
      assert.equal(graph.metadata.supplements.yuanQing.revisedNodes, 13);
      for (const id of added) {
        const node = graph.nodes[id];
        assert.deepEqual(Object.keys(node.time), ["at"], `${id}: no new period bar`);
        assert.ok(node.sources.length && node.references && node.precision, id);
        assert.match(node.notes, /yuan-qing\.md/);
      }
      for (const [id, at] of [
        ["yq-ming1368", "1368"],
        ["yq-dadu1368", "1368"],
        ["yq-jin1616", "1616"],
        ["yq-qing1636", "1636"],
        ["yq-hongguang1644", "1644"],
        ["yq-taiwan1661", "1661"],
        ["yq-yongli1662", "1662"],
        ["zheng-takes-taiwan", "1662"],
        ["zheng-surrender", "1683"],
        ["yq-sea1684", "1684"],
        ["yq-schools1904", "1904"],
        ["wuchang", "1911-10-10"],
        ["abdication", "1912-02-12"],
      ])
        assert.equal(graph.nodes[id].time.at, at, id);
      assert.match(graph.nodes["yq-nongshu1313"].precision, /序.*1300/);
      assert.match(graph.nodes["yq-schools1904"].define, /公历1904/);
      assert.match(graph.nodes["yq-junji1729"].precision, /后续演变/);
      assert.match(graph.nodes["yq-dzungar1757"].define, /大规模杀戮/);
      assert.equal(graph.nodes["yq-famine1877"].kind, "约年定位点");
      assert.equal(graph.nodes["yq-map1718"].kind, "约年定位点");
      for (const [id, start, end] of [
        ["yuan", "1271", "1368"],
        ["ming", "1368", "1644"],
        ["later-jin-qing", "1616", "1636"],
        ["qing", "1636", "1912"],
        ["southern-ming", "1644", "1662"],
        ["zheng-taiwan", "1661", "1683"],
      ])
        assert.deepEqual(graph.nodes[id].time, { start, end }, id);
      const edges = graph.edges.filter((edge: { id: string }) => edge.id.startsWith("yuan-qing:"));
      assert.equal(edges.length, 480);
      for (const edge of edges) {
        const anchor = edge.metadata.timeline;
        const source = graph.nodes[edge.source].time;
        const target = graph.nodes[edge.target].time;
        const from = anchor.sourceTime || (anchor.sourceAnchor === "end" ? source.end : source.at || source.start);
        const to = target.at || target.start;
        assert.ok(parseTimelineDate(from)!.timestamp <= parseTimelineDate(to)!.timestamp, edge.id);
        if (anchor.sourceAnchor === "end") assert.equal(from, to, edge.id);
      }
      assert.ok(
        !edges.some(
          (edge: { source: string; target: string }) =>
            edge.source === "later-jin-qing" && edge.target === "yq-nurhaci1583",
        ),
      );
      assert.equal(graph.metadata.asOf, "2026-10-14");
    },
  ),
  defineTest("modern history includes sourced political and social events through the declared cutoff", async () => {
    const graph = await read("china-history.json");
    assert.equal(graph.metadata.asOf, "2026-10-14");
    for (const id of [
      "anti-rightist",
      "great-leap",
      "great-famine",
      "cultural-revolution",
      "june-fourth",
      "falun-gong-ban",
      "lawyers709",
      "xinjiang-detention",
      "xinjiang-report2022",
      "hong-kong-protests2019",
      "hong-kong-nsl",
      "white-paper-protests",
      "term-limits-removed",
      "third-plenum1978",
      "wto-accession",
      "covid-reported",
      "change-six-return",
      "fifteenth-plan",
    ]) {
      const node = graph.nodes[id];
      assert.ok(node, `${id}: required modern coverage`);
      assert.equal(node.type, "中华人民共和国");
      assert.ok(node.sources.length && node.references && node.define);
    }
    assert.deepEqual(graph.nodes["june-fourth"].time, { at: "1989-06-04" });
    assert.deepEqual(graph.nodes["white-paper-protests"].time, { at: "2022-11-25" });
    assert.match(graph.nodes["xinjiang-report2022"].define, /可能/);
    assert.match(graph.nodes["great-famine"].define, /估算|估计/);
    const cutoff = parseTimelineDate(graph.metadata.asOf)!.timestamp;
    for (const node of Object.values(graph.nodes) as { time: Record<string, string | null> }[]) {
      for (const value of Object.values(node.time)) {
        if (value !== null) assert.ok(parseTimelineDate(value)!.timestamp <= cutoff);
      }
    }
    assert.equal(graph.nodes["fifteenth-plan"].time.at, "2026-03-12");
  }),
  defineTest("modern polity ranges remain ongoing across relocation and party transitions", async () => {
    const graph = await read("china-history.json");
    const dag = normalizeDagInput(graph);
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: (await read("china-history.style.json")).style.timeline,
    })!;
    for (const [id, start, event] of [
      ["roc-period", "1912-01-01", "republic"],
      ["prc-period", "1949-10-01", "prc"],
    ]) {
      assert.deepEqual(graph.nodes[id].time, { start, end: null });
      const time = stage.nodeMap[id].timeline!;
      assert.equal(time.kind, "range");
      assert.equal(time.ongoing, true);
      assert.equal(time.startY, stage.nodeMap[event].timeline!.startY);
      assert.ok(time.endY > stage.nodeMap["first-party-transfer"].timeline!.startY);
    }
    assert.match(graph.nodes["roc-period"].define, /1925.*2000.*2008.*2016/);
    assert.ok(dag.edges.some((edge) => edge.source === "roc-period" && edge.target === "roc-relocation"));
  }),
]);
