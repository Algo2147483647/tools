import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  connections as baseConnections,
  records as baseRecords,
  sources as baseSources,
  themes,
} from "./data/china-history/catalog.mjs";
import {
  additionalSources,
  legacyPolities,
  amendments,
  additionalRecords,
  polityPeriods,
  removedConnections,
  additionalConnections,
} from "./data/china-history/expansion.mjs";
import { modernRecords, modernConnections, modernSources, modernAsOf } from "./data/china-history/modern.mjs";
import { republicRecords, republicConnections, republicSources } from "./data/china-history/republic.mjs";

const sources = { ...baseSources, ...additionalSources, ...modernSources, ...republicSources };
const assignments = Object.fromEntries(
  Object.entries(legacyPolities).flatMap(([polity, ids]) => ids.map((id) => [id, polity])),
);
const records = [
  ...baseRecords.map((record) => ({ ...record, ...amendments[record.id], polity: assignments[record.id] })),
  ...additionalRecords,
  ...modernRecords,
  ...republicRecords,
];
const connections = [
  ...baseConnections.filter(([a, b]) => !removedConnections.some(([x, y]) => x === a && y === b)),
  ...additionalConnections,
  ...modernConnections,
  ...republicConnections,
];

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../public/examples/china-history");
const check = process.argv.includes("--check");
const files = new Map();
const nodes = {};
const edges = [];

function iso(value) {
  if (typeof value === "string") return value;
  assert.ok(Number.isInteger(value) && value !== 0, "Catalog years use historical BCE/CE, without year zero");
  return value < -1 ? `-${String(-(value + 1)).padStart(6, "0")}` : String(value === -1 ? 0 : value).padStart(4, "0");
}
function stamp(value) {
  const parsed = /^(?<year>[+-]\d{6}|\d{4})(?:-(?<month>\d{2})-(?<day>\d{2}))?$/.exec(value);
  assert.ok(parsed, `Unsupported precision: ${value}`);
  const { year, month = "01", day = "01" } = parsed.groups;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  assert.ok(Number.isFinite(date.getTime()), `Invalid date: ${value}`);
  assert.equal(date.getUTCMonth(), Number(month) - 1, `Invalid month: ${value}`);
  assert.equal(date.getUTCDate(), Number(day), `Invalid day: ${value}`);
  return date.getTime();
}
function label(value) {
  if (typeof value === "string") return value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日");
  return value < 0 ? `公元前${-value}年` : `${value}年`;
}
const start = (node) => stamp(node.time.at ?? node.time.start);
const dated = (record) => (record.at ? label(record.at) : `${label(record.start)}—${label(record.end)}`);
const references = (record) =>
  record.refs
    .map((key) => {
      assert.ok(sources[key], `${record.id}: unknown source ${key}`);
      const [title, url] = sources[key];
      assert.equal(new URL(url).protocol, "https:");
      return `[${title}](${url})`;
    })
    .join(" · ");

for (const record of records) {
  assert.ok(!nodes[record.id], `Duplicate node: ${record.id}`);
  assert.ok(record.polity, `${record.id}: missing explicit polity`);
  assert.ok(themes[record.theme], `Unknown theme: ${record.theme}`);
  assert.ok(record.refs.length > 0 && record.summary.length > 12, `${record.id}: missing context or citations`);
  const time = record.at ? { at: iso(record.at) } : { start: iso(record.start), end: iso(record.end) };
  for (const value of Object.values(time)) assert.ok(stamp(value) <= stamp(modernAsOf), `${record.id}: future event`);
  if (!time.at) assert.ok(stamp(time.start) < stamp(time.end), `${record.id}: invalid interval`);
  nodes[record.id] = {
    title: record.title,
    type: record.polity,
    track: record.polity,
    polity: record.polity,
    ...(record.participants ? { participants: record.participants } : {}),
    topic: themes[record.theme][0],
    theme: record.theme,
    kind: record.kind ?? (time.at ? "事件" : "时期"),
    define: record.summary,
    dateLabel: dated(record),
    time,
    precision:
      record.precision ??
      (Object.values(time).every((value) => value.length === 10)
        ? "公历日；不表示事件发生于午夜。"
        : "年；未补造具体月日。时期边界采用说明中标明的分期。"),
    sources: record.refs.map((key) => sources[key][1]),
    references: references(record),
    notes: `[${themes[record.theme][0]}导读](./notes/${record.theme}.md) · [读图说明](./README.md) · [史料与编选约定](./SOURCES.md)`,
  };
}

