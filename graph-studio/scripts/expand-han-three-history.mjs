import assert from "node:assert/strict";
import {
  convergences,
  events,
  links,
  participants,
  revisions,
  routes,
  sources,
} from "./data/china-history/han-three.mjs";

const topics = {
  polity: "政权与时期",
  conflict: "战争与变局",
  diplomacy: "交流与外交",
  economy: "经济与制度",
  ideas: "思想与文化",
  technology: "科技与工程",
};
const year = (value) => {
  assert.ok(Number.isInteger(value) && value !== 0);
  return value < -1 ? `-${String(-value - 1).padStart(6, "0")}` : String(value === -1 ? 0 : value).padStart(4, "0");
};
const sourceFields = (keys) => {
  assert.ok(keys.length && keys.every((key) => sources[key]), `Unknown source: ${keys}`);
  return {
    sources: keys.map((key) => sources[key][1]),
    references: keys.map((key) => `[${sources[key][0]}](${sources[key][1]})`).join(" · "),
  };
};
const notes = (theme) =>
  `[汉武帝到三国导读](./notes/han-three.md) · [条目与史料](./notes/han-three-catalog.md) · [${topics[theme]}](./notes/${theme}.md) · [来源与纪年](./notes/han-three-sources.md)`;

// The shared builder validates the complete DAG and writes/checks all outputs.
export function expandHanThree(graph) {
  const managed = new Set();
  for (const [id, title, polity, date, theme, define, keys, precision] of events) {
    assert.ok(!managed.has(id), `Duplicate Han–Three Kingdoms node: ${id}`);
    assert.ok(!graph.nodes[id] || graph.nodes[id].title === title, `Node id collision: ${id}`);
    assert.ok(topics[theme]);
    managed.add(id);
    graph.nodes[id] = {
      title,
      type: polity,
      track: polity,
      polity,
      topic: topics[theme],
      theme,
      kind: "事件",
      define,
      dateLabel: `${precision?.includes("约年") ? "约" : ""}公元${date < 0 ? "前" : ""}${Math.abs(date)}年`,
      time: { at: year(date) },
      precision: precision || "年；未补造月日。同年事件的年内先后见叙述，图上共用年刻度。",
      ...sourceFields(keys),
      notes: notes(theme),
      ...(participants[id] ? { participants: participants[id] } : {}),
    };
  }
  for (const [id, { sources: keys, ...changes }] of Object.entries(revisions)) {
    assert.ok(graph.nodes[id] && !managed.has(id), `Missing or overlapping revision: ${id}`);
    Object.assign(graph.nodes[id], changes, sourceFields(keys), { notes: notes(graph.nodes[id].theme) });
  }
  graph.metadata.supplements.hanThreeKingdoms = {
    updated: "2026-10-15",
    scope: "汉武帝至三国终结，前141—280年；新增均为点事件",
    addedNodes: managed.size,
    revisedNodes: Object.keys(revisions).length,
    guide: "notes/han-three.md",
  };
  graph.edges = graph.edges.filter((edge) => !edge.id.startsWith("han-three:"));
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
      id: `han-three:${kind}:${source}:${target}`,
      source,
      target,
      value,
      metadata: { timeline: { kind, sourceAnchor, targetAnchor: "start", ...(sourceTime ? { sourceTime } : {}) } },
    });
  };
  for (const [label, route] of routes) {
    for (let i = 1; i < route.length; i++) add(route[i - 1], route[i], label);
  }
  for (const row of links) add(...row);
  for (const [source, target, label, anchor] of convergences) add(source, target, label, "rendezvous", anchor);
  const parents = ["western-han", "xin", "gengshi", "eastern-han", "cao-wei", "shu-han", "eastern-wu", "western-jin"];
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
    if (parent) add(parent, id, "本时期内的事件；时代归类不等于参与者效忠该政权", "part-of", "start", start(id));
  }
  const ordered = [...managed, ...Object.keys(revisions)].sort(
    (a, b) => Number(start(a)) - Number(start(b)) || a.localeCompare(b, "en"),
  );
  const catalog = [
    "# 汉武帝到三国：条目与史料",
    "",
    `新增${managed.size}个点事件，修订${Object.keys(revisions).length}个原有事件。按年份排列；同年条目的显示顺序不代表月日先后。先读[叙事导读](./han-three.md)与[来源、纪年说明](./han-three-sources.md)。`,
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
    "# 汉武帝到三国：来源与纪年",
    "",
    "补充核对日期：2026-10-15。范围由前141年武帝即位接到280年晋灭吴。新增全部采用点事件，原有西汉、新、更始、东汉、魏蜀吴与西晋时期条继续提供背景。现代事件核对截止仍为2026-10-14。",
    "",
    "## 史料如何使用",
    "",
    "主要依据《汉书》《后汉书》《三国志》《晋书》的本纪、列传和志，交叉阅读不同政权及人物的记载。这些书的成书时间、材料来源和政治立场不同，纪传中的褒贬、谋反指控、投降解释和战果数字不能不加区别地当作现场记录。《三国志》裴松之注所引异说也应与陈寿正文区分。本图用独立概述，不以小说情节填补史料空白。",
    "",
    "制度条目区分法令颁行、地方执行与长期效果；技术条目区分文字记载、已有实践和现代复原。蔡伦奏纸不是纸张的第一次出现，张衡地动仪的记载不是对现代复原器性能的证明，刘徽注书也不是原书首创。熹平石经另外参考国家博物馆实物说明。",
    "",
    "## 年份与分期",
    "",
    "公元前采用历史纪年，数据内部换算成ISO天文年：前119年为-000118，前1年为0000；历史叙述没有公元0年。公元年份补齐四位。只知年则只记年，不虚构月日。盐铁官营等逐步落实的制度，节点以通行约年定位并说明限度。",
    "",
    "张骞两次出使分别标启程，苏武出使与归汉分列；昆阳与长安陷落、刘秀称帝与36年消灭主要割据、赤壁与三国建国、279年伐吴与280年孙皓投降，均分别记录。",
    "",
    "孙权221年接受魏封吴王、222年建元黄武、229年称帝是三个节点。原图孙吴时期从222年开始，221年条目归孙权集团。九品官人法置于220年曹丕继任魏王之后、称帝之前，保留东汉末的时代归类。晋代魏沿用原图265年传统年表口径；农历年末受禅折算公历可到266年，节点明确说明，不另造第二次建国。",
    "",
    "## 关系线",
    "",
    "新增关系围绕战争、财政、继承、文化等阅读路线组织，标签说明后续、背景或比较。时间相邻本身不构成因果。政权结束使用原时期条的终点接入事件；时期内事件从其真实年份连接，不把所有线都挤到建国年。关系不是疆域、效忠或单一文明传播路线。",
    "",
    "## 来源目录",
    "",
    ...Object.entries(sources).map(([key, [title, url]]) => `- **hanThree.${key}**：[${title}](${url})`),
    "",
  ].join("\n");
  return { managed, revisions, catalog, sourceDoc };
}
