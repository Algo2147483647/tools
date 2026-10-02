import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";
import complex from "./data/mathematics/complex-analysis.mjs";
import real from "./data/mathematics/real-analysis.mjs";
import functional from "./data/mathematics/functional-analysis.mjs";
import groups from "./data/mathematics/group-theory.mjs";
import numbers from "./data/mathematics/number-theory.mjs";
import probability from "./data/mathematics/probability-theory.mjs";
import logic from "./data/mathematics/set-theory-logic.mjs";
import topology from "./data/mathematics/topology.mjs";
import differential from "./data/mathematics/differential-geometry.mjs";
import algebraic from "./data/mathematics/algebraic-geometry.mjs";
import { curriculum, bridges } from "./data/mathematics/curriculum.mjs";
import { references } from "./data/mathematics/references.mjs";
import { summaries } from "./data/mathematics/summaries.mjs";

const subjects = [complex, real, functional, groups, numbers, probability, logic, topology, differential, algebraic];
const concepts = subjects.flatMap((subject) => subject.nodes.map((node) => ({ ...node, subject })));
const byId = new Map(concepts.map((node) => [node.id, node]));
const output = new Map();
const root = fileURLToPath(new URL("../public/examples/mathematics/", import.meta.url));
const check = process.argv.includes("--check");
const semantics = {
  prerequisite:
    "Selected learning prerequisite: source supplies background for target. Not a formal implication, a complete proof dependency, or a claim of necessity in every approach.",
  contains: "Navigation only: a subject points to its entry concepts; the atlas points to subjects.",
  bridge: "Navigation only: a connection between fields, not a prerequisite for an entire subject.",
};
const scope =
  "Selected advanced-undergraduate and beginning-graduate core with advanced gateways. Entries give precise scoped statements and proof ideas, not full proofs or exhaustive courses.";
const sourceIds = (node) => [...new Set([...node.reading.matchAll(/\b([A-Z][A-Z0-9]*):/g)].map((match) => match[1]))];
const link = (node, prefix = "./notes/") => `[${node.title}](${prefix}${node.id}.md)`;
const bullets = (items) => items.map((item) => `- ${item}`).join("\n");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const level = (node) => (curriculum[node.subject.id].advanced.includes(node.id) ? "Advanced gateway" : "Core");
const bibliographyEntry = (id) => {
  const ref = references[id];
  return `**${id}** — ${ref.author}. [${ref.title}](${ref.url}). ${ref.edition}.`;
};
const reading = (node) => `${node.reading}.\n\n${bullets(sourceIds(node).map(bibliographyEntry))}`;