// Attach events to their own political context, never to a date-inferred dynasty.
for (const record of records) {
  const parent = polityPeriods[record.polity];
  if (
    !parent ||
    parent === record.id ||
    !nodes[parent] ||
    connections.some(([a, b]) => (a === parent && b === record.id) || (a === record.id && b === parent))
  )
    continue;
  const owner = nodes[parent];
  const child = nodes[record.id];
  if (start(child) >= start(owner) && stamp(child.time.end ?? child.time.at) <= stamp(owner.time.end))
    connections.push([parent, record.id, "part-of", "所属政权时期的事件或活动"]);
}

const semantics = {
  "part-of": "某一事件或活动位于所选时期之内；不是严格意义的组织隶属关系。",
  reference: "标签明确描述的历史背景、共同主题、参与、更替或转折；不主张充分或唯一因果，也不将征服说成自愿融合。",
  sequence: "所选事件的先后次序，或标签明确说明的政权分立、更替；省略中间事件时会注明，先后本身不等于因果。",
  rendezvous: "不同政权路径交汇于明确的战争、议和、征服或政权转折事件；不表示参与方自愿合并，具体含义以边标签为准。",
};
for (const [source, target, kind, value, sourceAnchor = "start", targetAnchor = "start"] of connections) {
  assert.ok(nodes[source] && nodes[target], `${source} -> ${target}: unknown endpoint`);
  assert.ok(semantics[kind], `${source} -> ${target}: unknown relation`);
  assert.ok(!edges.some((edge) => edge.source === source && edge.target === target), "Duplicate directed pair");
  const anchor = (id, position) => stamp(nodes[id].time.at ?? nodes[id].time[position]);
  assert.ok(
    anchor(source, sourceAnchor) <= anchor(target, targetAnchor),
    `${source} -> ${target}: backward chronology`,
  );
  edges.push({
    id: `${kind}:${source}:${target}`,
    source,
    target,
    value,
    metadata: {
      timeline: {
        kind,
        sourceAnchor,
        targetAnchor,
        ...(kind !== "sequence" &&
        sourceAnchor !== "end" &&
        nodes[source].time.start &&
        anchor(target, targetAnchor) >= stamp(nodes[source].time.start) &&
        anchor(target, targetAnchor) <= stamp(nodes[source].time.end)
          ? { sourceTime: nodes[target].time.at ?? nodes[target].time[targetAnchor] }
          : {}),
      },
    },
  });
}

// Check acyclicity even when two events share a year/date.
const visiting = new Set(),
  done = new Set();
function visit(id) {
  assert.ok(!visiting.has(id), `Cycle at ${id}`);
  if (done.has(id)) return;
  visiting.add(id);
  for (const edge of edges.filter((item) => item.source === id)) visit(edge.target);
  visiting.delete(id);
  done.add(id);
}
Object.keys(nodes).forEach(visit);

const view = {
  layout: "flow",
  axis: "adaptive",
  tickStep: 100,
  tickUnit: "year",
  nodeGap: 24,
  compactness: 0.5,
  locked: false,
  pins: {},
};
const json = (path, value) => files.set(path, `${JSON.stringify(value, null, 2)}\n`);
json("china-history.json", {
  format: "graph-studio",
  version: 3,
  diagram: "dag",
  id: "china-history",
  title: "中国历史：分流与交汇",
  metadata: {
    language: "zh-CN",
    historicalScope: `公元前770年—${modernAsOf}；专题选编`,
    asOf: modernAsOf,
    timeline: { version: 1, timeZone: "UTC", view },
    description: "政权、文化、科技、制度、外交和战争共同构成一张时间关系图。类别只用颜色标识，不是固定轨道。",
    edgeSemantics: semantics,
  },
  nodes: Object.fromEntries(
    Object.entries(nodes).sort((a, b) => start(a[1]) - start(b[1]) || a[0].localeCompare(b[0])),
  ),
  edges,
});

