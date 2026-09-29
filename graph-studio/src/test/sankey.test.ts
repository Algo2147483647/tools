import assert from "node:assert/strict";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { applyGraphCommand } from "../graph/commands";
import { projectGraphByType } from "../graph/typeFilter";
import { analyzeGraphImport } from "../graph/importMerge";
import { buildStageData } from "../layout/stage-layout";
import { graphReducer } from "../state/graphReducer";
import { initialGraphAppState } from "../state/initialState";
import { parseGraphPagePreferences } from "../state/preferences";
import { DEFAULT_GRAPH_APPEARANCE, appearanceToStageStyle, sanitizeGraphAppearance } from "../graph/appearance";
import { defineSuite, defineTest } from "./harness";

const document = () => ({ format: "graph-studio", version: 2, diagram: "sankey", nodes: {
  A: { title: "Supply", type: "Visible" }, B: { title: "Conversion", type: "Hidden" }, C: { title: "Demand", type: "Visible" }, D: { title: "Loss" },
}, edges: [
  { id: "ab", source: "A", target: "B", value: 100 },
  { id: "bc", source: "B", target: "C", value: 75 },
  { id: "bd", source: "B", target: "D", value: 25 },
] });
const stageFor = (doc: unknown) => buildStageData({ dag: normalizeDagInput(doc), selection: { type: "full" }, layoutMode: "sankey" })!;