function assertAcyclic(nodes, edges, context) {
  const outgoing = new Map(Object.keys(nodes).map((id) => [id, []]));
  const indegree = new Map(Object.keys(nodes).map((id) => [id, 0]));
  const pairs = new Set();
  for (const edge of edges) {
    assert(outgoing.has(edge.source) && outgoing.has(edge.target), `${context}: missing endpoint`);
    const pair = `${edge.source}->${edge.target}`;
    assert(!pairs.has(pair), `${context}: repeated ${pair}`);
    pairs.add(pair);
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    for (const target of outgoing.get(queue[i])) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  assert.equal(
    queue.length,
    outgoing.size,
    `${context}: directed cycle through ${[...indegree]
      .filter(([, n]) => n > 0)
      .map(([id]) => id)
      .join(", ")}`,
  );
}

// Validate the authored corpus before writing any public files.
assert.equal(byId.size, concepts.length, "Duplicate concept IDs");
for (const [id, summary] of Object.entries(summaries)) {
  assert(byId.has(id), `Unknown summary concept: ${id}`);
  assert(summary.trim().length > 25 && !/[$\\]/.test(summary), `${id}: expected a readable plain-text caption`);
}
for (const [id, ref] of Object.entries(references)) {
  for (const field of ["author", "title", "edition", "url"])
    assert(typeof ref[field] === "string" && ref[field].trim(), `${id}: missing ${field}`);
  assert.equal(new URL(ref.url).protocol, "https:", `${id}: expected HTTPS source`);
}
for (const subject of subjects) {
  assert(curriculum[subject.id], `Missing curriculum: ${subject.id}`);
  for (const id of subject.references) assert(references[id], `Unknown reference: ${id}`);
  for (const id of [...curriculum[subject.id].route, ...curriculum[subject.id].advanced])
    assert(
      subject.nodes.some((node) => node.id === id),
      `Unknown curriculum concept: ${id}`,
    );
}
for (const node of concepts) {
  if (node.statement.includes("$")) assert(summaries[node.id], `${node.id}: formula needs a plain-text caption`);
  assert(/^[a-z]+\.[a-z-]+$/.test(node.id), `Invalid ID: ${node.id}`);
  for (const field of ["title", "kind", "statement", "hypotheses", "example", "caution", "reading"])
    assert(typeof node[field] === "string" && node[field].trim(), `${node.id}: missing ${field}`);
  if (node.kind === "Theorem") assert(node.proof.trim(), `${node.id}: missing proof idea`);
  assert.equal(new Set(node.requires).size, node.requires.length, `${node.id}: repeated prerequisite`);
  for (const id of node.requires) assert(byId.has(id), `${node.id}: unknown prerequisite ${id}`);
  assert(sourceIds(node).length, `${node.id}: no reference locator`);
  for (const id of sourceIds(node))
    assert(node.subject.references.includes(id), `${node.id}: reference ${id} missing from subject`);
  for (const [field, value] of Object.entries(node)) {
    if (typeof value !== "string") continue;
    assert.equal((value.match(/\$/g) || []).length % 2, 0, `${node.id}/${field}: unpaired math delimiter`);
    for (const [, formula] of value.matchAll(/\$([^$]+)\$/g)) {
      try {
        katex.renderToString(formula, { throwOnError: true, strict: "error", trust: false });
      } catch (error) {
        throw new Error(`${node.id}/${field}: ${error.message}`);
      }
    }
  }
}

function prerequisites(node, prefix = "./notes/") {
  if (!node.requires.length) return "Entry point; see the subject guide for assumed background.";
  const selected = node.requires.map((id) => byId.get(id));
  const local = selected.filter((entry) => entry.subject.id === node.subject.id);
  const external = selected.filter((entry) => entry.subject.id !== node.subject.id);
  return [
    ...(local.length ? [`**Within this subject**\n\n${bullets(local.map((entry) => link(entry, prefix)))}`] : []),
    ...(external.length
      ? [
          `**From other subjects**\n\n${bullets(external.map((entry) => `${link(entry, prefix)} — ${entry.subject.title}`))}`,
        ]
      : []),
  ].join("\n\n");
}
function conceptNode(node) {
  return {
    title: node.title,
    define: summaries[node.id] ?? node.statement,
    statement: node.statement,
    type: node.subject.title,
    kind: node.kind,
    level: level(node),
    hypotheses: node.hypotheses,
    example: node.example,
    caution: node.caution,
    ...(node.proof ? { proof_idea: node.proof } : {}),
    prerequisites: prerequisites(node),
    references: reading(node),
    notes: link(node),
  };
}
function subjectNode(subject) {
  const plan = curriculum[subject.id];
  return {
    title: subject.title,
    define: subject.description,
    type: subject.title,
    kind: "Subject guide",
    scope,
    assumed_background: plan.assumed,
    learning_outcomes: bullets(plan.outcomes),
    study_route: plan.route.map((id) => link(byId.get(id))).join(" → "),
    notes: `[Subject guide](./guides/${subject.id}.md)`,
    graph_file: `Open ${subject.id}.json in the workspace graph list.`,
    references: bullets(subject.references.map(bibliographyEntry)),
  };
}
const atlasNode = {
  title: "Mathematics",
  define: "A connected atlas of analysis, algebra, probability, foundations and geometry.",
  type: "Atlas",
  kind: "Navigation",
  scope,
  conventions:
    "An arrow labeled prerequisite suggests study order. Contains and bridge arrows are navigation. Read each theorem's hypotheses before using it.",
  notes: "[Start here](./README.md) · [Study pathways](./STUDY-PATHWAYS.md) · [Bibliography](./BIBLIOGRAPHY.md)",
};
function edge(source, target, relation, rationale) {
  return { id: `${source}--${target}`, source, target, value: relation, metadata: { relation, rationale } };
}
function graph(id, title, nodes, edges, metadata = {}) {
  assertAcyclic(nodes, edges, id);
  return {
    format: "graph-studio",
    version: 3,
    diagram: "dag",
    id,
    title,
    metadata: { language: "en", scope, edgeSemantics: semantics, ...metadata },
    nodes,
    edges,
  };
}
const dependencyEdges = concepts.flatMap((node) =>
  node.requires.map((id) =>
    edge(
      id,
      node.id,
      "prerequisite",
      `${byId.get(id).title} supplies selected background for ${node.title}; consult both entries for the scope of the connection.`,
    ),
  ),
);
const hubNodes = Object.fromEntries(subjects.map((s) => [`subject.${s.id}`, subjectNode(s)]));
const atlasEdges = subjects.map((s) =>
  edge("mathematics", `subject.${s.id}`, "contains", "Navigate to the subject guide and its graph file."),
);
output.set(
  "mathematics.json",
  json(
    graph(
      "mathematics-overview",
      "Mathematics — subject overview",
      { mathematics: atlasNode, ...hubNodes },
      [...atlasEdges, ...bridges.map(([from, to, why]) => edge(`subject.${from}`, `subject.${to}`, "bridge", why))],
      { view: "overview", conceptCount: concepts.length, subjectCount: subjects.length },
    ),
  ),
);

const entryEdges = [];
for (const subject of subjects) {
  const local = new Set(subject.nodes.map((node) => node.id));
  const boundary = new Set(subject.nodes.flatMap((node) => node.requires.filter((id) => !local.has(id))));
  const entries = subject.nodes.filter((node) => !node.requires.some((id) => local.has(id)));
  const contains = entries.map((node) =>
    edge(
      `subject.${subject.id}`,
      node.id,
      "contains",
      "A starting concept in this subject view; external prerequisites are linked in its details and study note.",
    ),
  );
  entryEdges.push(...contains);
  const nodes = { [`subject.${subject.id}`]: subjectNode(subject) };
  for (const id of local) nodes[id] = conceptNode(byId.get(id));
  output.set(
    `${subject.id}.json`,
    json(
      graph(
        subject.id,
        subject.title,
        nodes,
        [...contains, ...dependencyEdges.filter((e) => local.has(e.source) && local.has(e.target))],
        {
          view: "subject",
          subject: subject.id,
          localConceptCount: local.size,
          externalPrerequisiteCount: boundary.size,
          boundaryPolicy:
            "The subject hub is the single entry to local concepts. External prerequisites are grouped in node details and study notes; all-mathematics.json retains their cross-subject edges.",
        },
      ),
    ),
  );
}
output.set(
  "all-mathematics.json",
  json(
    graph(
      "mathematics-complete",
      "Mathematics — complete concept atlas",
      {
        mathematics: atlasNode,
        ...hubNodes,
        ...Object.fromEntries(concepts.map((node) => [node.id, conceptNode(node)])),
      },
      [...atlasEdges, ...entryEdges, ...dependencyEdges],
      { view: "complete", conceptCount: concepts.length, subjectCount: subjects.length },
    ),
  ),
);

for (const node of concepts) {
  const successors = concepts.filter((candidate) => candidate.requires.includes(node.id));
  const sections = [
    `# ${node.title}`,
    `${node.subject.title} · ${node.kind} · ${level(node)}\n\nStable ID: \`${node.id}\``,
    ...(summaries[node.id] ? [summaries[node.id]] : []),
    `## Statement\n\n${node.statement}`,
    `## Hypotheses and conventions\n\n${node.hypotheses}`,
    `## Example\n\n${node.example}`,
    `## Scope and common pitfalls\n\n${node.caution}`,
    ...(node.proof
      ? [
          `## Proof idea\n\n${node.proof}\n\nThis is a proof strategy; details and intermediate lemmas are in the references.`,
        ]
      : []),
    `## Selected prerequisites\n\n${prerequisites(node, "./")}`,
    ...(successors.length ? [`## Continue to\n\n${bullets(successors.map((n) => link(n, "./")))}`] : []),
    `## Reference reading\n\n${reading(node)}\n\nLocators identify topics or explicitly named lectures, not invented theorem numbers.`,
    `[Subject guide](../guides/${node.subject.id}.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)`,
  ];
  output.set(`notes/${node.id}.md`, sections.join("\n\n") + "\n");
}
for (const subject of subjects) {
  const plan = curriculum[subject.id];
  output.set(
    `guides/${subject.id}.md`,
    [
      `# ${subject.title}`,
      subject.description,
      `## Scope\n\n${scope}`,
      `## Assumed background\n\n${plan.assumed}`,
      `## Learning outcomes\n\n${bullets(plan.outcomes)}`,
      `## Suggested first pass\n\n${plan.route.map((id, i) => `${i + 1}. ${link(byId.get(id), "../notes/")}`).join("\n")}\n\nThis is a reading route, not an assertion that every consecutive pair is a formal dependency. Consult each entry's prerequisite list.`,
      `## Concept index\n\n| Concept | Kind | Level |\n| --- | --- | --- |\n${subject.nodes
        .map((entry) => {
          const node = byId.get(entry.id);
          return `| ${link(node, "../notes/")} | ${node.kind} | ${level(node)} |`;
        })
        .join("\n")}`,
      `## Problems for active study\n\n${plan.exercises.map((exercise, i) => `${i + 1}. ${exercise}`).join("\n")}`,
      `## Reference reading\n\n${bullets(subject.references.map(bibliographyEntry))}`,
      `## Using the graph\n\nOpen \`${subject.id}.json\` in the workspace graph list. The subject hub is the single entry point, leading to all local concepts through navigation and internal prerequisite arrows. Node details and study notes group selected prerequisites into \"Within this subject\" and \"From other subjects\" with links to their notes. External prerequisites stay off the subject canvas. Open \`all-mathematics.json\` to follow the cross-subject dependency edges and their upstream context.`,
      "[Atlas guide](../README.md) · [Study pathways](../STUDY-PATHWAYS.md) · [Bibliography](../BIBLIOGRAPHY.md)",
    ].join("\n\n") + "\n",
  );
}
output.set(
  "BIBLIOGRAPHY.md",
  [
    "# Bibliography and source policy",
    "The concept descriptions, examples and proof strategies are original concise expositions of standard mathematics. References point to primary author pages, university course materials, publisher pages and the Stacks Project. No textbook prose or external PDF is bundled. The corpus is a study atlas, not a substitute for full proofs, specialist review or a complete graduate curriculum.",
    "References were selected on 2026-10-02. Edition labels identify the intended text; living references may change. Topic locators are reading guidance rather than claims of verbatim quotation. Publisher pages may require separate book access; external links require an internet connection, while all graph content and local notes are bundled.",
    ...Object.entries(references).map(
      ([id, ref]) =>
        `${bibliographyEntry(id)}${ref.sections ? "\n\n" + bullets(Object.entries(ref.sections).map(([name, url]) => `[${name}](${url})`)) : ""}`,
    ),
    "We acknowledge [J. S. Milne's mathematical exposition](https://www.jmilne.org/math/), which provides several of the course references.",
    "[Atlas guide](./README.md)",
  ].join("\n\n") + "\n",
);
output.set(
  "STUDY-PATHWAYS.md",
  [
    "# Study pathways",
    "Use the overview to choose a field, then open its subject graph. These pathways select material for different goals; they are not complete degree requirements.",
    "## Analysis and stochastic processes\n\nReal analysis → functional analysis and complex analysis; measure and integration → probability → conditional expectation → martingales → Brownian stochastic calculus. Revisit uniform integrability before passing expectations through stopping-time limits.",
    "## Algebra and arithmetic\n\nGroups and actions → quotient structures → Galois theory; commutative rings → algebraic integers → prime ideals and class groups → completions. Complex analysis supplies the analytic route to prime distribution. Elliptic curves also require the geometry of smooth projective curves.",
    "## Geometry and topology\n\nPoint-set topology → homotopy and homology → smooth manifolds → differential forms and de Rham theory → Riemannian curvature. Functional analysis provides analytic tools for Hodge theory. Commutative algebra supplies a separate entrance to schemes, divisors and algebraic curves.",
    "## Foundations\n\nSets and first-order syntax → semantics → soundness and completeness → compactness. Computability and arithmetic coding lead to incompleteness. Ordinals, choice and ZF lead to relative consistency and forcing. Logical completeness and incompleteness of an arithmetic theory address different questions.",
    "## Cross-field connections\n\n" +
      bullets(
        bridges.map(
          ([from, to, why]) =>
            `[${subjects.find((s) => s.id === from).title}](./guides/${from}.md) → [${subjects.find((s) => s.id === to).title}](./guides/${to}.md): ${why}`,
        ),
      ),
    "## How to read an entry\n\nFirst identify its kind and level. Copy the hypotheses before using a theorem. Work through the example, test the warning against a counterexample, and reconstruct the proof idea from the reference. A prerequisite arrow is selected pedagogical background, not a theorem asserting necessity or logical implication.",
    "[Atlas guide](./README.md) · [Bibliography](./BIBLIOGRAPHY.md)",
  ].join("\n\n") + "\n",
);
output.set(
  "README.md",
  [
    "# Mathematics — a connected study atlas",
    `${concepts.length} concepts across ${subjects.length} subjects, with one note per concept, subject study guides, scoped theorem statements and reference reading. The default graph is a compact subject overview; the complete concept atlas is a separate graph.`,
    `## Academic scope\n\n${scope} Definitions, constructions, axioms and theorems are labeled separately. Theorems have explicit hypotheses, examples, limitations and proof ideas. Advanced gateways are marked. This is a curated study map, not an externally peer-reviewed publication.`,
    "## Graphs\n\nOpen `mathematics.json` for orientation or `all-mathematics.json` for all concepts and cross-field prerequisites. Choose the following graph files from the workspace list for detailed study:\n\n| Subject | Concepts | Graph file | Guide |\n| --- | ---: | --- | --- |\n" +
      subjects
        .map((s) => `| ${s.title} | ${s.nodes.length} | \`${s.id}.json\` | [Read](./guides/${s.id}.md) |`)
        .join("\n"),
    "## Edge semantics\n\n" +
      bullets(Object.entries(semantics).map(([kind, description]) => `**${kind}**: ${description}`)),
    'Each subject view has one subject hub as its entry point and displays only its local concepts and internal prerequisite edges. Node details and study notes group prerequisites into "Within this subject" and "From other subjects", with links to the relevant notes. The complete atlas retains all cross-subject prerequisite edges. Shared concepts have identical mathematical content in both views. Navigation hubs are excluded from the concept count.',
    "## Conventions\n\nAnalysis uses real or complex scalars as stated, and functions in Lp are identified almost everywhere. Manifolds are Hausdorff, second countable and finite dimensional; boundary is included only when named. Algebraic geometry uses commutative unital rings and identity-preserving homomorphisms; varieties are reduced and irreducible unless otherwise specified. Logic uses classical first-order semantics and states its metatheoretic assumptions explicitly.",
    "## Study and references\n\n[Study pathways](./STUDY-PATHWAYS.md) · [Bibliography and source policy](./BIBLIOGRAPHY.md)\n\nEach subject guide includes learning outcomes and problems. Clicking a note link opens the bundled Markdown with rendered mathematical notation; follow its prerequisite and continuation links for adjacent concepts.",
    "## Maintenance\n\nThe source of truth is `scripts/data/mathematics/` in the Graph Studio repository. Run `npm run examples:mathematics` to regenerate, or `npm run examples:mathematics:check` to validate reproducibility without writing. The generated manifest lists every graph and note. Edit source entries rather than maintaining duplicate definitions in individual views.",
  ].join("\n\n") + "\n",
);

const graphFiles = ["mathematics.json", ...subjects.map((s) => `${s.id}.json`), "all-mathematics.json"];
output.set(
  "graph-studio.workspace.json",
  json({
    format: "graph-studio-workspace",
    version: 1,
    name: "Mathematics",
    graphs: graphFiles,
    defaultGraph: "mathematics.json",
    metadata: {
      language: "en",
      conceptCount: concepts.length,
      subjectCount: subjects.length,
      scope,
      assets: [...output.keys()].filter((file) => file.endsWith(".md")).sort(),
    },
  }),
);
// Every local link must resolve to a declared asset, including links relative to a note.
for (const [file, content] of output) {
  assert(!/[\u4e00-\u9fff]/.test(content), `${file}: English content expected`);
  for (const [, target] of content.matchAll(/\]\((\.{1,2}\/[^)]+)\)/g)) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    assert(output.has(resolved), `${file}: missing linked file ${target}`);
  }
}
async function listFiles(dir, prefix = "") {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? listFiles(path.join(dir, entry.name), prefix + entry.name + "/") : [prefix + entry.name],
      ),
    )
  ).flat();
}
const existing = await listFiles(root);
const unexpected = existing.filter((file) => !output.has(file));
assert.equal(
  unexpected.length,
  0,
  `Obsolete or unrecognized files must be reviewed and removed explicitly: ${unexpected.join(", ")}`,
);
for (const [file, content] of output) {
  const target = path.join(root, file);
  if (check) {
    assert.equal(
      await readFile(target, "utf8"),
      content,
      `${file} differs from source; run npm run examples:mathematics`,
    );
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}
console.log(
  `${check ? "Validated" : "Generated"} Mathematics: ${subjects.length} subjects, ${concepts.length} concepts, ${dependencyEdges.length} prerequisite edges, ${output.size} files.`,
);
