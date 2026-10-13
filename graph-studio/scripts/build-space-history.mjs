import assert from "node:assert/strict";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  connections,
  missions,
  overviewIds as chronologyIds,
  standalone,
  themes,
} from "./data/space-history/catalog.mjs";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../public/examples/space-history");
const check = process.argv.includes("--check");
const snapshot = "2025-12-31";
const nodes = {};
const edges = [];
const files = new Map();
const date = (value) => Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
const compare = (a, b) => date(a.time.at ?? a.time.start) - date(b.time.at ?? b.time.start);
function node(id, content) {
  assert.ok(!nodes[id], `Duplicate node ${id}`);
  const values = content.time.at ? [content.time.at] : [content.time.start, content.time.end];
  assert.ok(
    values.every((value) => typeof value === "string" && Number.isFinite(date(value))),
    `${id}: invalid date`,
  );
  assert.ok(
    values.every((value) => date(value) <= date(snapshot)),
    `${id}: outside historical snapshot`,
  );
  if (values.length === 2) assert.ok(date(values[0]) < date(values[1]), `${id}: empty interval`);
  nodes[id] = content;
}
function edge(source, target, kind, value, sourceAnchor = "start", targetAnchor = "start") {
  assert.ok(nodes[source] && nodes[target], `${source} -> ${target}: missing endpoint`);
  const id = `${kind}:${source}:${target}`;
  assert.ok(!edges.some((item) => item.id === id), `Duplicate edge ${id}`);
  assert.ok(
    !edges.some((item) => item.source === source && item.target === target),
    `Duplicate directed pair ${source} -> ${target}`,
  );
  edges.push({ id, source, target, value, metadata: { timeline: { kind, sourceAnchor, targetAnchor } } });
}
function common(mission) {
  return {
    type: themes[mission.theme][0],
    theme: mission.theme,
    agency: mission.agency,
    track: themes[mission.theme][0],
    define: mission.summary,
    sources: mission.sources,
    references: mission.sources.map((url, i) => `[Source ${i + 1}](${url})`).join(" · "),
    notes: `[Theme notes](./notes/${mission.theme}.md) · [Reading the timeline](./README.md)`,
    precision: mission.precision ?? "UTC calendar day; no time-of-day precision is implied.",
  };
}
for (const mission of missions) {
  const data = common(mission);
  const first = mission.events[0][1],
    last = mission.events.at(-1)[1];
  node(`${mission.id}.phase`, {
    title: `${mission.title} — ${mission.phase}`,
    ...data,
    kind: "Duration",
    mission: mission.title,
    time: { start: first, end: last },
  });
  mission.events.forEach(([suffix, at, caption, source]) => {
    node(`${mission.id}.${suffix}`, {
      ...data,
      ...(source ? { sources: [source], references: `[Source](${source})` } : {}),
      title: `${mission.title}: ${caption}`,
      kind: "Milestone",
      mission: mission.title,
      time: { at },
    });
    edge(`${mission.id}.phase`, `${mission.id}.${suffix}`, "part-of", "Contains milestone");
  });
  for (let i = 1; i < mission.events.length; i++) {
    const before = mission.events[i - 1],
      after = mission.events[i];
    assert.ok(date(before[1]) <= date(after[1]), `${mission.id}: unsorted milestones`);
    edge(`${mission.id}.${before[0]}`, `${mission.id}.${after[0]}`, "sequence", "Next recorded mission milestone");
  }
}
for (const [id, title, at, theme, agency, summary, source] of standalone) {
  node(id, { ...common({ theme, agency, summary, sources: [source] }), title, kind: "Milestone", time: { at } });
}

// The two vehicles exist concurrently. Interval endpoints meet the same dated
// separation and docking events; they do not imply that Columbia landed.
const apollo = missions.find((mission) => mission.id === "apollo-11");
const at = (suffix) => nodes[`apollo-11.${suffix}`].time.at;
for (const [id, title, from, to, track, summary] of [
  [
    "columbia",
    "Columbia — independent lunar orbit",
    "separate",
    "dock",
    "Apollo 11 · Columbia",
    "Michael Collins remained in lunar orbit while Eagle descended, stayed on the surface and returned.",
  ],
  [
    "descent",
    "Eagle — separated flight to landing",
    "separate",
    "landing",
    "Apollo 11 · Eagle",
    "Eagle separated, entered its descent orbit and landed while Columbia remained in lunar orbit.",
  ],
  [
    "surface",
    "Eagle — lunar surface stay",
    "landing",
    "liftoff",
    "Apollo 11 · Eagle",
    "Armstrong and Aldrin worked and rested on the Moon; their first steps occurred inside this continuous surface interval.",
  ],
  [
    "ascent",
    "Eagle — ascent and rendezvous",
    "liftoff",
    "dock",
    "Apollo 11 · Eagle",
    "The ascent stage left the lunar surface and rejoined Columbia.",
  ],
]) {
  node(`apollo-11.${id}`, {
    ...common(apollo),
    title,
    define: summary,
    kind: "Duration",
    mission: apollo.title,
    track,
    time: { start: at(from), end: at(to) },
  });
  edge(`apollo-11.${from}`, `apollo-11.${id}`, "dependency", "Begins phase");
  edge(
    `apollo-11.${id}`,
    `apollo-11.${to}`,
    to === "dock" ? "rendezvous" : "dependency",
    to === "dock" ? "Rejoins at docking" : "Ends phase",
    "end",
  );
}
for (const id of ["landing", "first-step", "liftoff"]) nodes[`apollo-11.${id}`].track = "Apollo 11 · Eagle";
for (const id of ["launch", "lunar-orbit", "separate", "dock", "depart", "return"])
  nodes[`apollo-11.${id}`].track = "Apollo 11 · Columbia";
