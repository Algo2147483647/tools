import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  convergences,
  events,
  links,
  participants,
  periods,
  pointMarkers,
  revisions,
  sources,
} from "./data/china-history/early.mjs";
import { expandPreZhou } from "./expand-pre-zhou-history.mjs";
import { expandHanThree } from "./expand-han-three-history.mjs";
import { expandJinSui } from "./expand-jin-sui-history.mjs";

// The checked-in graph is authoritative for the other periods. This supplement is
// deliberately incremental: the original all-history generator is absent here.
const project = new URL("../", import.meta.url);
const root = new URL("public/examples/china-history/", project);
const check = process.argv.includes("--check");
const read = (name) => readFile(new URL(name, root), "utf8");
const graph = JSON.parse(await read("china-history.json"));
// Rehydrate source spans before rebuilding; visual point conversion is applied
// after relations are generated, so repeated runs preserve membership and dates.
for (const id of pointMarkers) {
  const item = graph.nodes[id];
  if (item?.historicalRange) {
    item.time = { ...item.historicalRange };
    item.precision = item.rangePrecision;
    delete item.historicalRange;
    delete item.rangePrecision;
  }
}
const manifest = JSON.parse(await read("graph-studio.workspace.json"));
const preZhou = expandPreZhou(graph);
const topics = {
  polity: "政权与时期",
  conflict: "战争与变局",
  diplomacy: "交流与外交",
  economy: "经济与制度",
  ideas: "思想与文化",
  technology: "科技与工程",
};
const year = (bce) => {
  assert.ok(Number.isInteger(bce) && bce > 1);
  return `-${String(bce - 1).padStart(6, "0")}`;
};
const sourceFields = (keys) => ({
  sources: keys.map((key) => {
    assert.ok(sources[key], `Unknown source ${key}`);
    return sources[key][1];
  }),
  references: keys.map((key) => `[${sources[key][0]}](${sources[key][1]})`).join(" · "),
});
const notes = (theme) =>
  `[春秋到汉初导读](./notes/early-china.md) · [分期条目与史料](./notes/early-catalog.md) · [${topics[theme]}](./notes/${theme}.md) · [史料约定](./SOURCES.md)`;
