import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ancient } from "./data/europe-history/ancient.mjs";
import { medieval } from "./data/europe-history/medieval.mjs";
import { earlyModern } from "./data/europe-history/early-modern.mjs";
import { nineteenth } from "./data/europe-history/nineteenth.mjs";
import { twentieth } from "./data/europe-history/twentieth.mjs";
import { contemporary } from "./data/europe-history/contemporary.mjs";
import { polities, themes, sections, source, isoYear } from "./data/europe-history/shared.mjs";
import { periods, bridges } from "./data/europe-history/relations.mjs";

const rootUrl = new URL("../public/examples/china-history/europe/", import.meta.url);
const root = fileURLToPath(rootUrl);
const check = process.argv.includes("--check");
const corpus = { ancient, medieval, earlyModern, nineteenth, twentieth, contemporary };
const asOf = "2026-10-16";
const nodes = {},
  events = [],
  edges = [],
  edgePairs = new Set(),
  sourceIndex = new Map();
const dateLabel = (year) => (year < 0 ? `公元前${-year}年` : `${year}年`);
const validateYear = (year) => assert.ok(Number.isInteger(year) && year !== 0 && year <= 2026, `Invalid year ${year}`);
const md = (s) => String(s).replaceAll("|", "\\|");
function bibliography(keys, id) {
  return keys.split("|").map((key) => {
    const [title, url] = source(key);
    assert.equal(new URL(url).protocol, "https:");
    if (!sourceIndex.has(url)) sourceIndex.set(url, { title, ids: [] });
    sourceIndex.get(url).ids.push(id);
    return { title, url };
  });
}
function baseNode(id, polity, theme, section, title, define, keys, precision) {
  assert.ok(!nodes[id], `Duplicate id ${id}`);
  assert.match(id, /^[a-z0-9-]+$/);
  assert.ok(polities[polity] && themes[theme] && sections[section], `Unknown classification ${id}`);
  const refs = bibliography(keys, id);
  return {
    title,
    type: polities[polity][0],
    track: polities[polity][0],
    polity: polities[polity][0],
    polityChinese: polities[polity][1],
    nameConvention: polities[polity][2],
    theme,
    topic: themes[theme],
    section,
    define,
    precision,
    sources: refs.map((ref) => ref.url),
    references: refs.map((ref) => `[${ref.title}](${ref.url})`).join(" · "),
    notes: `[分期导读](./notes/${sections[section][1]}) · [逐项目录](./notes/${section}-catalog.md) · [原名对照](./NAMES.md) · [来源与方法](./SOURCES.md)`,
  };
}
for (const [section, rows] of Object.entries(corpus)) {
  for (const row of rows) {
    const [id, year, polity, theme, title, define, keys, thread, precision] = row;
    validateYear(year);
    assert.ok(title && define && keys && thread, `Incomplete ${id}`);
    const qualified = precision || "按年定位；未提供日月不表示事件发生于1月1日。";
    nodes[id] = {
      ...baseNode(id, polity, theme, section, title, define, keys, qualified),
      kind: precision?.includes("传统") ? "传统纪年点" : /^(约|以约)/.test(precision || "") ? "约年事件" : "点事件",
      dateLabel: dateLabel(year),
      time: { at: isoYear(year) },
      readingThread: thread,
    };
    events.push({ id, year, polity, section, thread, row });
  }
}
const points = new Map(events.map((event) => [event.id, event]));
const starts = new Map(events.map((event) => [event.id, event.year]));
for (const [id, start, end, polity, section, title, define, keys] of periods) {
  validateYear(start);
  validateYear(end);
  assert.ok(start < end);
  nodes[id] = {
    ...baseNode(
      id,
      polity,
      ["period-thirty", "period-ww1", "period-ww2"].includes(id) ? "conflict" : "polity",
      section,
      title,
      define,
      keys,
      "读图分期边界，不表示疆域或政治制度全程不变；起讫依据及例外见正文。",
    ),
    kind: "时期",
    dateLabel: `${dateLabel(start)}—${dateLabel(end)}`,
    time: { start: isoYear(start), end: isoYear(end) },
  };
  starts.set(id, start);
}
function connect(from, to, label, kind = "reference", anchor = "start") {
  assert.ok(nodes[from] && nodes[to], `Missing edge endpoint ${from} -> ${to}`);
  assert.notEqual(from, to);
  assert.ok(starts.get(from) <= starts.get(to), `Backwards edge ${from} -> ${to}`);
  const pair = `${from}:${to}`;
  if (edgePairs.has(pair)) return;
  edgePairs.add(pair);
  edges.push({
    id: `e-${from}--${to}`,
    source: from,
    target: to,
    value: 1,
    metadata: { label, timeline: { kind, sourceAnchor: anchor, targetAnchor: "start" } },
  });
}
const threads = new Map();
for (const event of events) {
  if (!threads.has(event.thread)) threads.set(event.thread, []);
  threads.get(event.thread).push(event);
}
// Explicit bridges precede automatic reading sequences, retaining their specific labels.
for (const [from, to, label] of bridges) connect(from, to, label);
for (const route of threads.values()) {
  route.sort((a, b) => a.year - b.year);
  route.slice(1).forEach((event, index) => {
    const earlier = route[index];
    connect(
      earlier.id,
      event.id,
      earlier.year === event.year
        ? "同年相关事件的阅读连接；月日先后以各节点正文为准"
        : "同一阅读主题所选事件先后；省略中间事件，先后不等于因果",
      "sequence",
    );
  });
}
for (const [id, start, end, polity, section, title, define, keys, first, last] of periods) {
  assert.equal(points.get(first)?.year, start, `Period start ${id}`);
  assert.equal(points.get(last)?.year, end, `Period end ${id}`);
  connect(id, first, "本条分期的起点；参见纪年与名称限定", "part-of");
  connect(id, last, "本条分期在此事件处结束；不代表全部历史影响终止", "rendezvous", "end");
}
// Validate DAG, not just local chronology; same-year joins can otherwise form cycles.
const incoming = new Map(Object.keys(nodes).map((id) => [id, 0]));
const outgoing = new Map(Object.keys(nodes).map((id) => [id, []]));
for (const edge of edges) {
  incoming.set(edge.target, incoming.get(edge.target) + 1);
  outgoing.get(edge.source).push(edge.target);
}
const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
for (let i = 0; i < queue.length; i++)
  for (const next of outgoing.get(queue[i])) {
    incoming.set(next, incoming.get(next) - 1);
    if (incoming.get(next) === 0) queue.push(next);
  }
