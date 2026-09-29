import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { defineSuite, defineTest } from "./harness";
import { EXAMPLE_WORKSPACES, loadExampleWorkspace } from "../workspace/examples";
import { discoverWorkspace, readGraphFile } from "../workspace/discovery";
import { buildStageData } from "../layout/stage-layout";
import { serializeDag } from "../graph/serialize";
import { normalizeDagInput } from "../graph/normalize";
import { readRecentMetadata } from "../adapters/recentImport";
import { graphReducer } from "../state/graphReducer";
import { initialGraphAppState } from "../state/initialState";

async function exampleGraph(id:string, path:string) { return normalizeDagInput(JSON.parse(await readFile(`public/examples/${id}/${path}`, "utf8"))); }
async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes:true});
  const files = await Promise.all(entries.map(entry => entry.isDirectory() ? listFiles(`${directory}/${entry.name}`, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));
  return files.flat();
}
const localFetch = (async (url: string) => {
  const path = decodeURIComponent(url.split("/examples/")[1]);
  try { return new Response(await readFile(`public/examples/${path}`, "utf8")); }
  catch { return new Response("Not found", {status:404}); }
}) as typeof fetch;

export const examplesSuite = defineSuite("Bundled example workspaces", [
  defineTest("all example graphs load, serialize, and have no missing or non-English files", async () => {
    for (const example of EXAMPLE_WORKSPACES) {
      const folder = await loadExampleWorkspace(example.id, "/studio/", localFetch);
      const workspace = await discoverWorkspace(folder);
      assert.ok(workspace.activePath);
      assert.equal(workspace.exampleId, example.id);
      assert.equal(workspace.handle, null);
      assert.deepEqual([...folder.files.keys()].sort(), (await listFiles(`public/examples/${example.id}`)).sort(), "The homepage must load the actual workspace files");
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
    const atlas = await exampleGraph("factorio", "all-products.json");
    const recipes = source.recipes.filter((r:{results?: unknown[]}) => Array.isArray(r.results) && r.results.length);
    assert.equal(recipes.length, 648);
    assert.equal(Object.values(atlas.nodes).filter(n => n.type === "Recipe").length, recipes.length);
    const products = new Set<string>(recipes.flatMap((r:{results:{name:string}[]}) => r.results.map(p => p.name)));
    const outputs = new Set(atlas.edges.filter(e => e.metadata?.role === "output").map(e => atlas.nodes[e.target].productId));
    assert.equal(outputs.size, 328);
    assert.deepEqual(outputs, products);
    assert.ok(Object.keys(atlas.nodes).every(key => !/^(input|output):/.test(key)));
    for (const recipe of recipes) {
      assert.ok(atlas.nodes[`recipe:${recipe.name}`], recipe.name);
      assert.equal(atlas.edges.filter(e => e.metadata?.recipe === recipe.name).length, (recipe.ingredients?.length || 0) + recipe.results.length);
      for (const p of Array.isArray(recipe.ingredients) ? recipe.ingredients : []) assert.ok(atlas.edges.some(e => e.source === `material:${p.type}:${p.name}` && e.target === `recipe:${recipe.name}`));
      for (const p of recipe.results) assert.ok(atlas.edges.some(e => e.target === `material:${p.type}:${p.name}` && e.source === `recipe:${recipe.name}`));
    }
    const recovered = atlas.edges.find(e => e.source === "recipe:accumulator-recycling" && e.target === "material:item:iron-plate");
    assert.equal(recovered?.value, 0.5, "recycling fraction must not be counted twice");
    const uranium = atlas.edges.find(e => e.source === "recipe:uranium-processing" && e.target === "material:item:uranium-235");
    assert.equal(uranium?.value, 0.007);
    const stage = buildStageData({ dag: atlas, selection: {type:"full"} })!;
    assert.equal(stage.nodes.length, Object.keys(atlas.nodes).length);
    assert.equal(stage.edges.length, atlas.edges.length);
    assert.ok(stage.edges.every(e => !/NaN|Infinity/.test(e.path)));
    assert.ok(stage.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.height >= 0));
    assert.ok(stage.edges.find(e => e.id === recovered!.id)!.flow!.feedback);
    assert.ok(new Set(stage.nodes.map(n => n.layer)).size > 3);
  }),
  defineTest("Factorio starter connects ore, smelting, cable and circuit production across seven layers", async () => {
    const dag = await exampleGraph("factorio", "start-here.json");
    const chain = ["material:item:copper-ore","recipe:copper-plate","material:item:copper-plate","recipe:copper-cable","material:item:copper-cable","recipe:electronic-circuit","material:item:electronic-circuit"];
    const stage = buildStageData({dag,selection:{type:"full"}})!;
    for (let i = 1; i < chain.length; i++) {
      assert.ok(dag.edges.some(e => e.source === chain[i - 1] && e.target === chain[i]));
      assert.ok(stage.nodeMap[chain[i]].x > stage.nodeMap[chain[i - 1]].x);
    }
    assert.ok(dag.edges.some(e => e.source === "material:item:iron-plate" && e.target === "recipe:electronic-circuit"));
    assert.equal(Object.values(dag.nodes).filter(n => n.productId === "copper-cable").length, 1);
    assert.equal(new Set(stage.nodes.map(n => n.layer)).size, 7);
    assert.equal(dag.metadata?.upstreamRecipeCount, 2);
  }),
  defineTest("every focused Factorio view loads its upstream dependencies and preserves all flows", async () => {
    const manifest = JSON.parse(await readFile("public/examples/factorio/graph-studio.workspace.json", "utf8"));
    for (const file of manifest.graphs.filter((path:string) => path !== "all-products.json")) {
      const dag = await exampleGraph("factorio", file);
      const stage = buildStageData({dag,selection:{type:"full"}})!;
      assert.equal(stage.edges.length, dag.edges.length, file);
      assert.equal(stage.nodes.length, Object.keys(dag.nodes).length, file);
      assert.ok(stage.edges.every(e => !/NaN|Infinity/.test(e.path)), file);
      assert.ok(stage.nodes.every(n => [n.x,n.y,n.height].every(Number.isFinite)), file);
      const external = new Set(dag.metadata!.externalInputs as string[]);
      for (const edge of dag.edges.filter(e => e.metadata?.role === "input")) {
        assert.ok(external.has(edge.source) || dag.edges.some(e => e.target === edge.source), `${file}: missing upstream ${edge.source}`);
      }
    }
    const electronics = await exampleGraph("factorio", "electronics.json");
    for (const name of ["iron-plate","copper-plate","plastic-bar","sulfuric-acid"]) assert.ok(electronics.nodes[`recipe:${name}`], name);
    const nuclear = await exampleGraph("factorio", "nuclear.json");
    assert.ok(nuclear.nodes["recipe:advanced-oil-processing"], "Rocket fuel must trace oil back to refining, not a barrel filling/emptying cycle");
    assert.ok(nuclear.nodes["material:fluid:crude-oil"]);
    assert.ok(!nuclear.nodes["recipe:empty-light-oil-barrel"]);
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
    const unavailable = (async (url: string) => { requested = url; return new Response("Unavailable", {status:503}); }) as typeof fetch;
    await assert.rejects(loadExampleWorkspace("energy", "/graph-studio/", unavailable), /Could not load/);
    assert.equal(requested, "/graph-studio/examples/energy/graph-studio.workspace.json");
  }),
  defineTest("invalid asset paths and missing workspace files fail without opening a partial example", async () => {
    const manifest = JSON.parse(await readFile("public/examples/energy/graph-studio.workspace.json", "utf8"));
    for (const asset of ["../outside.md", "/outside.md", "https://example.com/note.md", "notes/../README.md", "README.md?key=1"]) {
      const invalid = {...manifest,metadata:{...manifest.metadata,assets:[asset]}};
      let requests = 0;
      const fetcher = (async () => { requests++; return new Response(JSON.stringify(invalid)); }) as typeof fetch;
      await assert.rejects(loadExampleWorkspace("energy", "/", fetcher));
      assert.equal(requests, 1, "Reject before requesting any file outside the manifest");
    }
    const missing = (async (url:string) => url.endsWith("README.md") ? new Response("", {status:404}) : localFetch(url)) as typeof fetch;
    await assert.rejects(loadExampleWorkspace("energy", "/", missing), /Energy flows\/README.md/);
    const fallback = (async (url:string) => url.endsWith("README.md") ? new Response("<!doctype html>", {headers:{"Content-Type":"text/html"}}) : localFetch(url)) as typeof fetch;
    await assert.rejects(loadExampleWorkspace("energy", "/", fallback), /Energy flows\/README.md/);
  }),
  defineTest("switching from a Sankey example to mathematics restores a layered layout", async () => {
    const dag = await exampleGraph("mathematics", "mathematics.json");
    assert.equal(Object.keys(dag.nodes).length, 112);
    const state = graphReducer({...initialGraphAppState,layout:{...initialGraphAppState.layout,mode:"sankey"}}, {type:"graphLoaded",dag,fileName:"mathematics.json",selection:{type:"full"},status:""});
    assert.equal(state.layout.mode, "level");
    assert.equal(state.source.dirty, false);
  }),
]);
