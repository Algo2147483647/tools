import assert from "node:assert/strict";
import {
  convergences,
  events,
  links,
  participants,
  revisions,
  routes,
  sourceIntroduction,
  sources,
} from "./data/china-history/yuan-qing.mjs";

const topics = {
  polity: "政权与时期",
  conflict: "战争与变局",
  diplomacy: "交流与外交",
  economy: "经济与制度",
  ideas: "思想与文化",
  technology: "科技与工程",
};
const sourceFields = (keys) => {
  assert.ok(keys.length && keys.every((key) => sources[key]), `Unknown Yuan–Qing source: ${keys}`);
  return {
    sources: keys.map((key) => sources[key][1]),
    references: keys.map((key) => `[${sources[key][0]}](${sources[key][1]})`).join(" · "),
  };
};
const notes = (theme) =>
  `[元明清导读](./notes/yuan-qing.md) · [条目与史料](./notes/yuan-qing-catalog.md) · [${topics[theme]}](./notes/${theme}.md) · [来源与纪年](./notes/yuan-qing-sources.md)`;

export function expandYuanQing(graph) {
  const managed = new Set();
  for (const [id, title, polity, date, theme, define, keys, precision] of events) {
    assert.ok(!managed.has(id), `Duplicate Yuan–Qing node: ${id}`);
    assert.ok(!graph.nodes[id] || graph.nodes[id].title === title, `Node id collision: ${id}`);
    assert.ok(Number.isInteger(date) && date >= 1272 && date <= 1912 && topics[theme]);
    managed.add(id);
    const approximate = precision?.startsWith("以约");
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
      precision: precision || "年；未补造月日。同年事件共用年刻度，年内先后以文字说明为准。",
      ...sourceFields(keys),
      notes: notes(theme),
      ...(participants[id] ? { participants: participants[id] } : {}),
    };
  }
  for (const [id, { sources: keys, ...changes }] of Object.entries(revisions)) {
    assert.ok(graph.nodes[id] && !managed.has(id), `Missing or overlapping revision: ${id}`);
    Object.assign(graph.nodes[id], changes, sourceFields(keys), { notes: notes(graph.nodes[id].theme) });
  }
  graph.metadata.supplements.yuanQing = {
    updated: "2026-10-15",
    scope: "接续元初条目，细化元明清及元末、明清之际并行政权，接到1912年清帝退位；新增均为点。",
    addedNodes: managed.size,
    revisedNodes: Object.keys(revisions).length,
    guide: "notes/yuan-qing.md",
  };
  graph.edges = graph.edges.filter((edge) => !edge.id.startsWith("yuan-qing:"));
  const start = (id) => graph.nodes[id].time.at || graph.nodes[id].time.start;
  const ordinal = (value) =>
    Number(value.slice(0, 4)) * 10000 + Number(value.slice(5, 7) || 1) * 100 + Number(value.slice(8, 10) || 1);
  const add = (source, target, value, kind = "reference", sourceAnchor = "start", sourceTime) => {
    assert.ok(graph.nodes[source] && graph.nodes[target], `Missing node: ${source} -> ${target}`);
    const from = sourceTime || (sourceAnchor === "end" ? graph.nodes[source].time.end : start(source));
    assert.ok(from && ordinal(from) <= ordinal(start(target)), `Backwards relation: ${source} -> ${target}`);
    if (graph.edges.some((edge) => edge.source === source && edge.target === target)) return;
    graph.edges.push({
      id: `yuan-qing:${kind}:${source}:${target}`,
      source,
      target,
      value,
      metadata: { timeline: { kind, sourceAnchor, targetAnchor: "start", ...(sourceTime ? { sourceTime } : {}) } },
    });
  };
  for (const [label, route] of routes) for (let i = 1; i < route.length; i++) add(route[i - 1], route[i], label);
  for (const row of links) add(...row);
  for (const [source, target, label] of convergences) add(source, target, label, "rendezvous", "end");
  const parents = ["yuan", "ming", "later-jin-qing", "qing", "southern-ming", "zheng-taiwan", "taiping"];
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
    if (parent) add(parent, id, "所属政权或时代内的事件；不表示全部参与者政治隶属一致", "part-of", "start", start(id));
  }
  const ordered = [...managed, ...Object.keys(revisions)].sort(
    (a, b) => ordinal(start(a)) - ordinal(start(b)) || a.localeCompare(b, "en"),
  );
  const catalog = [
    "# 元明清：条目与史料",
    "",
    `新增${managed.size}个点事件，修订${Object.keys(revisions).length}个原条目。接续[隋唐到南宋末](./tang-song.md)中的元初条目；不新增长线段。先读[叙事导读](./yuan-qing.md)和[来源与纪年](./yuan-qing-sources.md)。同年排列不表达月日先后。`,
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
    ...sourceIntroduction,
    ...Object.entries(sources)
      .filter(
        ([key]) =>
          events.some((row) => row[6].includes(key)) ||
          Object.values(revisions).some((row) => row.sources.includes(key)),
      )
      .map(([key, [title, url]]) => `- **yuanQing.${key}**：[${title}](${url})`),
    "",
  ].join("\n");
  return { managed, revisions, catalog, sourceDoc };
}
