import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineSuite, defineTest } from "./harness";
import { EXAMPLE_WORKSPACES, loadExampleWorkspace } from "../workspace/examples";
import { discoverWorkspace, readGraphFile } from "../workspace/discovery";
import { buildStageData } from "../layout/stage-layout";
import { serializeDag } from "../graph/serialize";
import { normalizeDagInput } from "../graph/normalize";
import { readRecentMetadata } from "../adapters/recentImport";
import { graphReducer } from "../state/graphReducer";
import { initialGraphAppState } from "../state/initialState";

async function bundle(id:string) { return JSON.parse(await readFile(`public/examples/${id}.json`, "utf8")); }
const localFetch = (async (url: string) => {
  const id = url.split("/").pop()!.replace(".json", "");
  return { ok: true, json: () => bundle(id) } as Response;
}) as typeof fetch;

export const examplesSuite = defineSuite("Bundled example workspaces", [
  defineTest("all example graphs load, serialize, and have no missing or non-English files", async () => {
    for (const example of EXAMPLE_WORKSPACES) {
      const folder = await loadExampleWorkspace(example.id, "/studio/", localFetch);
      const workspace = await discoverWorkspace(folder);
      assert.ok(workspace.activePath);
      assert.equal(workspace.exampleId, example.id);
      assert.equal(workspace.handle, null);
      for (const entry of folder.files.values()) {
        assert.equal(entry.handle, null);
        const text = await entry.file!.text();
        assert.doesNotMatch(text, /[\u4e00-\u9fff]/);
        // Resolve every generated Markdown link, including the graph's note fields.
        for (const match of text.matchAll(/\]\(\.\/([\w/.-]+)\)/g)) {
          const directory = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/") + 1) : "";
          assert.ok(folder.files.has(directory + match[1]), `${entry.path}: missing ${match[1]}`);
        }
      }
      for (const entry of workspace.graphs) {
        assert.equal(entry.error, undefined, `${example.id}/${entry.path}: ${entry.error}`);
        const dag = await readGraphFile(folder.files.get(entry.path)!);
        assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
      }
    }
  }),
  defineTest("Factorio covers every productive recipe in the pinned source", async () => {
    const source = JSON.parse(await readFile("scripts/data/factorio-recipes-2.0.65.json", "utf8"));
    const data = await bundle("factorio");
    const atlas = normalizeDagInput(JSON.parse(data.files["all-products.json"]));
    const recipes = source.recipes.filter((r:{results?: unknown[]}) => Array.isArray(r.results) && r.results.length);
    assert.equal(recipes.length, 648);
    assert.equal(Object.values(atlas.nodes).filter(n => n.type === "Recipe").length, recipes.length);
    assert.equal(Object.values(atlas.nodes).filter(n => n.type === "Product").length, 328);
    for (const recipe of recipes) {
      assert.ok(atlas.nodes[`recipe:${recipe.name}`], recipe.name);
      assert.equal(atlas.edges.filter(e => e.metadata?.recipe === recipe.name).length, (recipe.ingredients?.length || 0) + recipe.results.length);
    }
    const recovered = atlas.edges.find(e => e.source === "recipe:accumulator-recycling" && e.target === "output:iron-plate");
    assert.equal(recovered?.value, 0.5, "recycling fraction must not be counted twice");
    const uranium = atlas.edges.find(e => e.source === "recipe:uranium-processing" && e.target === "output:uranium-235");
    assert.equal(uranium?.value, 0.007);
    const stage = buildStageData({ dag: atlas, selection: {type:"full"} })!;
    assert.equal(stage.nodes.length, Object.keys(atlas.nodes).length);
    assert.equal(stage.edges.length, atlas.edges.length);
    assert.ok(stage.edges.every(e => !/NaN|Infinity/.test(e.path)));
    assert.ok(stage.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.height >= 0));
  }),
  defineTest("example opens are independent copies and recent entries reopen without folder permission", async () => {
    const first = await loadExampleWorkspace("energy", "/", localFetch);
    const second = await loadExampleWorkspace("energy", "/", localFetch);
    const a = await readGraphFile(first.files.get("energy.json")!);
    const b = await readGraphFile(second.files.get("energy.json")!);
    a.nodes.solar.title = "Edited";
    assert.equal(b.nodes.solar.title, "Solar");
    first.files.clear();
    assert.ok(second.files.size > 0);
    const recents = readRecentMetadata({ getItem: () => JSON.stringify([{id:"example:energy",kind:"workspace",name:"Energy flows",location:"Energy flows",openedAt:123,exampleId:"energy",lastGraph:"energy.json"}]), setItem:()=>{} });
    assert.equal(recents[0].canReopen, true);
    assert.equal(recents[0].exampleId, "energy");
  }),
  defineTest("unknown or unavailable examples fail cleanly and respect the deployment base", async () => {
    await assert.rejects(loadExampleWorkspace("../escape", "/", localFetch), /Unknown/);
    let requested = "";
    const unavailable = (async (url: string) => { requested = url; return {ok:false} as Response; }) as typeof fetch;
    await assert.rejects(loadExampleWorkspace("energy", "/graph-studio/", unavailable), /Could not load/);
    assert.equal(requested, "/graph-studio/examples/energy.json");
  }),
  defineTest("switching from a Sankey example to mathematics restores a layered layout", async () => {
    const data = await bundle("mathematics");
    const dag = normalizeDagInput(JSON.parse(data.files["mathematics.json"]));
    assert.equal(Object.keys(dag.nodes).length, 112);
    const state = graphReducer({...initialGraphAppState,layout:{...initialGraphAppState.layout,mode:"sankey"}}, {type:"graphLoaded",dag,fileName:"mathematics.json",selection:{type:"full"},status:""});
    assert.equal(state.layout.mode, "level");
    assert.equal(state.source.dirty, false);
  }),
]);
