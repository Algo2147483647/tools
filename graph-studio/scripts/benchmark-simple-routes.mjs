// Node 22.12+: node scripts/benchmark-simple-routes.mjs [baseline-ref] [micro-rounds] [layout-rounds]
// Compare only the two routing files. No instrumentation is present in timed bundles.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = process.argv[2] || "053f2ab";
const rounds = Number(process.argv[3] || 7);
const layoutRounds = Number(process.argv[4] || 3);
assert.ok(Number.isInteger(rounds) && rounds >= 3, "Use at least three alternating rounds.");
assert.ok(Number.isInteger(layoutRounds) && layoutRounds >= 3, "Use at least three full-layout rounds.");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const prefix = git("rev-parse", "--show-prefix");
const baselineCommit = git("rev-parse", `${baseline}^{commit}`);
const searchPath = "src/layout/compound/routing/search.ts";
const indexPath = "src/layout/compound/routing/spatial-index.ts";
const original = new Map([searchPath, indexPath].map((p) => [p, git("show", `${baselineCommit}:${prefix}${p}`)]));
await mkdir(path.join(root, "test-results"), { recursive: true });
const directory = await mkdtemp(path.join(root, "test-results", "simple-routing-"));
const entry = `
export { simpleRoutes } from "./src/layout/compound/routing/search";
export { ObstacleIndex } from "./src/layout/compound/routing/spatial-index";
import { normalizeDagInput } from "./src/graph/normalize";
import { buildCompoundStage } from "./src/layout/compound/layout";
import { getDefaultChartStyle } from "./src/schema/appearance/styles";
import { getStageAppearance } from "./src/layout/shared/appearance";
import { scoreLayoutMetrics } from "./src/layout/compound/layout-quality";
export async function layout(document, view, labels) {
  const stage = await buildCompoundStage({
    dag: normalizeDagInput(document), view,
    appearance: getStageAppearance(getDefaultChartStyle("compound").appearance, "compound"),
    showNodeDetail: false, alignNodeWidthsToMax: true, showEdgeLabels: labels,
  });
  return { nodes: stage.nodes, groups: stage.groups, edges: stage.edges,
    width: stage.width, height: stage.height,
    metrics: stage.layoutQuality.metrics, validation: stage.layoutQuality.validation,
    score: scoreLayoutMetrics(stage.layoutQuality.metrics),
    baseline: stage.compoundLayout.baseline };
}
`;
async function bundle(name, before, capture = false) {
  const outfile = path.join(directory, `${name}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: root, loader: "ts" },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "routing-baseline",
        setup(builder) {
          // Match Vite's existing JSON import transform for its bundled esbuild version.
          builder.onLoad(
            { filter: /[\\/]schema[\\/](appearance|document)[\\/][^\\/]+\.ts$/ },
            async ({ path: filename }) => ({
              contents: (await readFile(filename, "utf8")).replace(/\s+with\s*\{\s*type:\s*"json"\s*\}/g, ""),
              loader: "ts",
              resolveDir: path.dirname(filename),
            }),
          );
          builder.onLoad({ filter: /routing[\\/](search|spatial-index)\.ts$/ }, async ({ path: filename }) => {
            const relative = path.relative(root, filename).replaceAll("\\", "/");
            let contents = before ? original.get(relative) : await readFile(filename, "utf8");
            if (capture && relative === searchPath) {
              contents = contents.replace("export function simpleRoutes(", "function capturedSimpleRoutes(");
              contents += `\nexport function simpleRoutes(...args: Parameters<typeof capturedSimpleRoutes>) {
            globalThis.__simpleRoutingSamples.push(args.slice(0, 3));
            return capturedSimpleRoutes(...args);
          }`;
            }
            return { contents, loader: "ts", resolveDir: path.dirname(filename) };
          });
        },
      },
    ],
  });
  return import(pathToFileURL(outfile).href);
}
const before = await bundle("before", true);
const after = await bundle("after", false);
const capture = await bundle("capture", true, true);
const commerce = JSON.parse(await readFile(path.join(root, "public/examples/commerce/commerce.json"), "utf8"));
const nodes = {},
  edges = [],
  hierarchy_edges = [];
for (let g = 0; g < 3; g++) {
  nodes[`g${g}`] = { title: `System ${g}\nService group` };
  for (let n = 0; n < 5; n++) {
    const id = `${g}-${n}`;
    nodes[id] = { title: `Stage ${n}` };
    hierarchy_edges.push({ id: `h${id}`, source: `g${g}`, target: id });
    if (n) edges.push({ id: `e${id}`, source: `${g}-${n - 1}`, target: id });
    if (g && n % 2 === 0) edges.push({ id: `cross${id}`, source: `${g - 1}-${n}`, target: id });
  }
}
const view = { collapsedGroupIds: [], focusGroupId: null };
const cases = [
  { name: "Commerce", document: commerce, view, labels: false },
  { name: "Commerce with labels", document: commerce, view, labels: true },
  {
    name: "Nested chains with cross-group fan-out",
    document: { format: "graph-studio", version: 3, nodes, edges, hierarchy_edges },
    view,
    labels: true,
  },
];
const runLayout = (impl, fixture) => impl.layout(fixture.document, fixture.view, fixture.labels);
globalThis.__simpleRoutingSamples = [];
for (const fixture of cases) {
  const start = performance.now();
  fixture.expected = await runLayout(capture, fixture);
  console.log(`Captured ${fixture.name}: ${(performance.now() - start).toFixed(0)} ms`);
}
const capturedCalls = globalThis.__simpleRoutingSamples.length;
// Uniformly sample the real call stream; keep replay/index memory bounded on large layouts.
const stride = Math.max(1, Math.ceil(capturedCalls / 1024));
const samples = globalThis.__simpleRoutingSamples.filter((_, i) => i % stride === 0);
delete globalThis.__simpleRoutingSamples;
console.log(`Comparing ${samples.length} evenly spaced samples from ${capturedCalls} simpleRoutes calls.`);
const indexed = (impl) =>
  samples.map(([sources, targets, obstacles]) => [sources, targets, obstacles, new impl.ObstacleIndex(obstacles)]);
const beforeInputs = indexed(before),
  afterInputs = indexed(after);
let candidates = 0;
for (let i = 0; i < samples.length; i++) {
  const expected = before.simpleRoutes(...beforeInputs[i]);
  assert.deepEqual(after.simpleRoutes(...afterInputs[i]), expected, `Captured candidate order ${i}`);
  candidates += expected.length;
}
// Also compare shuffled/repeated ports, fractional coordinates, near-alignment and empty sets.
let seed = 0x10a27;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const port = () => {
  const point = { x: Math.floor(random() * 9) * 5, y: Math.floor(random() * 9) * 5 };
  if (random() < 0.2) point.y += 0.0005;
  const direction = Math.floor(random() * 4),
    length = [0, 4, 10, 20][Math.floor(random() * 4)];
  return {
    point,
    direction,
    stub: {
      x: point.x + (direction === 0 ? length : direction === 2 ? -length : 0),
      y: point.y + (direction === 1 ? length : direction === 3 ? -length : 0),
    },
  };
};
for (let i = 0; i < 1000; i++) {
  const sources = Array.from({ length: Math.floor(random() * 7) }, port);
  const targets = Array.from({ length: Math.floor(random() * 7) }, port);
  if (sources.length) sources.splice(1, 0, structuredClone(sources[0]));
  if (targets.length) targets.push(structuredClone(targets[0]));
  const boxes = Array.from({ length: i % 25 }, () => ({
    x: random() * 45,
    y: random() * 45,
    width: random() * 15,
    height: random() * 15,
  }));
  assert.deepEqual(
    after.simpleRoutes(sources, targets, boxes),
    before.simpleRoutes(sources, targets, boxes),
    `Generated candidate order ${i}`,
  );
}
const replay = (impl, inputs) => {
  let count = 0;
  for (const args of inputs) count += impl.simpleRoutes(...args).length;
  assert.equal(count, candidates);
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summarize = (timings) => ({
  beforeMs: median(timings.before),
  afterMs: median(timings.after),
  reductionPercent: (1 - median(timings.after) / median(timings.before)) * 100,
  rounds: timings,
});
replay(before, beforeInputs);
replay(after, afterInputs);
const micro = { before: [], after: [] };
for (let r = 0; r < rounds; r++)
  for (const name of r % 2 ? ["after", "before"] : ["before", "after"]) {
    const start = performance.now();
    replay(name === "before" ? before : after, name === "before" ? beforeInputs : afterInputs);
    micro[name].push(performance.now() - start);
  }
console.log("Simple routes:", JSON.stringify(summarize(micro)));
const layouts = [];
for (const fixture of cases) {
  for (const impl of [before, after])
    assert.deepEqual(await runLayout(impl, fixture), fixture.expected, `${fixture.name} warm-up`);
  const timings = { before: [], after: [] };
  for (let r = 0; r < layoutRounds; r++)
    for (const name of r % 2 ? ["after", "before"] : ["before", "after"]) {
      const start = performance.now();
      const actual = await runLayout(name === "before" ? before : after, fixture);
      timings[name].push(performance.now() - start);
      assert.deepEqual(actual, fixture.expected, `${fixture.name} ${name} round ${r}`);
    }
  const result = {
    name: fixture.name,
    nodes: Object.keys(fixture.document.nodes).length,
    edges: fixture.document.edges.length,
    score: fixture.expected.score,
    ...summarize(timings),
  };
  layouts.push(result);
  console.log("Full layout:", JSON.stringify(result));
}
const report = {
  baselineCommit,
  node: process.version,
  rounds,
  layoutRounds,
  capturedCalls,
  samples: samples.length,
  candidates,
  generatedComparisons: 1000,
  simpleRoutes: summarize(micro),
  layouts,
};
await writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`Exact candidate order, final geometry, metrics and scores unchanged. Report: ${directory}`);