const node = (title, polity, date, theme, define, keys, precision) => ({
  title,
  type: polity,
  track: polity,
  polity,
  topic: topics[theme],
  theme,
  kind: Array.isArray(date) ? "时期" : "事件",
  define,
  dateLabel: Array.isArray(date) ? `公元前${date[0]}年—公元前${date[1]}年` : `公元前${date}年`,
  time: Array.isArray(date) ? { start: year(date[0]), end: year(date[1]) } : { at: year(date) },
  precision: precision || "年；未补造月日。同年不同事件的先后由文字说明，时间轴年刻度不表达月日顺序。",
  ...sourceFields(keys),
  notes: notes(theme),
});
const managed = new Set();
for (const [id, title, polity, start, end, define, keys] of periods) {
  assert.ok(!managed.has(id), id);
  assert.ok(!graph.nodes[id] || graph.nodes[id].title === title, `Node id collision: ${id}`);
  managed.add(id);
  graph.nodes[id] = node(title, polity, [start, end], "polity", define, keys);
}
for (const [id, title, polity, date, theme, define, keys, precision] of events) {
  assert.ok(!managed.has(id), id);
  assert.ok(!graph.nodes[id] || graph.nodes[id].type === polity, `Node id collision: ${id}`);
  managed.add(id);
  graph.nodes[id] = node(title, polity, date, theme, define, keys, precision);
  if (participants[id]) graph.nodes[id].participants = participants[id];
}
for (const [id, { sources: keys, ...changes }] of Object.entries(revisions)) {
  assert.ok(graph.nodes[id], `Missing existing node ${id}`);
  Object.assign(graph.nodes[id], changes, sourceFields(keys), { notes: notes(graph.nodes[id].theme) });
}
graph.metadata.supplements = {
  ...graph.metadata.supplements,
  earlyChina: {
    updated: "2026-10-15",
    scope: "公元前770—前141年；以武帝即位衔接后续年表",
    addedNodes: managed.size,
    guide: "notes/early-china.md",
  },
};
// The modern-event verification cutoff remains unchanged by this ancient-history edit.
graph.edges = graph.edges.filter((edge) => !edge.id.startsWith("early:"));
const startOf = (id) => graph.nodes[id].time.at || graph.nodes[id].time.start;
const edge = (source, target, value, kind = "reference", sourceAnchor = "start", sourceTime) => {
  assert.ok(graph.nodes[source] && graph.nodes[target], `${source} -> ${target}`);
  if (graph.edges.some((item) => item.source === source && item.target === target)) return;
  graph.edges.push({
    id: `early:${kind}:${source}:${target}`,
    source,
    target,
    value,
    metadata: { timeline: { kind, sourceAnchor, targetAnchor: "start", ...(sourceTime ? { sourceTime } : {}) } },
  });
};
for (const [source, target, label] of links) edge(source, target, label);
for (const [source, target, label, anchor] of convergences) {
  edge(source, target, label, "rendezvous", anchor, anchor === "start" ? startOf(target) : undefined);
}
const parents = [
  "eastern-zhou",
  "lu",
  "qin-state",
  "qin",
  "western-han",
  "western-chu",
  ...periods.map(([id]) => id).filter((id) => !["spring-autumn", "wen-jing"].includes(id)),
];
for (const [id] of events) {
  const item = graph.nodes[id];
  const time = startOf(id);
  const end = item.time.end || time;
  const parent = parents.find((key) => {
    const range = graph.nodes[key];
    // Comparing signed astronomical years numerically avoids reversed BCE order.
    return (
      range.type === item.type &&
      Number(range.time.start) <= Number(time) &&
      Number(range.time.end) >= Number(end) &&
      !links.some(([s, t]) => s === id && t === key)
    );
  });
  if (parent) edge(parent, id, "所示政权阶段内的事件或活动；不表示参与者效忠该政权", "part-of", "start", time);
}
edge("eastern-zhou", "spring-autumn", "本图春秋分期位于周王朝存续期", "part-of", "start", year(770));
edge("spring-autumn", "warring-states", "本图以前476／前475年相接；其他史学分期另见导读", "sequence", "end");
edge("western-han", "wen-jing", "西汉前期的文景阶段", "part-of", "start", year(180));
edge("wen-jing", "wu-accession", "文景阶段收束，武帝即位", "sequence", "end");
// Link the cultural ranges even when they extend beyond the Zhou royal house.
for (const id of ["mohist-texts", "laozi-text"]) {
  edge("warring-states", id, "战国时期的跨国思想活动；东周类别作时代归类", "part-of", "start", startOf(id));
}
edge("confucius", "mengzi", "思想联系：孟子继承并发展儒家议题，非同一时代人物");
edge("jixia", "xunzi-lanling", "荀子由齐地论学转向楚地活动", "reference", "start", year(255));

// Keep the existing corpus's edge order stable; the new supplement follows it.
const hanThree = expandHanThree(graph);
const jinSui = expandJinSui(graph);
for (const id of pointMarkers) {
  const item = graph.nodes[id];
  assert.ok(item?.time.start && item.time.end, `Missing original span: ${id}`);
  item.historicalRange = { ...item.time };
  item.rangePrecision = item.precision;
  item.time = { at: item.historicalRange.start };
  const yearLabel = `前${1 - Number(item.time.at)}年`;
  const knownStart = id === "confucius" || id === "yue-goujian";
  item.kind = knownStart ? "起年定位点" : "约年定位点";
  item.precision = knownStart
    ? `以原范围的起年${yearLabel}定位，对应本图采用的${id === "confucius" ? "孔子生年" : "勾践即位年"}；生平或在位经历并非都发生于这一年。原年代说明：${item.rangePrecision}`
    : `图上以约${yearLabel}作定位点，取原年代窗口的较早端便于阅读，不表示全部活动确在该年发生或文本在该年完成。原年代说明：${item.rangePrecision}`;
}
for (const item of graph.edges) {
  const relation = item.metadata?.timeline;
  if (!relation) continue;
  if (pointMarkers.has(item.source)) {
    relation.sourceAnchor = "start";
    delete relation.sourceTime;
    if (relation.kind === "part-of") relation.kind = "reference";
  }
  if (pointMarkers.has(item.target)) {
    relation.targetAnchor = "start";
    delete relation.targetTime;
  }
}
graph.edges = [
  ...graph.edges.filter(
    (item) => !item.id.startsWith("pre-zhou:") && !item.id.startsWith("han-three:") && !item.id.startsWith("jin-sui:"),
  ),
  ...graph.edges.filter((item) => item.id.startsWith("pre-zhou:")),
  ...graph.edges.filter((item) => item.id.startsWith("han-three:")),
  ...graph.edges.filter((item) => item.id.startsWith("jin-sui:")),
];

