import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ancient } from "./data/science-history/ancient.mjs";
import { earlyModern } from "./data/science-history/early-modern.mjs";
import { nineteenth } from "./data/science-history/nineteenth.mjs";
import { foundations } from "./data/science-history/foundations.mjs";
import { contemporary } from "./data/science-history/contemporary.mjs";
import { subjects, sections, names, source, isoYear } from "./data/science-history/shared.mjs";
import { bridges, intersections } from "./data/science-history/relations.mjs";
import { displayTitles } from "./data/science-history/display-titles.mjs";

const root = new URL("../public/examples/space-history/", import.meta.url);
const prefix = "mathematics-physics/";
const graphPath = `${prefix}mathematics-physics.json`;
const check = process.argv.includes("--check");
const corpus = { ancient, earlyModern, nineteenth, foundations, contemporary };
const rows = Object.entries(corpus).flatMap(([section, values]) => values.map((row) => ({ section, row })));
const events = rows
  .map(({ section, row }, order) => {
    assert.equal(row.length, 7, `Malformed event: ${row[0]}`);
    const [id, date, subject, title, define, sources, precision] = row;
    const year = Number(date);
    assert.ok(Number.isInteger(year) && year !== 0 && year >= -1900 && year <= 2024, id);
    assert.match(id, /^[a-z0-9-]+$/);
    assert.ok(subjects[subject] && title && define.length > 100 && sources && precision, id);
    return { id, year, subject, title, define, sources, precision, section, order };
  })
  .sort((a, b) => a.year - b.year || a.order - b.order);
const index = new Map(events.map((event, order) => [event.id, { ...event, order }]));
assert.equal(index.size, events.length, "Duplicate event IDs");
assert.deepEqual(
  Object.keys(displayTitles).sort(),
  [...index.keys()].sort(),
  "Every event needs a concise canvas label",
);
const nodes = {},
  edges = [],
  pairs = new Set(),
  sourceIndex = new Map();
const dateLabel = (year) => (year < 0 ? `${-year} BCE` : `${year} CE`);
for (const event of events) {
  const { id, year, subject, title, define, precision, section } = event;
  const refs = [
    ...new Map(
      event.sources.split(",").map((key) => {
        const [label, url] = source(key);
        assert.equal(new URL(url).protocol, "https:");
        if (!sourceIndex.has(url)) sourceIndex.set(url, { label, events: [] });
        sourceIndex.get(url).events.push(id);
        return [url, { label, url }];
      }),
    ).values(),
  ];
  const mentioned = names.filter(([native]) => `${title} ${define}`.includes(native));
  nodes[id] = {
    title: displayTitles[id],
    fullTitle: title,
    define,
    type: subjects[subject][0],
    track: subjects[subject][0],
    subject,
    discipline: intersections.has(id) ? "Mathematics and Physics" : subjects[subject][1],
    section,
    kind: "Point event",
    time: { at: isoYear(year) },
    dateLabel: dateLabel(year),
    precision: `${precision} The chart locates this event by year, not by an assumed 1 January date.`,
    nameForms: mentioned.map(([native]) => native),
    searchAliases: mentioned.map(([, alias]) => alias),
    sources: refs.map(({ url }) => url),
    references: refs.map(({ label, url }) => `[${label}](${url})`).join(" · "),
    notes: `[Period guide](./notes/${section}.md) · [Event catalog](./notes/${section}-catalog.md) · [Names](./NAMES.md) · [Sources](./SOURCES.md)`,
  };
}
function connect(from, to, label, kind) {
  assert.ok(nodes[from] && nodes[to], `Missing endpoint: ${from} -> ${to}`);
  assert.ok(index.get(from).year <= index.get(to).year, `Reverse chronology: ${from} -> ${to}`);
  assert.notEqual(from, to);
  const pair = `${from}:${to}`;
  if (pairs.has(pair)) return;
  pairs.add(pair);
  edges.push({
    id: `e-${from}--${to}`,
    source: from,
    target: to,
    value: 1,
    metadata: { label, timeline: { kind, sourceAnchor: "start", targetAnchor: "start" } },
  });
}
for (const [from, to, label] of bridges) connect(from, to, label, "reference");
for (const subject of Object.keys(subjects)) {
  const route = events.filter((event) => event.subject === subject);
  route
    .slice(1)
    .forEach((event, i) =>
      connect(
        route[i].id,
        event.id,
        route[i].year === event.year
          ? "Same-year reading order within a subject; no month-level priority or causal claim"
          : "Selected events in subject order; intervening work is omitted and chronology is not causation",
        "sequence",
      ),
    );
}
// Same-year cross-links still need an actual DAG check.
const incoming = new Map(events.map(({ id }) => [id, 0]));
const outgoing = new Map(events.map(({ id }) => [id, []]));
const touched = new Set();
for (const edge of edges) {
  incoming.set(edge.target, incoming.get(edge.target) + 1);
  outgoing.get(edge.source).push(edge.target);
  touched.add(edge.source);
  touched.add(edge.target);
}
const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
for (let i = 0; i < queue.length; i++)
  for (const next of outgoing.get(queue[i])) {
    incoming.set(next, incoming.get(next) - 1);
    if (incoming.get(next) === 0) queue.push(next);
  }