nodes["apollo-11.phase"].track = "Apollo 11 · mission";
edge("apollo-11.surface", "apollo-11.first-step", "part-of", "First step during surface stay");
for (const connection of connections) edge(...connection);

// Editorial chronology is visibly labelled, kept distinct from technical
// dependencies and physical rendezvous.
for (const theme of Object.keys(themes)) {
  const selected = chronologyIds.filter((id) => nodes[id].theme === theme).sort((a, b) => compare(nodes[a], nodes[b]));
  for (let i = 1; i < selected.length; i++) {
    const source = selected[i - 1],
      target = selected[i];
    if (!edges.some((item) => item.source === source && item.target === target)) {
      edge(source, target, "sequence", "Later selected milestone · chronology only");
    }
  }
}

const semantics = {
  sequence:
    "Recorded chronological order only. Does not assert a causal or technical dependency; selected-milestone links may skip intervening events.",
  "part-of":
    "Source contains the target milestone or hosted flight. Interval endpoints describe the named phase, not necessarily a whole mission.",
  dependency: "A dated boundary starts or completes the named Apollo 11 vehicle phase.",
  rendezvous: "Physical spacecraft rendezvous, docking or assembly, with the named event supplying the time.",
  reference:
    "A specifically labelled historical, programmatic or same-spacecraft relationship; not a causal assertion.",
};
function graph(id, title, ids, description) {
  const selected = new Set(ids);
  const graphNodes = Object.fromEntries(
    Object.entries(nodes)
      .filter(([key]) => selected.has(key))
      .sort((a, b) => compare(a[1], b[1]) || a[0].localeCompare(b[0])),
  );
  assert.equal(Object.keys(graphNodes).length, selected.size, `${id}: unknown selected node`);
  return {
    format: "graph-studio",
    version: 3,
    diagram: "dag",
    id: `space-history-${id}`,
    title,
    metadata: {
      language: "en",
      snapshotAsOf: snapshot,
      timeline: { version: 1, timeZone: "UTC" },
      view: id,
      description,
      corpusNodeCount: Object.keys(nodes).length,
      edgeSemantics: semantics,
    },
    nodes: graphNodes,
    edges: edges.filter((item) => selected.has(item.source) && selected.has(item.target)),
  };
}
function json(path, data) {
  files.set(path, `${JSON.stringify(data, null, 2)}\n`);
}
json(
  "space-history.json",
  graph(
    "all",
    "World space history — complete timeline",
    Object.keys(nodes),
    "All 298 curated events and phases in one timeline, 1957–2025. Use Type, Track and Time range to focus on a theme, mission or period without switching graphs.",
  ),
);
for (const [theme, [title, description]] of Object.entries(themes)) {
  const ids = Object.keys(nodes).filter((id) => nodes[id].theme === theme);
  const localMissions = missions.filter((mission) => mission.theme === theme);
  const singles = standalone.filter((item) => item[3] === theme);
  files.set(
    `notes/${theme}.md`,
    `# ${title}\n\n${description}\n\n[Workspace guide](../README.md) · [Sources and date conventions](../SOURCES.md)\n\nAll ${ids.length} events and phases in this theme are included in **space-history.json**. Choose **${title}** in the Type filter to focus on them within the same timeline.\n\n` +
      localMissions
        .map(
          (mission) =>
            `## ${mission.title}\n\n${mission.summary}\n\n**Interval:** ${mission.phase}, ${mission.events[0][1]} to ${mission.events.at(-1)[1]}.\n\n${mission.events.map(([, date, caption]) => `- **${date}** — ${caption}`).join("\n")}\n\n${mission.sources.map((url, i) => `[Source ${i + 1}](${url})`).join(" · ")}\n`,
        )
        .join("\n") +
      (singles.length
        ? `\n## Additional milestones\n\n${singles.map(([, title, date, , , summary, source]) => `- **${date} — ${title}.** ${summary} [Source](${source})`).join("\n")}\n`
        : ""),
  );
}

