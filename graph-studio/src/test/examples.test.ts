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
  defineTest("Factorio replaces the atlas with two target plans and restores obsolete recent paths", async () => {
    const folder = await loadExampleWorkspace("factorio", "/", localFetch);
    for (const previous of ["all-products.json", "start-here.json", "science.json"]) {
      const workspace = await discoverWorkspace(folder, previous);
      assert.deepEqual(workspace.graphs.map(g => g.path), ["rocket-1-per-second.json", "science-1-per-second.json"]);
      assert.equal(workspace.activePath, "rocket-1-per-second.json");
    }
    const rocket = await exampleGraph("factorio", "rocket-1-per-second.json");
    assert.deepEqual(rocket.metadata!.targetsPerSecond, {"item:launch-ready-rocket":1});
    assert.equal(rocket.nodes["recipe:rocket-part"].craftsPerSecond, 50);
    for (const name of ["processing-unit", "low-density-structure", "rocket-fuel"]) {
      assert.equal(rocket.edges.find(e => e.source === `material:item:${name}` && e.target === "recipe:rocket-part")!.value, 50);
    }
    assert.equal(rocket.nodes["supply:item:copper-ore"].ratePerSecond, 3000);
    assert.equal(rocket.nodes["supply:item:iron-ore"].ratePerSecond, 1705);
    assert.ok(!rocket.nodes["recipe:rocket"], "A launch vehicle is not rocket ammunition");
    const science = await exampleGraph("factorio", "science-1-per-second.json");
    const packs = ["automation","logistic","military","chemical","production","utility","space","metallurgic","electromagnetic","agricultural","cryogenic","promethium"];
    assert.deepEqual(science.metadata!.targetsPerSecond, Object.fromEntries(packs.map(name => [`item:${name}-science-pack`,1])));
    for (const name of packs) assert.equal(science.nodes[`target:item:${name}-science-pack`].ratePerSecond, 1);
    for (const [name, batch] of [["chemical",2],["military",2],["production",3],["utility",3],["space",5],["promethium",10],["agricultural",1.5],["metallurgic",1.5],["electromagnetic",1.5]] as const) {
      assert.equal(science.nodes[`recipe:${name}-science-pack`].craftsPerSecond, 1 / batch);
    }
  }),
  defineTest("Factorio rates balance every shared material and account for each recipe input and output", async () => {
    const close = (a:number, b:number, message:string) => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${message}: ${a} != ${b}`);
    for (const file of ["rocket-1-per-second.json", "science-1-per-second.json"]) {
      const dag = await exampleGraph("factorio", file);
      assert.ok(dag.edges.every(e => typeof e.value === "number" && Number.isFinite(e.value) && e.value > 0));
      for (const [key, node] of Object.entries(dag.nodes)) {
        const incoming = dag.edges.filter(e => e.target === key);
        const outgoing = dag.edges.filter(e => e.source === key);
        if (key.startsWith("material:")) {
          const b = node.balancePerSecond as Record<string,number>;
          close(b.produced + b.external, b.consumed + b.target + b.surplus, `${key} ledger`);
          close(incoming.reduce((s,e) => s + Number(e.value),0), b.produced + b.external, `${key} incoming`);
          close(outgoing.reduce((s,e) => s + Number(e.value),0), b.consumed + b.target + b.surplus, `${key} outgoing`);
        }
        if (key.startsWith("recipe:")) {
          for (const [field, edges, endpoint] of [["inputsPerCraft",incoming,"source"],["outputsPerCraft",outgoing,"target"]] as const) {
            const coefficients = node[field] as Record<string,number>;
            assert.equal(edges.length, Object.keys(coefficients).length);
            for (const [material, amount] of Object.entries(coefficients)) {
              close(Number(edges.find(e => e[endpoint] === `material:${material}`)!.value), amount * Number(node.craftsPerSecond), `${key} ${material}`);
            }
          }
        }
      }
      const reachable = new Set(Object.keys(dag.nodes).filter(key => key.startsWith("supply:")));
      for (let previous = -1; previous !== reachable.size;) {
        previous = reachable.size;
        for (const edge of dag.edges) if (reachable.has(edge.source)) reachable.add(edge.target);
      }
      assert.equal(reachable.size, Object.keys(dag.nodes).length, "Every process and target must connect to upstream raw supply");
    }
  }),
  defineTest("complete Factorio target chains render all branches and catalyst/coolant returns", async () => {
    for (const file of ["rocket-1-per-second.json", "science-1-per-second.json"]) {
      const dag = await exampleGraph("factorio", file);
      const stage = buildStageData({dag,selection:{type:"full"}})!;
      assert.equal(stage.nodes.length, Object.keys(dag.nodes).length);
      assert.equal(stage.edges.length, dag.edges.length);
      assert.ok(stage.edges.every(e => !/NaN|Infinity/.test(e.path)));
      assert.ok(stage.nodes.every(n => [n.x,n.y,n.height].every(Number.isFinite)));
      assert.ok(new Set(stage.nodes.map(n => n.layer)).size > 8);
      for (const edge of dag.edges.filter(e => e.metadata?.feedback)) assert.ok(stage.edges.find(e => e.id === edge.id)!.flow!.feedback);
      for (const node of stage.nodes.filter(n => n.key.startsWith("target:"))) assert.equal(node.layer, Math.max(...stage.nodes.map(n => n.layer)));
    }
    const science = await exampleGraph("factorio", "science-1-per-second.json");
    assert.ok(science.edges.some(e => e.source === "recipe:pentapod-egg" && e.target === "material:item:pentapod-egg" && e.metadata?.feedback));
    assert.ok(science.edges.some(e => e.source === "recipe:cryogenic-science-pack" && e.target === "material:fluid:fluoroketone-hot" && e.metadata?.feedback));
    assert.ok(science.edges.some(e => e.source === "material:item:bioflux" && e.target === "recipe:biter-egg"));
    assert.ok(science.nodes["recipe:nutrients-from-bioflux"]);
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
    const state = graphReducer({...initialGraphAppState,chartType:"sankey",layout:{mode:"dagre"}}, {type:"graphLoaded",dag,fileName:"mathematics.json",selection:{type:"full"},status:""});
    assert.equal(state.chartType, "node-link");
    assert.equal(state.layout.mode, "dagre");
    assert.equal(state.source.dirty, false);
  }),
]);
