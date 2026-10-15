import assert from "node:assert/strict";
import {
  convergences,
  events,
  links,
  participants,
  revisions,
  routes,
  sources,
} from "./data/china-history/tang-song.mjs";

const topics = {
  polity: "政权与时期",
  conflict: "战争与变局",
  diplomacy: "交流与外交",
  economy: "经济与制度",
  ideas: "思想与文化",
  technology: "科技与工程",
};
const sourceFields = (keys) => {
  assert.ok(keys.length && keys.every((key) => sources[key]), `Unknown Tang–Song source: ${keys}`);
  return {
    sources: keys.map((key) => sources[key][1]),
    references: keys.map((key) => `[${sources[key][0]}](${sources[key][1]})`).join(" · "),
  };
};
const notes = (theme) =>
  `[隋唐到南宋末导读](./notes/tang-song.md) · [条目与史料](./notes/tang-song-catalog.md) · [${topics[theme]}](./notes/${theme}.md) · [来源与纪年](./notes/tang-song-sources.md)`;

export function expandTangSong(graph) {
  const managed = new Set();
  for (const [id, title, polity, date, theme, define, keys, precision] of events) {
    assert.ok(!managed.has(id), `Duplicate Tang–Song node: ${id}`);
    assert.ok(!graph.nodes[id] || graph.nodes[id].title === title, `Node id collision: ${id}`);
    assert.ok(Number.isInteger(date) && date >= 607 && date <= 1279 && topics[theme]);
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
  graph.metadata.supplements.tangSong = {
    updated: "2026-10-15",
    scope: "接续隋代既有条目，细化唐、五代十国、宋辽夏金及蒙古兴起，止于1279年南宋末；新增均为点。",
    addedNodes: managed.size,
    revisedNodes: Object.keys(revisions).length,
    guide: "notes/tang-song.md",
  };
  graph.edges = graph.edges.filter((edge) => !edge.id.startsWith("tang-song:"));
  const start = (id) => graph.nodes[id].time.at || graph.nodes[id].time.start;
  const add = (source, target, value, kind = "reference", sourceAnchor = "start", sourceTime) => {
    assert.ok(graph.nodes[source] && graph.nodes[target], `Missing node: ${source} -> ${target}`);
    const from = sourceTime || (sourceAnchor === "end" ? graph.nodes[source].time.end : start(source));
    assert.ok(from && Number(from) <= Number(start(target)), `Backwards relation: ${source} -> ${target}`);
    if (graph.edges.some((edge) => edge.source === source && edge.target === target)) return;
    graph.edges.push({
      id: `tang-song:${kind}:${source}:${target}`,
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
    "sui",
    "tang",
    "wu-zhou",
    "southern-wu",
    "former-shu",
    "later-liang",
    "wuyue",
    "min",
    "liao",
    "southern-han",
    "later-tang",
    "jingnan",
    "ma-chu",
    "later-shu",
    "later-jin",
    "dali",
    "southern-tang",
    "later-han",
    "later-zhou",
    "northern-han",
    "northern-song",
    "western-xia",
    "jurchen-jin",
    "southern-song",
    "mongol-empire",
    "yuan",
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
    if (parent) add(parent, id, "所属政权或时代内的事件；不表示全部参与者政治隶属一致", "part-of", "start", start(id));
  }
  const ordered = [...managed, ...Object.keys(revisions)].sort(
    (a, b) => Number(start(a)) - Number(start(b)) || a.localeCompare(b, "en"),
  );
  const catalog = [
    "# 隋唐到南宋末：条目与史料",
    "",
    `新增${managed.size}个点事件，修订${Object.keys(revisions).length}个原条目。接续[晋到南北朝隋](./jin-sui.md)的隋代条目；不新增长线段。先读[叙事导读](./tang-song.md)和[来源与纪年](./tang-song-sources.md)。同年排列不表达月日先后。`,
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
    "# 隋唐到南宋末：来源与纪年",
    "",
    "补充核对日期：2026-10-15。隋代沿用上一专题的细分，增加法典与洛阳隋廷衔接点，重点展开618—1279年。现代史资料截止仍为2026-10-14。",
    "",
    "## 史料使用",
    "",
    "唐代主要据《旧唐书》的帝纪、食货志、刑法志和相关列传；五代十国据《新五代史》本纪与世家；宋辽夏金和蒙古时期并读《宋史》《辽史》《金史》《元史》。这些书编纂较晚，具有不同政治立场，不能将敌国贬称、祥瑞、人物对话和战果数字直接当成无偏见的实录。节点采用独立概述，制度目标与实际执行、战争胜利与长期控制分别说明。",
    "",
    "西夏材料相对更多通过宋、元史籍保存，条目不假装拥有与宋代相同丰富的独立本国纪年记录。南诏、西辽另设类别而不新建长线；吐蕃、渤海、新罗、交趾等作为参与者或并行路线出现，册封、和亲和朝贡不能直接解释为州县行政统治。",
    "",
    "知识与文化条目补用《唐大和上东征传》《大唐大慈恩寺三藏法师传》、司马光呈书表、《东京梦华录》序、《岭外代答》《诸蕃志》《洗冤集录》等文本，以及博物馆资料。亲历、自述、追忆和商人转述的证据性质不同。书的成稿、呈书、刊行与所记事件年份分别处理。",
    "",
    "## 纪年和阶段边界",
    "",
    "新增节点均为年点。隋时期沿用581—618年通史口径，619年洛阳杨侗朝廷结束另列，不能据时期条末端否认其延续。唐初统一分陇右、中原、长江和河北等阶段；武氏655年立后、684年临朝、690年称帝与705年复唐分别处理。",
    "",
    "五代中原更替与十国并存不是一条朝代接力线。杨吴902年受封、919年建国和927年称帝分列；南唐937年建立时初号齐，939年复姓李并改唐见说明。前蜀、后蜀和三处刘氏汉政权不混同。宋960年建国后至979年仍有多轮地区整合，燕云等地不因此变成宋境。",
    "",
    "黄巢入长安按通行公历纪年取881年，史书作广明元年十二月；徽宗传位取1126年，史书作宣和七年十二月；开封第二次围城始于1126年，城陷已是公历1127年初；岳飞遇害按公历为1142年，史书作绍兴十一年十二月。澶渊盟约取1005年，绍兴和议取1141年而交割、册封等续至1142年。1076年宋军出征交趾，战事和撤军延至1077年。年刻度不强行补造公历月日。",
    "",
    "苏颂水运仪象台以约1088年定位研制阶段，不把设计、试制、完工和《新仪象法要》成书压成同一确年。《东京梦华录》以1147年序定位，其所写主要是北宋生活；《诸蕃志》以1225年序定位，材料多来自此前积累。",
    "",
    "辽以916年称帝起，947年大辽国号的采用另记；1125年为东部辽廷结束，西迁耶律大石一支另列。西辽称帝取常见1132年口径，具体西迁建国分期存在讨论。蒙古1206年建国、1260年汗位竞争、1271年元国号、1276年临安投降与1279年崖山分别成点。文天祥被俘以约1278年末至1279年初定位：传统年表多系于祥兴元年（1278），纪念馆有公历1279年初的换算；《宋史》《元史》月次不同，不补造统一月日。其1283年遇害在本专题范围之外。",
    "",
    "## 关系的含义",
    "",
    "路线标签标明政治更替、战争阶段、制度比较或知识活动背景。比较线不是因果线，未证实的直接传播不加箭头解释。时期成员边从事件当年的时期条内部接出；政权终结汇合使用结束锚点。仍保留原有全部时期与关系。",
    "",
    "## 来源目录",
    "",
    ...Object.entries(sources)
      .filter(
        ([key]) =>
          events.some((row) => row[6].includes(key)) ||
          Object.values(revisions).some((row) => row.sources.includes(key)),
      )
      .map(([key, [title, url]]) => `- **tangSong.${key}**：[${title}](${url})`),
    "",
  ].join("\n");
  return { managed, revisions, catalog, sourceDoc };
}