const sourceList = [...new Set(Object.values(nodes).flatMap((content) => content.sources))].sort();
files.set(
  "SOURCES.md",
  `# Sources and editorial conventions\n\nThis is a selected educational history through **${snapshot}**, compiled from the primary and institutional sources linked below. It is not an exhaustive launch catalog or a live mission-status service. Each node retains its source URLs; the theme notes list dates together with their mission context.\n\n## Date precision\n\nMost nodes retain UTC calendar-day precision as YYYY-MM-DD. They are positioned at the start of that date for layout; this does not claim an event happened at midnight. Apollo 11 has explicit UTC timestamps for zooming into its vehicle branches. UTC conversion matters: Explorer 1 launched February 1 UTC (January 31 in Florida); Mir launched February 19 UTC (February 20 Moscow); Apollo 16 landed April 21 UTC; Chang'e 3 launched December 1 UTC; Hayabusa2's capsule returned December 5 UTC.\n\nThe NSSDC chronology is used to resolve UTC launch dates when a NASA narrative uses a local date. The NASA Moon mission table reports Luna 2's September 13 UTC impact; older summaries sometimes use September 14. Dates are manually curated rather than blindly copied from inconsistent aggregate tables.\n\n## Interval meaning\n\nA thick interval is explicitly named: orbital lifetime, crewed flight, cruise to encounter, sample-return phase or commissioning. An orbital lifetime includes dormant flight and is not a claim of continuous operations. A cruise ends at the encounter, even when the spacecraft continues working. No interval is extended to the present and no unverified current operational status is inferred.\n\n## Relationships\n\n${Object.entries(
    semantics,
  )
    .map(([kind, meaning]) => `- **${kind}:** ${meaning}`)
    .join(
      "\n",
    )}\n\nThe timeline includes deliberate chronological links between selected milestones. Filtering does not invent replacement edges across hidden events. The Apollo 11 branches use actual vehicle separation and docking to demonstrate paths that physically rejoin.\n\n## Source directory\n\n${sourceList.map((url, i) => `${i + 1}. [${new URL(url).hostname} — ${decodeURIComponent(new URL(url).pathname).replace(/\/$/, "").split("/").pop()}](${url})`).join("\n")}\n`,
);
files.set(
  "README.md",
  `# World space history\n\nExplore **${Object.keys(nodes).length} nodes** and **${edges.length} relationships** together in **one complete timeline**, spanning eight themes. The historical snapshot ends on **${snapshot}**.\n\n**space-history.json** opens with the entire corpus. Use **Type**, **Track** and **Time range** to focus within this one graph, then **Show all events** to restore the full history. To inspect Apollo 11, select the crewed lunar theme and July 16–24, 1969; Eagle and Columbia retain their parallel activity and later docking.\n\n## Read the timeline\n\n- A dot is a dated milestone; a thick bar is one named continuous interval. Each remains a graph node.\n- Time spacing is proportional. Zoom into dense periods to read individual events, or filter by theme and date.\n- Thematic tracks are editorial lanes, not spacecraft or national ownership. Agency and country context appears in the node details. Apollo 11 has explicit vehicle tracks.\n- Thin lines carry their own relationship labels. Chronology is not causality; two adjacent dates need not represent a technical dependency.\n- Date-only values have day precision. Apollo 11 carries finer UTC timestamps.\n- No open-ended bar claims a historical mission is still operating; active spacecraft are represented by completed phases and past milestones.\n\n## Theme guide\n\n${Object.entries(
    themes,
  )
    .map(([key, [title, description]]) => `- [${title}](./notes/${key}.md) — ${description}`)
    .join(
      "\n",
    )}\n\n[Sources and date conventions](./SOURCES.md)\n\n## Reproducible corpus\n\nThe source catalog is **scripts/data/space-history/catalog.mjs**. Rebuild with **node scripts/build-space-history.mjs**, or verify committed outputs without writing with **node scripts/build-space-history.mjs --check**. The build is offline and deterministic; live websites are reference material, not runtime dependencies. Every event and relationship is emitted once in the single timeline graph.\n`,
);
const graphPaths = ["space-history.json"];
json("graph-studio.workspace.json", {
  format: "graph-studio-workspace",
  version: 1,
  name: "World space history",
  graphs: graphPaths,
  defaultGraph: "space-history.json",
  metadata: {
    language: "en",
    snapshotAsOf: snapshot,
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    themeCount: 8,
    missionPhaseCount: missions.length,
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
    "Space history has missing or unexpected generated files",
  );
  for (const [path, contents] of files)
    assert.equal(
      await readFile(resolve(directory, path), "utf8"),
      contents,
      `${path} is stale; run node scripts/build-space-history.mjs`,
    );
} else {
  // Retire only the known generated split views. Leave unrelated files untouched.
  for (const id of [...Object.keys(themes), "apollo-11", "all-space-history"]) {
    const path = resolve(directory, `${id}.json`);
    assert.equal(dirname(path), directory);
    let previous;
    try {
      previous = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const expectedId = id === "all-space-history" ? "all" : id;
    assert.ok(
      previous.format === "graph-studio" && previous.id === `space-history-${expectedId}`,
      `Refusing to remove an unrecognized file: ${path}`,
    );
    await unlink(path);
  }
  for (const [path, contents] of files) {
    await mkdir(dirname(resolve(directory, path)), { recursive: true });
    await writeFile(resolve(directory, path), contents);
  }
}
console.log(
  `Space history ${check ? "verified" : "generated"}: ${Object.keys(nodes).length} nodes, ${edges.length} edges, ${graphPaths.length} graphs.`,
);