assert.equal(
  queue.length,
  Object.keys(nodes).length,
  `Cycle involving ${[...incoming]
    .filter(([, n]) => n)
    .map(([id]) => id)
    .join(", ")}`,
);
for (const id of Object.keys(nodes))
  assert.ok(
    edges.some((edge) => edge.source === id || edge.target === id),
    `Isolated ${id}`,
  );
const count = Object.keys(nodes).length,
  polityCount = new Set(Object.values(nodes).map((n) => n.type)).size;
const graph = {
  format: "graph-studio",
  version: 3,
  diagram: "dag",
  id: "europe-history",
  title: "欧洲历史：分流与交汇",
  metadata: {
    language: "zh-CN",
    asOf,
    historicalScope: "约公元前1900年—2026年；爱琴海青铜时代至当代的欧洲历史选编",
    description: "中文说明与原语言专名；点事件为主，跨地区线路在共同事件处交汇。不是穷尽所有国家与事件的通史。",
    timeline: {
      version: 1,
      timeZone: "UTC",
      view: {
        layout: "flow",
        axis: "adaptive",
        tickStep: 100,
        tickUnit: "year",
        nodeGap: 24,
        compactness: 0.5,
        locked: false,
        pins: {},
      },
    },
    edgeSemantics: {
      sequence: "所选主题事件的阅读次序；非充分或唯一因果。同年连接不隐含月日精度。",
      reference: "标签明确说明的背景、延续、分裂、征服或比较；跨地区不等于自愿融合。",
      "part-of": "少量时期线与其分期起点的联系。",
      rendezvous: "时期线终点在对应事件处收束；不是同盟或和平的统一含义。",
    },
    namingPolicy: "原语言规范形式或史料称谓；多语并列，后世史学名称与未释读自称须注明。参见 NAMES.md。",
    sections: Object.fromEntries(
      Object.entries(sections).map(([key, [title, path]]) => [
        key,
        { title, guide: `notes/${path}`, eventCount: corpus[key].length },
      ]),
    ),
  },
  nodes,
  edges,
};
const files = new Map();
const json = (value) => JSON.stringify(value, null, 2) + "\n";
files.set("europe-history.json", json(graph));
const guidePaths = Object.values(sections).map(([, path]) => `notes/${path}`);
const assets = [
  "README.md",
  "SOURCES.md",
  "NAMES.md",
  ...guidePaths,
  ...Object.keys(sections).map((key) => `notes/${key}-catalog.md`),
].sort();
const workspace = JSON.parse(await readFile(new URL("../graph-studio.workspace.json", rootUrl), "utf8"));
workspace.name = "Human History";
workspace.graphs = [...new Set([...workspace.graphs, "europe/europe-history.json"])];
const graphStats = {};
const categories = new Set(),
  allThemes = new Set();