export const sankeySuite = defineSuite("Sankey and shadow settings", [
  defineTest("protocol round-trip preserves semantics and metadata", () => {
    const doc = { ...document(), metadata: { unit: "GWh" } };
    assert.deepEqual(serializeDag(normalizeDagInput(doc)), doc);
    for (const invalid of [-1, Infinity, NaN, "10", null, true, undefined]) {
      const input = document();
      (input.edges[0] as { value: unknown }).value = invalid;
      assert.throws(() => normalizeDagInput(input), /Sankey|JSON/);
    }
    const cyclic = document();
    cyclic.edges.push({ id: "ca", source: "C", target: "A", value: 0 });
    assert.throws(() => normalizeDagInput(cyclic), /acyclic/);
  }),
  defineTest("flow widths share one scale and fill balanced nodes exactly", () => {
    const stage = stageFor(document());
    assert.equal(stage.layoutMode, "sankey");
    assert.equal(stage.nodes.length, 4);
    const [ab, bc, bd] = stage.edges;
    assert.ok(Math.abs(bc.flow!.width / bd.flow!.width - 3) < 1e-9);
    assert.ok(Math.abs(ab.flow!.width - stage.nodeMap.B.height) < 1e-9);
    assert.ok(Math.abs(bc.flow!.width + bd.flow!.width - stage.nodeMap.B.height) < 1e-9);
    assert.ok(stage.nodeMap.A.x < stage.nodeMap.B.x && stage.nodeMap.B.x < stage.nodeMap.C.x);
    assert.deepEqual(stage.warnings, []);
    for (const edge of stage.edges) assert.doesNotMatch(edge.path, /NaN|Infinity/);
    const targets = [stage.nodeMap.C, stage.nodeMap.D].sort((a,b)=>a.y-b.y);
    assert.ok(targets[0].y + targets[0].height / 2 < targets[1].y - targets[1].height / 2);
  }),
  defineTest("single nodes, zero flows, tiny values and imbalanced flows remain finite", () => {
    const empty = stageFor({ ...document(), nodes: { A: {} }, edges: [] });
    assert.equal(empty.nodeMap.A.flow!.value, 0);
    for (const value of [0, 1e-300, 1e300]) {
      const input = document();
      input.edges.forEach(edge => edge.value = value);
      const stage = stageFor(input);
      assert.ok(Number.isFinite(stage.stageWidth) && Number.isFinite(stage.stageHeight));
      stage.nodes.forEach(node => assert.ok([node.x,node.y,node.height,node.flow!.labelY].every(Number.isFinite)));
      stage.edges.forEach(edge => assert.doesNotMatch(edge.path, /NaN|Infinity/));
      if (value === 0) assert.equal(stage.edges.length, 0);
      else assert.match(stage.warnings.join(" "), /different incoming and outgoing/);
    }
  }),
  defineTest("invalid ordinary graphs fall back visibly without changing data", () => {
    const input = { ...document(), diagram: "dag" };
    (input.edges[0] as { value: unknown }).value = "supports";
    const stage = stageFor(input);
    assert.equal(stage.layoutMode, "sugiyama");
    assert.match(stage.warnings[0], /numeric value.*layered/);
  }),
  defineTest("mixed tiny flows, long links, multiple roots and focused leaves keep finite geometry", () => {
    const base = document();
    const input = { ...base, nodes: { ...base.nodes, E: { title: "Another source" } } };
    input.edges[1].value = 1e-200;
    input.edges.push({ id: "ac", source: "A", target: "C", value: 3 });
    input.edges.push({ id: "eb", source: "E", target: "B", value: 10 });
    const stage = stageFor(input);
    stage.nodes.forEach(node => assert.ok([node.x,node.y,node.height,node.flow!.labelY].every(Number.isFinite)));
    stage.edges.forEach(edge => assert.doesNotMatch(edge.path, /NaN|Infinity/));
    const leaf = buildStageData({ dag: normalizeDagInput(input), selection: { type: "node", key: "C" }, layoutMode: "sankey" })!;
    assert.equal(leaf.nodes.length, 1);
    assert.equal(leaf.nodeMap.C.flow!.value, 0);
  }),
  defineTest("editing, filtering and merges preserve flow semantics", () => {
    const dag = normalizeDagInput(document());
    const updated = applyGraphCommand(dag, { type: "addNode", key: "E", parentKey: "A" }).dag;
    assert.equal(updated.edges.find(edge => edge.target === "E")!.value, 1);
    assert.throws(() => applyGraphCommand(dag, { type: "setEdge", parentKey: "C", childKey: "A", weight: 3 }), /acyclic/);
    assert.throws(() => applyGraphCommand(dag, { type: "setEdge", parentKey: "A", childKey: "B", weight: -3 }), /non-negative/);
    assert.equal(dag.edges[0].value, 100);
    const filtered = projectGraphByType(dag, "Visible");
    assert.equal(filtered.diagram, "sankey");
    assert.equal(filtered.edges.length, 0);
    assert.throws(() => analyzeGraphImport([{ name: "a", payload: document() }, { name: "b", payload: { ...document(), diagram: "dag" } }]), /different edge semantics/);
  }),
  defineTest("Sankey loading and preferences select the flow engine", () => {
    const dag = normalizeDagInput(document());
    const state = graphReducer(initialGraphAppState, { type: "graphLoaded", dag, fileName: "flow.json", selection: { type: "full" }, status: "loaded" });
    assert.equal(state.layout.mode, "sankey");
    assert.equal(parseGraphPagePreferences('{"layoutMode":"sankey"}')!.layoutMode, "sankey");
  }),
  defineTest("shadow settings clamp, migrate and persist through appearance JSON", () => {
    const legacy = sanitizeGraphAppearance({ display: { showEdgeLabels: false } });
    assert.equal(legacy.display.nodeShadow, true);
    assert.equal(legacy.display.shadowOpacity, 12);
    const appearance = sanitizeGraphAppearance({ display: { nodeShadow: false, shadowBlur: 100, shadowOpacity: -1, sankeyNodeWidth: 100 } });
    assert.equal(appearance.display.shadowBlur, 32);
    assert.equal(appearance.display.shadowOpacity, 0);
    assert.equal(appearance.display.sankeyNodeWidth, 48);
    assert.equal((appearanceToStageStyle(appearance) as Record<string, unknown>)["--dag-node-shadow"], "none");
    assert.deepEqual(sanitizeGraphAppearance(JSON.parse(JSON.stringify(appearance))), appearance);
    assert.match(String((appearanceToStageStyle(DEFAULT_GRAPH_APPEARANCE) as Record<string, unknown>)["--dag-node-shadow"]), /drop-shadow/);
  }),
]);