// Validate graph integrity before any output is written.
const ids = new Set();
const adjacency = new Map(Object.keys(graph.nodes).map((id) => [id, []]));
for (const item of graph.edges) {
  assert.ok(!ids.has(item.id), `Duplicate edge ${item.id}`);
  ids.add(item.id);
  assert.ok(adjacency.has(item.source) && adjacency.has(item.target), `Dangling edge ${item.id}`);
  adjacency.get(item.source).push(item.target);
}
const visiting = new Set();
const visited = new Set();
const visit = (id) => {
  assert.ok(!visiting.has(id), `Cycle at ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const target of adjacency.get(id)) visit(target);
  visiting.delete(id);
  visited.add(id);
};
for (const id of adjacency.keys()) visit(id);

const nodeCount = Object.keys(graph.nodes).length;
const edgeCount = graph.edges.length;
Object.assign(manifest.metadata, {
  nodeCount,
  edgeCount,
  polityCount: new Set(Object.values(graph.nodes).map((item) => item.type)).size,
});
manifest.metadata.assets = [
  ...new Set([
    ...manifest.metadata.assets,
    "notes/early-china.md",
    "notes/early-catalog.md",
    "notes/pre-zhou.md",
    "notes/pre-zhou-catalog.md",
    "notes/pre-zhou-sources.md",
    "notes/han-three.md",
    "notes/han-three-catalog.md",
    "notes/han-three-sources.md",
    "notes/jin-sui.md",
    "notes/jin-sui-catalog.md",
    "notes/jin-sui-sources.md",
  ]),
].sort();
const ordered = [...new Set([...managed, ...Object.keys(revisions), ...pointMarkers])].sort(
  (a, b) => Number(startOf(a)) - Number(startOf(b)) || a.localeCompare(b, "en"),
);
const catalog = [
  "# 春秋到汉初：条目与史料",
  "",
  "本目录对应主图新增及修订的条目，按起始年份排列。先读[叙事导读](./early-china.md)，再按标题在主图搜索。孔子、勾践与五项思想或改革专题改用点显示，详情仍保留原范围；点只作生年、即位年或约年定位，不把多年活动说成一年完成。政权时期条的起点不等于建国年。",
  "",
  ...ordered.flatMap((id) => {
    const item = graph.nodes[id];
    return [
      `## ${item.title}`,
      "",
      `**${item.dateLabel} · ${item.type} · ${item.topic}**`,
      "",
      item.define,
      "",
      `年代说明：${item.precision}`,
      "",
      item.references,
      "",
      `图中标识：\`${id}\``,
      "",
    ];
  }),
].join("\n");
const sourceMarker = "\n## 春秋到汉初补充来源（2026-10-15）";
const sourceDoc =
  (await read("SOURCES.md")).split(sourceMarker)[0].trimEnd() +
  sourceMarker +
  "\n\n" +
  "本次补充以《左传》《史记》《汉书》的具体篇章核对事件脉络，公元纪年采用通行换算；早期史籍仍包含后出叙述与纪年矛盾，不能视为同时代逐字实录。人物对话、战果数字、成书年代均保留必要限定。争议与阅读方法见[春秋到汉初导读](./notes/early-china.md)，逐条对应见[条目目录](./notes/early-catalog.md)。此前现代事件核对截止日期仍为2026-10-14。\n\n" +
  Object.entries(sources)
    .map(([key, [title, url]]) => `- **early.${key}**：[${title}](${url})`)
    .join("\n") +
  "\n";