assert.equal(queue.length, events.length, `Cycle: ${[...incoming].filter(([, count]) => count).map(([id]) => id)}`);
assert.equal(touched.size, events.length, "Isolated events");
const graph = {
  format: "graph-studio",
  version: 3,
  diagram: "dag",
  id: "mathematics-physics-history",
  title: "History of Mathematics and Physics",
  metadata: {
    language: "en",
    compiledAsOf: "2026-10-16",
    latestIncludedYear: 2024,
    historicalScope: "Selected developments from c. 1850 BCE to 2024 CE",
    description:
      "One shared chronology with parallel mathematical and physical subjects, point events, qualified dates and explicit connections.",
    namingPolicy:
      "English prose and labels; personal names retain original-language standardized spellings or documented professional forms. Lookup aliases are provided separately.",
    nativeNameForms: names.map(([name]) => name),
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
      sequence:
        "Editorial reading order inside one subject, not a causal or exclusive intellectual lineage. Same-year ordering does not imply month-level precision.",
      reference:
        "A labeled mathematical application, experimental test, transmission, reformulation or explicitly qualified comparison. See the linked events' sources.",
    },
    sections: Object.fromEntries(
      Object.entries(sections).map(([key, title]) => [
        key,
        { title, guide: `notes/${key}.md`, eventCount: corpus[key].length },
      ]),
    ),
  },
  nodes,
  edges,
};
const files = new Map();
const json = (value) => JSON.stringify(value, null, 2).normalize("NFC") + "\n";
const guideLinks = Object.entries(sections)
  .map(
    ([key, title]) =>
      `- [${title}](./notes/${key}.md) · ${corpus[key].length} events · [Catalog](./notes/${key}-catalog.md)`,
  )
  .join("\n");