files.set(
  "README.md",
  `# 中国历史：分流与交汇\n\n一张中文时间关系图，包含 **${records.length} 个事件、时期及年代范围**、**${edges.length} 条关系**，选取公元前770年至2026年的部分历史节点（资料核对截止${modernAsOf}）。\n\n默认使用 **Relation flow + Adaptive**。横向位置让关系更容易阅读；类别按事件所属政权组织，跨政权关系可以自由连接。纵向保持时间先后和同时性。\n\n## 读图\n\n- Type 按所属政权分类，如西汉、曹魏、蜀汉、北魏、唐、南宋。战争、思想、科技、制度等保留在 topic / theme 字段，并提供专题导读；多方事件另有 participants 字段。\n- 点表示事件；条表示标题命名的时期、系列活动或明确标注的年代范围。毕昇条是记载年代范围，不是连续研制期；郑和条覆盖系列航行及航次间隔。\n- 自适应时间轴会拉开密集时期、压缩稀疏时期；不能用画面长度比较真实时长。切换到固定间隔时间轴，并设置每100年或其他间隔，即可比较时间距离。\n- 线条交叉不表示关系合并。隋灭陈、靖康之变、南宋覆亡等汇合处都有明确事件节点；战争征服不等于自愿融合。\n- 北魏分为东魏、西魏，再分别延续到北齐、北周，展示分支；隋与陈接入589年事件，展示不同类别之间的汇合。\n- 868年《金刚经》同时联系造纸技术、译经文化与唐代时期；这些边说明主题背景，不宣称单一因果。\n- 历史纪年没有公元0年。数据采用ISO天文年编号，如公元前221年写作 **-000220**。只知年份的值保留为年份，不虚构1月1日发生。\n\n## 范围\n\n这是一份用于阅读和演示的历史选编，不是完整中国通史，也不是疆域沿革或朝代正统表。未收录的时期不代表历史空白。政权时期可能并存，年表分期亦可能有不同口径；相关节点直接注明。现代部分延续到2026年，纳入国家建设、经济改革、政治运动、人权、公共卫生及国际关系。资料核对截止${modernAsOf}；最近选录事件不代表此后没有历史事件，不补造未核实事件或未来结果。\n\n[史料、精度与关系约定](./SOURCES.md)\n\n## 专题导读\n\n${Object.entries(
    themes,
  )
    .map(([key, [title, description]]) => `- [${title}](./notes/${key}.md) — ${description}`)
    .join(
      "\n",
    )}\n\n## 重新生成\n\n编辑 **scripts/data/china-history/catalog.mjs** 、**expansion.mjs** 与 **modern.mjs**，运行 **node scripts/build-china-history.mjs**。使用 **node scripts/build-china-history.mjs --check** 检查已提交文件是否一致。生成过程离线、确定性运行，网页资料仅供核对，不是运行时依赖。\n`,
);