for (const path of workspace.graphs) {
  const document =
    path === "europe/europe-history.json" ? graph : JSON.parse(await readFile(new URL(`../${path}`, rootUrl), "utf8"));
  const entries = Object.values(document.nodes);
  graphStats[path] = {
    nodeCount: entries.length,
    edgeCount: document.edges.length,
    polityCount: new Set(entries.map((n) => n.type)).size,
  };
  entries.forEach((n) => {
    categories.add(n.type);
    allThemes.add(n.theme);
  });
}
workspace.metadata = {
  ...workspace.metadata,
  nodeCount: Object.values(graphStats).reduce((sum, value) => sum + value.nodeCount, 0),
  edgeCount: Object.values(graphStats).reduce((sum, value) => sum + value.edgeCount, 0),
  polityCount: categories.size,
  themeCount: allThemes.size,
  graphStats,
  assets: [
    ...workspace.metadata.assets.filter((path) => !path.startsWith("europe/")),
    ...assets.map((path) => `europe/${path}`),
  ],
};
files.set("../graph-studio.workspace.json", json(workspace));
files.set(
  "README.md",
  `# 欧洲历史：分流与交汇\n\n独立时间画布，覆盖约公元前1900年的爱琴海宫殿到2026年 България 采用 euro。共 **${events.length} 个点事件、${periods.length} 条时期线、${edges.length} 条关系**，${polityCount} 个政权／地区／主题类别。编选记录截至 ${asOf}；最新收录事件为2026年1月1日，并非逐日更新的新闻或现势地图。\n\n打开 [欧洲历史画布](./europe-history.json)。说明使用中文，人名、政权、机构和主要事件中的专名保留原语言字形；对照见 [NAMES](./NAMES.md)。\n\n## 阅读方式\n\n先按时间范围缩小到一个阶段，再选择 Type／Track 中的地区或政权。颜色表示分类，不是固定的一条国家轨道。希腊诸邦、Roma、Ῥωμανία、西欧、中东欧、北欧、巴尔干和欧洲整合线路并行；殖民活动包含被征服者、奴役、抵抗与独立的视角。\n\n点的年份表示事件坐标，非默认1月1日；约年和传统纪年会在 precision 中说明。大多数国家的成立、制度变革、战争、条约和灭亡均用点表达，只有13个必要的制度／战争时期保留线段。每条边有含义说明：普通先后不等于因果，交汇也不等于和平合并。图中年份跨度很大，adaptive 轴可压缩空白；需要比较真实时长时切换线性时间轴。\n\n## 分期导读\n\n${Object.entries(
    sections,
  )
    .map(
      ([key, [title, path]]) =>
        `- [${title}](./notes/${path}) · ${corpus[key].length} 个点事件 · [逐项目录](./notes/${key}-catalog.md)`,
    )
    .join(
      "\n",
    )}\n\n这些分期为阅读服务，界线可以重叠。1444年 Lagos 奴隶交易放在海洋扩张篇，1455年印刷节点也与改革篇相连。欧洲边界及身份随时代变化；希腊、罗马和现代国家之间没有一条必然、排他的文明继承线。\n\n## 可追溯性与维护\n\n每个节点都有来源链接、中文解释、纪年限定及相关导读。博物馆、档案、条约文本和官方机构资源用于关键核验；其余大量节点以注明性质的二手综述提供进一步阅读入口，不声称全部来自一手史料。见 [来源索引与方法](./SOURCES.md)。\n\n数据源位于项目 scripts/data/europe-history/，生成器为 scripts/build-europe-history.mjs。修改后执行 npm run examples:europe-history，再执行 npm run examples:europe-history:check。导读为独立维护文件，生成器不会覆盖。此画布与中国历史同属 Human History 工作区，分别保存在独立图文件中，打开示例后编辑的是副本。\n`,
);
files.set(
  "NAMES.md",
  `# 原名、语言与中文对照\n\n返回 [读图说明](./README.md)。中文用于解释；专名采用有关语言的规范形式。保留 Ἀθῆναι、Ῥωμανία、Русь、Україна、Österreich、Československo 等字形及变音符号，不能一概转成英语。\n\n“原名”不意味着跨数千年存在一个不变的正式国号。古典和中世纪人名采用原语言的通行校订拼写；早期英语、法语等名称有时以现代规范字形呈现，不能当作原始手稿的逐字摹写。多语国家列出一种或几种有根据的称谓，不宣称排除其他官方语言。政权类别是检索入口，同类别下的历史政体变化以事件说明为准。\n\n爱琴海考古文化不能凭后世地名推定未释读的当时国号。Ἑλλάς、Italia（诸邦）、Norden 和 Europa 是区域分类，不表示统一国家。希腊化诸王国、知识与文化、大西洋联系属于中文主题分类。\n\n## 政权与地区\n\n| 原名／分类 | 中文检索对照 | 语言与适用限定 |\n| --- | --- | --- |\n${Object.values(
    polities,
  )
    .map((row) => `| ${row.map(md).join(" | ")} |`)
    .join(
      "\n",
    )}\n\n## 常见人物与文字示例\n\n| 原语言形式 | 常用中文名 | 使用说明 |\n| --- | --- | --- |\n| Σόλων / Σωκράτης / Πλάτων | 梭伦／苏格拉底／柏拉图 | 古希腊语 |\n| Ἀλέξανδρος | 亚历山大 | 古希腊语；身份由事件说明 |\n| Gaius Iulius Caesar / Augustus | 凯撒／奥古斯都 | 拉丁语；后者为尊号 |\n| Ἰουστινιανός / Ἡράκλειος | 查士丁尼／希拉克略 | 希腊语；帝国另有拉丁语传统 |\n| Chlodovechus / Carolus Magnus | 克洛维／查理大帝 | 拉丁语史料形式，不倒用现代民族身份 |\n| Jeanne d’Arc / François Iᵉʳ / Louis XIV | 贞德／弗朗索瓦一世／路易十四 | 法语 |\n| Martin Luther / Johannes Gutenberg | 马丁·路德／约翰内斯·古腾堡 | 德语 |\n| Mikołaj Kopernik | 哥白尼 | 波兰语；著作使用拉丁语 |\n| Galileo Galilei / Giuseppe Garibaldi | 伽利略／加里波第 | 意大利语 |\n| Napoléon Bonaparte | 拿破仑·波拿巴 | 法语 |\n| Olympe de Gouges / Mary Wollstonecraft | 奥兰普·德古热／玛丽·沃斯通克拉夫特 | 法语／英语；各用本人语言形式 |\n| Володимир / Іван / Пётр / Екатерина | 弗拉基米尔／伊凡／彼得／叶卡捷琳娜 | 各节点按所属语言传统；不将东斯拉夫历史独占归属于一个现代国家 |\n| Владимир Ленин / Иосиф Сталин / Михаил Горбачёв | 列宁／斯大林／戈尔巴乔夫 | 俄语政治通行姓名；不以拼写断定族属 |\n| Lech Wałęsa / Václav Havel | 瓦文萨／哈韦尔 | 波兰语／捷克语，保留变音符号 |\n\nῬωμανία 是东部罗马人的自称体系之一；“拜占庭”是后世史学术语。Sacrum Romanum Imperium 的完整称号并非962年已使用。Rzeczpospolita Obojga Narodów 是通行的波兰语历史称呼，多民族和多语实践远较一个标签复杂。原名对照用于定位资料，不为现代领土主张提供裁决。\n`,
);
files.set(
  "SOURCES.md",
  `# 来源与编选方法\n\n返回 [读图说明](./README.md)。此图为有来源的历史选编，编选日期 ${asOf}，并非穷尽事件、逐条同行评审或全部一手史料的数据库。\n\n## 证据层次\n\n条约、法律文本及档案机构资料适合确认文件和制度阶段；博物馆、大学与专门研究机构提供研究综述；Wikipedia 条目明确标为二手综述，用作通史节点的公开参考入口和进一步追索文献的目录。各节点保留实际引用链接。关键年代、特殊原名和当代制度节点做过有针对性的查核；没有把所有外链逐页全文复核的工作伪称完成。\n\n考古约年、传统纪年与有文献的事件年份分开。Olympia 的前776年、Roma 前753年及共和制前509年均需读限定；Θήρα 火山喷发年代有争议。BC 日期由历史纪年转为 ISO 天文年份，例如前27年写作 -000026，前1年对应0000；页面 dateLabel 保留历史说法，不存在历史纪年公元0年。俄国1917年的二月／十月革命名称保留旧历传统，正文注明公历月份；所有点按年呈现，未提供日月不自动断言1月1日。\n\n476年不是东部帝国结束，1204—1261年不绘成首都连续在原政权手中的一条线。欧盟、Council of Europe、NATO、Schengen 与欧元区分别处理。对征服、殖民奴役、种族灭绝和侵略，说明行为及证据，不把暴力写成中性的自愿“融合”。仍在演变的冲突仅记录已发生节点，不预设终点或最终和约。\n\n## 逐项来源索引\n\n以下共 ${sourceIndex.size} 个不同入口。节点编号与六篇目录一一对应；多节点共引综合资料并不表示一个网页详述全部问题。\n\n${[...sourceIndex].map(([url, { title, ids }]) => `- [${title}](${url}) — ${ids.map((id) => "`" + id + "`").join("、")}`).join("\n")}\n`,
);
for (const [section, rows] of Object.entries(corpus)) {
  const entries = [...rows.map((row) => row[0]), ...periods.filter((p) => p[4] === section).map((p) => p[0])];
  entries.sort((a, b) => starts.get(a) - starts.get(b));
  files.set(
    `notes/${section}-catalog.md`,
    `# ${sections[section][0]}：逐项目录\n\n[导读](./${sections[section][1]}) · [总览](../README.md) · [原名](../NAMES.md)\n\n${entries
      .map((id) => {
        const n = nodes[id];
        return `## ${n.dateLabel} · ${n.title}\n\n编号：\`${id}\` · ${n.kind} · ${n.type} · ${n.topic}\n\n${n.define}\n\n纪年：${n.precision}\n\n来源：${n.references}\n`;
      })
      .join("\n")}\n`,
  );
}
let stale = false;
for (const [relative, content] of files) {
  assert.equal(content.normalize("NFC"), content, `Non-normalized Unicode ${relative}`);
  const path = root + relative;
  if (check) {
    const actual = await readFile(path, "utf8").catch(() => null);
    if (actual !== content) {
      console.error(`Stale generated file: ${relative}`);
      stale = true;
    }
  } else {
    await mkdir(new URL(".", new URL(relative, rootUrl)), {
      recursive: true,
    });
    await writeFile(path, content, "utf8");
  }
}
for (const path of guidePaths) assert.ok((await readFile(root + path, "utf8")).length > 500, `Missing guide ${path}`);
console.log(
  `${check ? "Checked" : "Generated"} Europe: ${events.length} points + ${periods.length} periods = ${count} nodes; ${edges.length} edges; ${polityCount} categories; ${sourceIndex.size} sources.`,
);
if (stale) process.exitCode = 1;