files.set(graphPath, json(graph));
files.set(
  `${prefix}README.md`,
  `# History of Mathematics and Physics

One combined canvas in **History of Technology**, separate from [World space history](../space-history.json). This selection contains **${events.length} point events**, **${edges.length} relationships**, **${Object.keys(subjects).length} subjects** and **${intersections.size} explicitly shared mathematics–physics events**, from approximately 1850 BCE to 2024 CE. It is a historical selection, not an exhaustive inventory or a live research feed.

[Open the combined canvas](./mathematics-physics.json) · [Workspace overview](../README.md) · [Personal names](./NAMES.md) · [Sources and methods](./SOURCES.md)

## How to read

Use Type or Track to follow a subject, and Time range to focus on a period. All nodes are point events: there are no long era bars. The full view brings mathematics and physics together; a node's discipline field identifies mathematics, physics or their intersection. Concise canvas labels keep dense periods readable; fullTitle preserves the complete historical heading in the details. Each event also has a substantive account, a date qualification, source links and a period guide. Search aliases help locate names without replacing their original script. After applying a time filter, select an event and use Locate selected event to move to its position on the shared axis.

The adaptive axis compresses long quiet gaps. Switch to a linear axis when comparing elapsed time: visual proximity in the adaptive view does not imply equal duration. BCE labels use historical years without a year zero; the file uses the corresponding astronomical ISO year internally. An event located by year does not assert that it happened on 1 January.

Subject sequences are reading aids, not claims of direct influence. Cross-links explain their relationship: application, transmission, experimental test, later interpretation, or a stated comparison. Independent traditions are not joined into an invented single line of descent. A conjecture, a model, a proof, an observation and a community verification are different kinds of historical achievement.

## Period guides

${guideLinks}

## Suggested journeys

- **Calculus and motion:** exhaustion and approximation → varying motion → differential calculus → variational methods → analytical mechanics → symmetry and conservation.
- **Geometry and gravitation:** alternative geometries → metrics and curvature → spacetime → gravitational field equations → singularity theorems → gravitational-wave observations.
- **Probability and matter:** games of chance → error estimation → molecular statistics → Brownian motion → measure-theoretic probability → stochastic calculus.
- **Algebra and quantum theory:** symbolic equations → matrices and operators → quantum states → non-Abelian gauge theory → topology of materials and four-dimensional geometry.
- **Proof and computation:** formal logic → incompleteness and computability → computer-assisted proofs → formal verification; quantum algorithms form a related but distinct route.

## Maintenance

The source corpus is in scripts/data/science-history/. Run npm run examples:science-history to regenerate the graph, catalogs and manifest; run npm run examples:science-history:check to verify reproducibility. The five period guides are maintained separately. The generator never rewrites the space-history graph. English is used for all exposition; native personal-name forms are the intentional exception.
`,
);
files.set(
  `${prefix}NAMES.md`,
  `# Personal names and language policy

[Canvas guide](./README.md) · [Sources](./SOURCES.md)

Personal names use original-language forms where these can be stated responsibly. Greek names use standard scholarly Greek spelling; Chinese names generally retain traditional characters; Japanese, Cyrillic, Arabic, Persian, Bengali, Tamil, Sanskrit and Malayalam forms are retained. Latin-script names keep their accents. English is used for titles of works, concepts, institutions, subjects and explanatory prose. Institutional abbreviations such as ATLAS and CMS remain their established identifiers.

There is not always a unique original name. Authors migrated, wrote in several languages, adopted professional names or were transmitted through later manuscripts. A conventional original-language spelling is not a facsimile of an ancient autograph. Sanskrit names shown in Devanagari and other standardized Indic spellings do not claim that every original text used that exact script. An Arabic scholarly name does not establish an author's ethnicity. The event text retains documented professional names for Latin-script authors rather than manufacturing a different script from ancestry alone.

The table provides alternate search forms, not replacement display names. It concentrates on spelling and script choices that need explanation; it is not a complete census of every person mentioned. Short names are identified by the event context. Unknown scribes and collective traditions are not assigned invented personal names. Neither a modern nationality nor a single person's name should absorb a collaborative discovery.

| Display form | Lookup alias | Language or convention |
| --- | --- | --- |
${names.map((row) => `| ${row.join(" | ")} |`).join("\n")}

Some authors legitimately have more than one original form. Joseph-Louis Lagrange is the established French professional form of an author born with an Italian name. Maria Skłodowska-Curie also published as Marie Curie. Neumann János also published under German and English forms. The Chinese personal name 陶哲軒 coexists with the author's English professional name. These choices preserve recognizable names without pretending that one spelling cancels the others.
`,
);
files.set(
  `${prefix}SOURCES.md`,
  `# Sources and historical method

[Canvas guide](./README.md) · [Names](./NAMES.md)

Compiled on 16 October 2026; the latest included research event is a 2024 publication. The selection is not a claim to have cataloged every development through the compilation date.

## Evidence and limitations

MacTutor at the University of St Andrews supplies scholarly historical biographies and topic studies. These are secondary accounts, not original ancient texts. Original papers are linked through DOI or arXiv where practical; CERN, LIGO, NIST, the Institute for Advanced Study, the American Institute of Physics, the American Physical Society, the Clay Mathematics Institute and Nobel scientific summaries provide research records, archival interpretation or institutional context. A prize page is supporting background: its award year must not replace the discovery or publication year.

Each event points to specific further reading. Source labels distinguish an original paper from a retrospective account. Links were checked for existence and targeted historical details were investigated; availability does not mean that every assertion in a long source has been independently re-edited. Publisher access controls can block automated retrieval without invalidating a DOI. The graph and its guides remain available offline after loading the workspace; external research links require internet access.

Ancient dates often identify an approximate manuscript, compilation or working period. Later testimony about lost works is explicitly marked. Similar methods in two traditions do not demonstrate direct transmission. The history includes anonymous scribal labor, translation, teaching, instruments and collaboration as well as named authors. Selection is necessarily uneven because surviving records and the available literature are uneven.

All points use year precision. The precision field separates manuscripts, lectures, publications, announcements and experiments. Particular examples include a geometry lecture in 1854 versus its 1868 publication; the 1938 fission findings versus their 1939 interpretation; a 1964 theoretical mechanism versus a 2012 particle observation; and the 2015 gravitational-wave signal versus the 2016 announcement. Proposals, conjectures and mathematical models are not labeled experimental confirmations. The classical singularity theorems do not supply a quantum account of singularities.

Ordinary subject edges indicate editorial reading order. Explicit cross-links state whether they describe use of a mathematical method, an experimental test, a transmission, a later reformulation or merely a comparison. Source support comes from the linked endpoint accounts; a comparison is not asserted to be a documented personal influence. The graph contains no invented continuous era bars and no implied temporal precision finer than the event evidence.

## Source index

${sourceIndex.size} distinct references, indexed by stable event IDs. The five event catalogs repeat the relevant source links alongside each account.

${[...sourceIndex].map(([url, item]) => `- [${item.label}](${url}) — ${[...new Set(item.events)].map((id) => `\`${id}\``).join(", ")}`).join("\n")}
`,
);
for (const [key, title] of Object.entries(sections)) {
  const entries = events.filter((event) => event.section === key);
  files.set(
    `${prefix}notes/${key}-catalog.md`,
    `# ${title}: event catalog\n\n[Period guide](./${key}.md) · [Overview](../README.md) · [Names](../NAMES.md)\n\n` +
      entries
        .map(({ id }) => {
          const n = nodes[id];
          return `## ${n.dateLabel} · ${n.fullTitle}\n\nID: \`${id}\` · ${n.type} · ${n.discipline}\n\n${n.define}\n\nDate: ${n.precision}\n\nSources: ${n.references}\n`;
        })
        .join("\n"),
  );
}
const workspace = JSON.parse(await readFile(new URL("graph-studio.workspace.json", root), "utf8"));
workspace.name = "History of Technology";
workspace.graphs = [...new Set([...workspace.graphs, graphPath])];
const stats = {};
const allTracks = new Set();
for (const path of workspace.graphs) {
  const value = path === graphPath ? graph : JSON.parse(await readFile(new URL(path, root), "utf8"));
  const items = Object.values(value.nodes);
  items.forEach((node) => allTracks.add(node.type));
  stats[path] = {
    nodeCount: items.length,
    edgeCount: value.edges.length,
    themeCount: new Set(items.map((node) => node.type)).size,
  };
  if (path === "space-history.json") Object.assign(stats[path], { snapshotAsOf: "2025-12-31", missionPhaseCount: 75 });
  else if (path === graphPath) Object.assign(stats[path], { pointEventCount: events.length, latestIncludedYear: 2024 });
}
const assets = [...files.keys()].filter((path) => path.startsWith(prefix) && path.endsWith(".md"));
assets.push(...Object.keys(sections).map((key) => `${prefix}notes/${key}.md`));
workspace.metadata = {
  ...workspace.metadata,
  nodeCount: Object.values(stats).reduce((sum, item) => sum + item.nodeCount, 0),
  edgeCount: Object.values(stats).reduce((sum, item) => sum + item.edgeCount, 0),
  themeCount: allTracks.size,
  graphStats: stats,
  assets: [...workspace.metadata.assets.filter((path) => !path.startsWith(prefix)), ...assets.sort()],
};
files.set("graph-studio.workspace.json", json(workspace));
let stale = false;
for (const [path, raw] of files) {
  const content = raw.normalize("NFC");
  const url = new URL(path, root);
  if (check) {
    if ((await readFile(url, "utf8").catch(() => null)) !== content) {
      console.error(`Stale generated file: ${path}`);
      stale = true;
    }
  } else {
    await mkdir(new URL(".", url), { recursive: true });
    await writeFile(url, content);
  }
}
console.log(
  `${events.length} points, ${edges.length} relationships, ${bridges.length} explicit connections, ${sourceIndex.size} sources.`,
);
if (stale) process.exitCode = 1;