const readme = (await read("README.md")).replace(
  /\*\*\d+ 个事件、时期及年代范围\*\*、\*\*\d+ 条关系\*\*/,
  `**${nodeCount} 个事件、时期及年代范围**、**${edgeCount} 条关系**`,
);
const galleryUrl = new URL("src/workspace/examples.ts", project);
const gallery = (await readFile(galleryUrl, "utf8")).replace(
  /\d+ events & periods · \d+ relationships · (?:c\. )?\d+ BCE–2026/,
  `${nodeCount} events & periods · ${edgeCount} relationships · c. 1750 BCE–2026`,
);
const timelineDocUrl = new URL("docs/timeline.md", project);
const timelineDoc = (await readFile(timelineDocUrl, "utf8"))
  .replace(
    /Its \d+ events and periods and \d+ named relationships span (?:c\. )?\d+ BCE–2026 CE/,
    `Its ${nodeCount} events and periods and ${edgeCount} named relationships span c. 1750 BCE–2026 CE`,
  )
  .replace(/\d+ polity categories/, `${manifest.metadata.polityCount} polity or archaeological-site categories`)
  .replace(
    /\d+ polity or archaeological-site categories/,
    `${manifest.metadata.polityCount} polity or archaeological-site categories`,
  );
const outputs = [
  [new URL("china-history.json", root), JSON.stringify(graph, null, 2) + "\n"],
  [new URL("graph-studio.workspace.json", root), JSON.stringify(manifest, null, 2) + "\n"],
  [new URL("notes/early-catalog.md", root), catalog],
  [new URL("notes/pre-zhou-catalog.md", root), preZhou.catalog],
  [new URL("notes/pre-zhou-sources.md", root), preZhou.sourceDoc],
  [new URL("notes/han-three-catalog.md", root), hanThree.catalog],
  [new URL("notes/han-three-sources.md", root), hanThree.sourceDoc],
  [new URL("notes/jin-sui-catalog.md", root), jinSui.catalog],
  [new URL("notes/jin-sui-sources.md", root), jinSui.sourceDoc],
  [new URL("SOURCES.md", root), sourceDoc],
  [new URL("README.md", root), readme],
  [galleryUrl, gallery],
  [timelineDocUrl, timelineDoc],
];
for (const theme of Object.keys(topics)) {
  const name = `notes/${theme}.md`;
  let content = await read(name);
  const pointer = "[春秋到汉初专题](./early-china.md) · [新增条目与史料](./early-catalog.md)";
  if (!content.includes(pointer)) content = content.replace(/^(# [^\r\n]+\r?\n)/, `$1\n${pointer}\n`);
  const prePointer = "[二里头、商与西周专题](./pre-zhou.md) · [条目与史料](./pre-zhou-catalog.md)";
  if (!content.includes(prePointer)) content = content.replace(/^(# [^\r\n]+\r?\n)/, `$1\n${prePointer}\n`);
  const hanPointer = "[汉武帝到三国专题](./han-three.md) · [条目与史料](./han-three-catalog.md)";
  if (!content.includes(hanPointer)) content = content.replace(/^(# [^\r\n]+\r?\n)/, `$1\n${hanPointer}\n`);
  const jinPointer = "[晋到南北朝隋专题](./jin-sui.md) · [条目与史料](./jin-sui-catalog.md)";
  if (!content.includes(jinPointer)) content = content.replace(/^(# [^\r\n]+\r?\n)/, `$1\n${jinPointer}\n`);
  for (const id of [
    ...new Set([
      ...Object.keys(revisions),
      ...pointMarkers,
      ...Object.keys(hanThree.revisions),
      ...Object.keys(jinSui.revisions),
    ]),
  ]) {
    const item = graph.nodes[id];
    if (item.theme !== theme) continue;
    const heading = `## ${item.title}`;
    const from =
      content.indexOf(heading + "\n") >= 0 ? content.indexOf(heading + "\n") : content.indexOf(heading + "\r\n");
    if (from < 0) continue;
    const next = content.indexOf("\n## ", from + heading.length);
    const to = next < 0 ? content.length : next + 1;
    content =
      content.slice(0, from) +
      `${heading}\n\n**${item.dateLabel} · ${item.type}**\n\n${item.define}\n\n${item.references}\n\n` +
      content.slice(to);
  }
  outputs.push([new URL(name, root), content]);
}
for (const [url, content] of outputs) {
  if (check) assert.equal(await readFile(url, "utf8"), content, `Out of date: ${fileURLToPath(url)}`);
  else await writeFile(url, content, "utf8");
}
console.log(
  `${check ? "Checked" : "Updated"}: ${nodeCount} nodes, ${edgeCount} edges; ${preZhou.managed.size} pre-Zhou, ${managed.size} Spring–Han, ${hanThree.managed.size} Han–Three Kingdoms, ${jinSui.managed.size} Jin–Sui additions.`,
);
