import assert from "node:assert/strict";
import {
  convergences,
  events,
  links,
  participants,
  revisions,
  routes,
  sources,
} from "./data/china-history/jin-sui.mjs";

const topics = {
  polity: "政权与时期",
  conflict: "战争与变局",
  diplomacy: "交流与外交",
  economy: "经济与制度",
  ideas: "思想与文化",
  technology: "科技与工程",
};
const sourceFields = (keys) => {
  assert.ok(keys.length && keys.every((key) => sources[key]), `Unknown Jin–Sui source: ${keys}`);
  return {
    sources: keys.map((key) => sources[key][1]),
    references: keys.map((key) => `[${sources[key][0]}](${sources[key][1]})`).join(" · "),
  };
};
const notes = (theme) =>
  `[晋到南北朝隋导读](./notes/jin-sui.md) · [条目与史料](./notes/jin-sui-catalog.md) · [${topics[theme]}](./notes/${theme}.md) · [来源与纪年](./notes/jin-sui-sources.md)`;

export function expandJinSui(graph) {
  const managed = new Set();
  for (const [id, title, polity, date, theme, define, keys, precision] of events) {
    assert.ok(!managed.has(id), `Duplicate Jin–Sui node: ${id}`);
    assert.ok(!graph.nodes[id] || graph.nodes[id].title === title, `Node id collision: ${id}`);
    assert.ok(Number.isInteger(date) && date >= 265 && date <= 618 && topics[theme]);
    managed.add(id);
    const approximate = precision?.includes("约540");
    graph.nodes[id] = {
      title,
      type: polity,
      track: polity,
      polity,
      topic: topics[theme],
      theme,
      kind: approximate ? "约年定位点" : "事件",
      define,
      dateLabel: `${approximate ? "约" : ""}公元${date}年`,
      time: { at: String(date).padStart(4, "0") },
      precision: precision || "年；未补造月日。同年事件共用年刻度，年内先后见说明。",
      ...sourceFields(keys),
      notes: notes(theme),
      ...(participants[id] ? { participants: participants[id] } : {}),
    };
  }
  for (const [id, { sources: keys, ...changes }] of Object.entries(revisions)) {
    assert.ok(graph.nodes[id] && !managed.has(id), `Missing or overlapping revision: ${id}`);
    Object.assign(graph.nodes[id], changes, sourceFields(keys), { notes: notes(graph.nodes[id].theme) });
  }
  graph.metadata.supplements.jinSui = {
    updated: "2026-10-15",
    scope: "西晋、东晋与十六国、南北朝、隋；接至618年建唐。新增均为点事件。",
    addedNodes: managed.size,
    revisedNodes: Object.keys(revisions).length,
    guide: "notes/jin-sui.md",
  };
  graph.edges = graph.edges.filter((edge) => !edge.id.startsWith("jin-sui:"));
  const start = (id) => graph.nodes[id].time.at || graph.nodes[id].time.start;
  const add = (source, target, value, kind = "reference", sourceAnchor = "start", sourceTime) => {
    assert.ok(graph.nodes[source] && graph.nodes[target], `Missing node: ${source} -> ${target}`);
    assert.ok(
      Number(sourceTime || (sourceAnchor === "end" ? graph.nodes[source].time.end : start(source))) <=
        Number(start(target)),
      `Backwards relation: ${source} -> ${target}`,
    );
    if (graph.edges.some((edge) => edge.source === source && edge.target === target)) return;
    graph.edges.push({
      id: `jin-sui:${kind}:${source}:${target}`,
      source,
      target,
      value,
      metadata: { timeline: { kind, sourceAnchor, targetAnchor: "start", ...(sourceTime ? { sourceTime } : {}) } },
    });
  };
  for (const [label, route] of routes) for (let i = 1; i < route.length; i++) add(route[i - 1], route[i], label);
  for (const row of links) add(...row);
  for (const [source, target, label] of convergences) add(source, target, label, "rendezvous", "end");
  const parents = [
    "western-jin",
    "han-zhao",
    "eastern-jin",
    "former-qin",
    "later-qin",
    "northern-wei",
    "liu-song",
    "southern-qi",
    "liang",
    "eastern-wei",
    "western-wei",
    "northern-qi",
    "northern-zhou",
    "chen",
    "sui",
    "tang",
  ];
  for (const id of managed) {
    const item = graph.nodes[id];
    const parent = parents.find((key) => {
      const period = graph.nodes[key];
      return (
        period.type === item.type &&
        Number(period.time.start) <= Number(start(id)) &&
        Number(period.time.end) >= Number(start(id))
      );
    });
    if (parent) add(parent, id, "所属政权或时代内的事件；不表示所有参与者效忠该政权", "part-of", "start", start(id));
  }
  const ordered = [...managed, ...Object.keys(revisions)].sort(
    (a, b) => Number(start(a)) - Number(start(b)) || a.localeCompare(b, "en"),
  );
  const catalog = [
    "# 晋到南北朝隋：条目与史料",
    "",
    `新增${managed.size}个点事件，修订${Object.keys(revisions).length}个原有条目。原有政权和工程时期条保留，不新增长线段。先读[叙事导读](./jin-sui.md)与[来源、纪年说明](./jin-sui-sources.md)。同年排列不表达月日先后。`,
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
  const sourceDoc = [
    "# 晋到南北朝隋：来源与纪年",
    "",
    "补充核对日期：2026-10-15。接续265年晋建国及280年灭吴，展开西晋、东晋与十六国、南北朝和隋，止于618年建唐的衔接点。现代史核对截止仍为2026-10-14。",
    "",
    "## 文献与立场",
    "",
    "以《晋书》的帝纪、载记及列传，《宋书》《南齐书》《梁书》《陈书》《魏书》《北齐书》《周书》《隋书》为主要材料。诸书的编纂年代、政权立场、保存和补写情况不同，敌国称谓、叛臣分类、族属标签及祥瑞叙事不能照搬为中立结论。叙述采用今人独立概述；战果和屠杀不补造精确人数。",
    "",
    "《佛国记》和陶渊明作品帮助观察求法旅行与个人生活，但自述同样有选择。石窟创建的传说纪年与现存遗迹断代分别处理。农书的成书时间只作约年定位，制度条文也不等于各地实际执行效果。",
    "",
    "## 并行政权与节点精度",
    "",
    "全部新增条目采用点，不为十六国逐一添加存续长线。十六国是后世选定的政权集合，不表示只有十六个政权或十六族一一建国。王号、帝号、改国号、失去都城和最终覆亡分别说明。新类别前凉、后赵、成汉、各燕凉等用于阅读分支，不代表现代民族疆界。",
    "",
    "301年张轨任凉州刺史只是前凉发展起点；304年刘渊和李雄称王均早于称帝；刘曜319年改赵与石勒建后赵并行。北燕采用407年高云取代慕容熙的常见起点，并另列409年冯跋掌权。胡夏区别于上古夏，江陵后梁区别于五代后梁。",
    "",
    "东晋时期沿用317年晋王阶段，318年称帝另列。北魏386年立国、398年迁平城、439年攻灭北凉分别成点；534年东魏与535年西魏分别出现。577年北周灭齐、581年建隋、587年废江陵后梁与589年灭陈不是同一次统一。618年为本图隋的通史终点，不否认洛阳隋廷延续到619年，也不表示唐已统一全国。",
    "",
    "《齐民要术》用约540年作阅读坐标，保留533—544年前后成书讨论，不能视为确切完稿年。莫高窟366年是传统创建纪年，并非现存每座早期洞窟的施工年。法显的出发、归国以及大明历的提出、颁用分别列点。",
    "",
    "八王之乱的原时期条保留为总览，关键政变和战争另列；云冈的原工程范围与隋运河范围保留。关系标签区分比较、背景和具体发展，同年并行不主张直接因果。原政权终点接入新节点时使用结束锚点。",
    "",
    "## 来源目录",
    "",
    ...Object.entries(sources)
      .filter(
        ([key]) =>
          events.some((row) => row[6].includes(key)) ||
          Object.values(revisions).some((row) => row.sources.includes(key)),
      )
      .map(([key, [title, url]]) => `- **jinSui.${key}**：[${title}](${url})`),
    "",
  ].join("\n");
  return { managed, revisions, catalog, sourceDoc };
}