files.set(
  "SOURCES.md",
  `# 史料与编选约定\n\n本图据博物馆、图书馆、大学教学资料、学术研究及百科年表交叉编选，本次整理日期为 **2026年10月14日**。节点保存来源链接，以下导读保留事件与来源的对应。文字为简短独立概述，不是史料原文摘录。\n\n## 年代与时期边界\n\n多数记录只精确到年。所有正年补齐四位，公元前按ISO带符号六位天文年表示：公元前770年 = -000769，公元前221年 = -000220，公元前1年 = 0000。天文年编号与历史纪年之间有一年的编号差，不代表改动实际年代。年内排序不能表达该年内部的确切先后。\n\n民国成立、武昌起义、清帝退位、五四运动和中华人民共和国成立保留公历日期；事件并不声称发生于日期起点的午夜。安世高条采用“约年”，毕昇条明确为年代范围，其他长期活动也按标题标明含义。\n\n东周从前770年起，战国采用前475年分期。秦末采用参考年表前206年的口径；部分史著以前207年秦王投降为止。西汉前206年起点包含汉王时期，称帝是在前202年。唐条包含常见通史分期中的武周阶段，另以重叠时期条展示武周国号中断。元从1271年国号起，南宋至1279年，两者重叠。明条止于1644年北京政权结束，不否认南明延续。清条以1636年改国号为起点；后金、1644年迁都北京、南明和明郑另列。\n\n1840—1842年鸦片战争条采用战事阶段；有些来源标题从1839年的冲突起算。1937—1945年条明确为全面抗战阶段，不排除1931年开始的抗战。民国只标成立事件，不给出虚构的1949年政权终止。\n\n所选博物馆年表中个别正文存在与其表格不一致的日期，编选不机械照抄：秦统一用多源一致的前221年；西晋265年是建国，不写成当年灭吴；安史之乱只取755年爆发，不沿用将整个战争写至759年的简略条目。\n\n## 现代史的史料立场与不确定性\n\n现代史同时采用法律与政策原文、政府历史决议、解密档案、学术研究、联合国文件及人权组织的调查。政府材料可核对政策日期和官方立场，但不自动作为社会后果的唯一解释；调查报告的事实、归责与法律评价应分别阅读。\n\n大饥荒采用1958—1962年的跨地区范围，核心高峰为1959—1961年；超额死亡估算因人口基数、时间范围和方法而不同。六四明确记录军队开枪、平民伤亡及后续镇压，不把未经独立核验的某一死亡数字写成定论，也不把全部死难地点说成广场内部。新疆条目区分拘禁政策、联合国评估与中国政府回应；“可能构成危害人类罪”保留评估原有的条件性，不冒充法院判决。香港节点区分立法事实、政府理由与人权机构批评。生育政策、族群冲突及政治运动均不以政府标签替代具体行为分析。\n\n2026年规划仅记批准日期；规划目标不等于实现结果。每个节点保留独立来源，关系边注明先后或具体联系，避免把时间邻接写成因果。\n\n## 关系解释\n\n${Object.entries(
    semantics,
  )
    .map(([kind, explanation]) => `- **${kind}**：${explanation}`)
    .join(
      "\n",
    )}\n\n每条线的文字是具体解释。思想、技术和制度跨越许多地区、人物与时间，本图的主题联系不能代替完整传播史。分支汇入战争或政权转折节点时，只说明所标历史事件，不将征服、并存、交往统称为融合。\n\n## 来源目录\n\n${Object.entries(
    sources,
  )
    .map(([key, [title, url]]) => `- **${key}**：[${title}](${url})`)
    .join("\n")}\n`,
);

for (const [theme, [title, description]] of Object.entries(themes)) {
  const selected = records
    .filter((record) => record.theme === theme)
    .sort((a, b) => start(nodes[a.id]) - start(nodes[b.id]));
  files.set(
    `notes/${theme}.md`,
    `# ${title}\n\n${description}\n\n[读图说明](../README.md) · [史料与编选约定](../SOURCES.md)\n\n${selected.map((record) => `## ${record.title}\n\n**${dated(record)} · ${record.polity}**\n\n${record.summary}\n\n${record.precision ? `${record.precision}\n\n` : ""}${references(record)}\n`).join("\n")}\n`,
  );
}
json("graph-studio.workspace.json", {
  format: "graph-studio-workspace",
  version: 1,
  name: "中国历史",
  graphs: ["china-history.json"],
  defaultGraph: "china-history.json",
  metadata: {
    language: "zh-CN",
    nodeCount: records.length,
    edgeCount: edges.length,
    themeCount: Object.keys(themes).length,
    polityCount: new Set(records.map((record) => record.polity)).size,
    assets: [...files.keys()].filter((path) => path.endsWith(".md")).sort(),
  },
});

async function walk(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...(await walk(resolve(root, entry.name), `${path}/`)));
    else result.push(path);
  }
  return result;
}
if (check) {
  assert.deepEqual(
    (await walk(directory)).sort(),
    [...files.keys()].sort(),
    "China history generated file list differs",
  );
  for (const [path, contents] of files) {
    assert.equal(
      await readFile(resolve(directory, path), "utf8"),
      contents,
      `${path} is stale; run node scripts/build-china-history.mjs`,
    );
  }
} else {
  for (const [path, contents] of files) {
    await mkdir(dirname(resolve(directory, path)), { recursive: true });
    await writeFile(resolve(directory, path), contents);
  }
}
console.log(
  `China history ${check ? "verified" : "generated"}: ${records.length} nodes, ${edges.length} edges, 1 graph.`,
);
