import assert from "node:assert/strict";
import { entries, links, pointMarkers, sources } from "./data/china-history/pre-zhou.mjs";

const topics = {
  polity: "政权与时期",
  conflict: "战争与变局",
  diplomacy: "交流与外交",
  economy: "经济与制度",
  ideas: "思想与文化",
  technology: "科技与工程",
};
const year = (bce) => {
  assert.ok(Number.isInteger(bce) && bce > 0);
  return `-${String(bce - 1).padStart(6, "0")}`;
};
const references = (keys) => keys.map((key) => `[${sources[key][0]}](${sources[key][1]})`).join(" · ");

// Called by the existing incremental builder before its Spring–Han supplement.
// Its final shared validation and write/check phase cover both supplements.
export function expandPreZhou(graph) {
  const managed = new Set();
  for (const [id, title, polity, date, theme, define, keys, evidence, precision] of entries) {
    assert.ok(!managed.has(id), `Duplicate pre-Zhou node: ${id}`);
    assert.ok(!graph.nodes[id] || graph.nodes[id].title === title, `Node id collision: ${id}`);
    managed.add(id);
    assert.ok(keys.length && keys.every((key) => sources[key]), `Missing sources: ${id}`);
    assert.ok(precision && evidence);
    const range = Array.isArray(date);
    if (range) assert.ok(date[0] >= date[1], `Reversed BCE bounds: ${id}`);
    const point = pointMarkers.has(id);
    if (point) assert.ok(range, `A point marker must retain its original evidence window: ${id}`);
    const historicalRange = range ? { start: year(date[0]), end: year(date[1]) } : undefined;
    const qualified = !precision.startsWith("通行公元纪年") && !["gonghe", "king-xuan", "zhou-you"].includes(id);
    graph.nodes[id] = {
      title,
      type: polity,
      track: polity,
      polity,
      topic: topics[theme],
      theme,
      kind: point ? "约年定位点" : range ? "时期或年代范围" : "事件",
      define,
      dateLabel: `${qualified ? "约" : ""}公元前${range ? `${date[0]}—前${date[1]}` : date}年`,
      time: point ? { at: year(date[0]) } : range ? historicalRange : { at: year(date) },
      ...(point ? { historicalRange } : {}),
      precision: point
        ? `图上以约前${date[0]}年作定位点，取原年代窗口的较早端便于阅读，不表示此项活动确在该年发生或始创。原年代说明：${precision}`
        : precision,
      evidence,
      sources: keys.map((key) => sources[key][1]),
      references: references(keys),
      notes: `[二里头、商与西周导读](./notes/pre-zhou.md) · [条目与史料](./notes/pre-zhou-catalog.md) · [${topics[theme]}](./notes/${theme}.md) · [来源与断代约定](./notes/pre-zhou-sources.md)`,
    };
  }
  assert.ok(
    [...pointMarkers].every((id) => managed.has(id)),
    "Unknown pre-Zhou point marker",
  );
  graph.metadata.historicalScope = "约公元前1750年—2026-10-14；从二里头考古材料起的专题选编";
  graph.metadata.supplements = {
    ...graph.metadata.supplements,
    preZhou: {
      updated: "2026-10-15",
      scope: "二里头考古材料、商与西周；接入前770年东迁。无石器时代总览或夏朝王统。",
      addedNodes: managed.size,
      guide: "notes/pre-zhou.md",
      archaeologicalAttribution: "二里头单列遗址类别，不认定为夏都或指定王朝都城。",
    },
  };
  graph.edges = graph.edges.filter((edge) => !edge.id.startsWith("pre-zhou:"));
  const start = (id) => graph.nodes[id].time.at || graph.nodes[id].time.start;
  const add = (source, target, value, kind = "reference", sourceAnchor = "start", sourceTime) => {
    assert.ok(graph.nodes[source] && graph.nodes[target], `Missing node: ${source} -> ${target}`);
    if (graph.edges.some((edge) => edge.source === source && edge.target === target)) return;
    graph.edges.push({
      id: `pre-zhou:${kind}:${source}:${target}`,
      source,
      target,
      value,
      metadata: { timeline: { kind, sourceAnchor, targetAnchor: "start", ...(sourceTime ? { sourceTime } : {}) } },
    });
  };
  for (const row of links) add(...row);
  const parents = ["erlitou", "shang-period", "western-zhou", "zhou-rise"];
  for (const id of managed) {
    if (parents.includes(id)) continue;
    const item = graph.nodes[id];
    const parent = parents.find((key) => {
      const period = graph.nodes[key];
      return (
        period.type === item.type &&
        Number(start(key)) <= Number(start(id)) &&
        Number(period.time.end) >= Number(item.historicalRange?.end || item.time.end || start(id))
      );
    });
    if (parent)
      add(parent, id, "本时期或遗址年代内的专题；不将展示窗口当作精确活动起讫", "part-of", "start", start(id));
  }
  const ordered = [...managed].sort((a, b) => Number(start(a)) - Number(start(b)) || a.localeCompare(b, "en"));
  const catalog = [
    "# 二里头、商与西周：条目与史料",
    "",
    `本目录包含${managed.size}个新增节点。先读[叙事导读](./pre-zhou.md)与[年代及证据说明](./pre-zhou-sources.md)。周朝以前的23项、西周的26项专题以点显示，以下仍保留原材料年代范围；点的坐标不是确切发生年。主要时期与王世保留范围条。`,
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
        `证据：${item.evidence}。`,
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
    "# 二里头、商与西周：来源与断代",
    "",
    "补充核对日期：2026-10-15。范围依项目要求从二里头考古材料开始，不编写石器时代总览、夏朝王统或传说人物年表。后出的文献仍可参与商周史研究，但必须说明其性质。",
    "",
    "## 三类证据分别阅读",
    "",
    "- 建筑、墓葬、作坊与器物：可以支持空间、工艺及社会差异的研究；考古文化不自动等于某个王朝、族群或行政版图。",
    "- 甲骨与金文：接近所述活动的时代，但带有王室、贵族和仪式的选择，不是覆盖全社会的中立年鉴。",
    "- 《史记》等传世文献及战国竹简：保存早期历史记忆，也经历编写和传抄。出土较早的文本同样不等于商周当时的实录。",
    "",
    "## 图上的年份如何理解",
    "",
    "二里头采用约前1750—前1520年的系列测年方案作为图示边界，同时保留其他年代方案的说明。其政治归属不在本图中定论。商约前1600—前1046、西周约前1046—前771采用常见框架；前841年以前的具体王年与克商绝对年代仍应与确定的年序区别。",
    "",
    "周朝以前的23项、西周的26项考古、技术、社会及活动专题改用点状节点，取原年代窗口的较早端作为图上定位点，不把这一端点认定为确切发生年或发明年。原范围保留在 dateLabel、historicalRange 与 precision 中。二里头整体、商朝、商中期迁徙阶段、殷墟时期、武丁时期、商末王世、先周发展仍保留时期线。西周部分保留西周整体、成康、共和、宣王与幽王五条时期线；摄政、东征、封国前史、器物和制度等专题使用点显示。",
    "",
    "前841年起的通行连续纪年，不代表对共和主持者、事件原因或王位继承细节已经没有争论。金沙节点的材料范围截到前771年只是专题边界，遗址活动延续到春秋。",
    "",
    "关系线用于表达明确标注的背景、比较或先后。尤其二里头与早商、三星堆与金沙的关系包含并存和交叠，不画成单线接班；商周权力更替也不等于所有地区在同一年更换统治者。",
    "",
    "来源网页中的传统称谓、确定性表述与本图解释不必完全一致。二里头的都邑归属、严格整齐的井田模式、烽火戏诸侯等，不因出现在机构网站上便自动作为定论。逐项来源见[目录](./pre-zhou-catalog.md)。",
    "",
    "## 来源目录",
    "",
    ...Object.entries(sources).map(([key, [title, url]]) => `- **preZhou.${key}**：[${title}](${url})`),
    "",
  ].join("\n");
  return { managed, catalog, sourceDoc };
}
