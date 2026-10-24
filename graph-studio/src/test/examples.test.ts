import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { readRecentMetadata } from "../workspace/recentStorage";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { buildStageData } from "../layout/node-link/layout";
import { graphReducer } from "../app/document/graphReducer";
import { initialGraphAppState } from "../app/document/initialState";
import { discoverWorkspace, readGraphFile } from "../workspace/discovery";
import { readWorkspaceFile } from "../workspace/browserAccess";
import { EXAMPLE_WORKSPACES, loadExampleWorkspace } from "../workspace/examples";
import { resolveWorkspacePath } from "../workspace/paths";
import { parseRecentMetadata } from "../workspace/locations";
import { defineSuite, defineTest } from "./harness";

async function exampleGraph(id: string, path: string) {
  return normalizeDagInput(JSON.parse(await readFile(`public/examples/${id}/${path}`, "utf8")));
}
async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? listFiles(`${directory}/${entry.name}`, `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    ),
  );
  return files.flat();
}
const localFetch = (async (url: string) => {
  const path = decodeURIComponent(url.split("/examples/")[1]);
  try {
    return new Response(await readFile(`public/examples/${path}`, "utf8"));
  } catch {
    return new Response("Not found", { status: 404 });
  }
}) as typeof fetch;

export const examplesSuite = defineSuite("Bundled example workspaces", [
  defineTest("Beijing road recent entries reopen the replacement metro network", async () => {
    const folder = await loadExampleWorkspace("spatial-atlas", "/", localFetch);
    const workspace = await discoverWorkspace(folder, "beijing-roads.json");
    assert.equal(workspace.activePath, "beijing-metro.json");
    assert.ok(!folder.files.has("beijing-roads.json"));
    const local = await discoverWorkspace({ ...folder, exampleId: undefined }, "beijing-roads.json");
    assert.equal(local.activePath, "all-sky.json");
  }),
  defineTest("history workspaces merge without breaking old European recent entries or note paths", async () => {
    const folder = await loadExampleWorkspace("china-history", "/", localFetch);
    const workspace = await discoverWorkspace(folder);
    assert.equal(workspace.name, "Human History");
    assert.deepEqual(
      workspace.graphs.map((graph) => graph.path),
      ["china-history.json", "europe/europe-history.json"],
    );
    assert.equal(workspace.activePath, "china-history.json");
    assert.equal(workspace.manifest!.metadata!.nodeCount, 1871);
    assert.equal(workspace.manifest!.metadata!.edgeCount, 2995);
    assert.ok(folder.files.has("europe/notes/ancient.md"));
    const legacy = await discoverWorkspace(
      await loadExampleWorkspace("europe-history", "/", localFetch),
      "europe-history.json",
    );
    assert.equal(legacy.name, "Human History");
    assert.equal(legacy.exampleId, "china-history");
    assert.equal(legacy.activePath, "europe/europe-history.json");
    const recents = parseRecentMetadata(
      JSON.stringify([
        {
          id: "example:europe-history",
          exampleId: "europe-history",
          kind: "workspace",
          name: "欧洲历史",
          location: "Example workspace",
          lastGraph: "europe-history.json",
          openedAt: 3,
        },
        {
          id: "example:china-history",
          exampleId: "china-history",
          kind: "workspace",
          name: "中国历史",
          location: "Example workspace",
          lastGraph: "china-history.json",
          openedAt: 2,
        },
        {
          id: "example:space-history",
          exampleId: "space-history",
          kind: "workspace",
          name: "World space history",
          location: "Example workspace",
          lastGraph: "space-history.json",
          openedAt: 1,
        },
      ]),
    );
    assert.equal(recents.length, 2);
    assert.equal(recents[0].name, "Human History");
    assert.equal(recents[0].id, "example:china-history");
    assert.equal(recents[0].lastGraph, "europe/europe-history.json");
    assert.equal(recents[1].name, "History of Technology");
    const technology = await discoverWorkspace(await loadExampleWorkspace("space-history", "/", localFetch));
    assert.equal(technology.name, "History of Technology");
    assert.equal(technology.activePath, "space-history.json");
  }),
  defineTest(
    "all example graphs load, serialize, and have no missing files and retain their documented language",
    async () => {
      for (const example of EXAMPLE_WORKSPACES) {
        const folder = await loadExampleWorkspace(example.id, "/studio/", localFetch);
        const workspace = await discoverWorkspace(folder);
        assert.ok(workspace.activePath);
        assert.equal(workspace.exampleId, example.id);
        assert.equal(workspace.handle, null);
        assert.deepEqual(
          [...folder.files.keys()].sort(),
          (await listFiles(`public/examples/${example.id}`)).sort(),
          "The homepage must load the actual workspace files",
        );
        for (const entry of folder.files.values()) {
          assert.equal(entry.handle, null);
          const text = await (await readWorkspaceFile(entry)).text();
          if (!["china-history", "europe-history", "spatial-atlas"].includes(example.id)) {
            // Native personal names are an intentional exception in the English science history.
            let prose = text;
            if (example.id === "space-history" && entry.path.startsWith("mathematics-physics/")) {
              const science = JSON.parse(
                await readFile("public/examples/space-history/mathematics-physics/mathematics-physics.json", "utf8"),
              );
              for (const name of science.metadata.nativeNameForms) prose = prose.split(name).join("");
            }
            assert.doesNotMatch(prose, /[\u4e00-\u9fff]/);
          }
          // Resolve every generated Markdown link, including the graph's note fields.
          for (const match of text.matchAll(/\]\((\.{1,2}\/[\w/.-]+)\)/g)) {
            assert.ok(
              folder.files.has(resolveWorkspacePath(match[1], entry.path)),
              `${entry.path}: missing ${match[1]}`,
            );
          }
        }
        for (const entry of workspace.graphs) {
          assert.equal(entry.error, undefined, `${example.id}/${entry.path}: ${entry.error}`);
          const dag = await readGraphFile(folder.files.get(entry.path)!);
          assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
        }
      }
    },
  ),
  defineTest("Factorio replaces the atlas with two target plans and restores obsolete recent paths", async () => {
    const folder = await loadExampleWorkspace("factorio", "/", localFetch);
    for (const previous of ["all-products.json", "start-here.json", "science.json"]) {
      const workspace = await discoverWorkspace(folder, previous);
      assert.deepEqual(
        workspace.graphs.map((g) => g.path),
        ["science-1-per-second.json", "rocket-1-per-second.json"],
      );
      assert.equal(workspace.activePath, "science-1-per-second.json");
    }
    const rocket = await exampleGraph("factorio", "rocket-1-per-second.json");
    assert.deepEqual(rocket.metadata!.targetsPerSecond, { "item:launch-ready-rocket": 1 });
    assert.equal(rocket.nodes["recipe:rocket-part"].craftsPerSecond, 50);
    for (const name of ["processing-unit", "low-density-structure", "rocket-fuel"]) {
      assert.equal(
        rocket.edges.find((e) => e.source === `material:item:${name}` && e.target === "recipe:rocket-part")!.value,
        50,
      );
    }
    assert.equal(rocket.nodes["supply:item:copper-ore"].ratePerSecond, 3000);
    assert.equal(rocket.nodes["supply:item:iron-ore"].ratePerSecond, 1705);
    assert.ok(!rocket.nodes["recipe:rocket"], "A launch vehicle is not rocket ammunition");
    const science = await exampleGraph("factorio", "science-1-per-second.json");
    const packs = [
      "automation",
      "logistic",
      "military",
      "chemical",
      "production",
      "utility",
      "space",
      "metallurgic",
      "electromagnetic",
      "agricultural",
      "cryogenic",
      "promethium",
    ];
    assert.deepEqual(
      science.metadata!.targetsPerSecond,
      Object.fromEntries(packs.map((name) => [`item:${name}-science-pack`, 1])),
    );
    for (const name of packs) assert.equal(science.nodes[`target:item:${name}-science-pack`].ratePerSecond, 1);
    for (const [name, batch] of [
      ["chemical", 2],
      ["military", 2],
      ["production", 3],
      ["utility", 3],
      ["space", 5],
      ["promethium", 10],
      ["agricultural", 1.5],
      ["metallurgic", 1.5],
      ["electromagnetic", 1.5],
    ] as const) {
      assert.equal(science.nodes[`recipe:${name}-science-pack`].craftsPerSecond, 1 / batch);
    }
  }),
  defineTest("Factorio rates balance every shared material and account for each recipe input and output", async () => {
    const close = (a: number, b: number, message: string) =>
      assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${message}: ${a} != ${b}`);
    for (const file of ["science-1-per-second.json", "rocket-1-per-second.json"]) {
      const dag = await exampleGraph("factorio", file);
      assert.ok(dag.edges.every((e) => typeof e.value === "number" && Number.isFinite(e.value) && e.value > 0));
      for (const [key, node] of Object.entries(dag.nodes)) {
        const incoming = dag.edges.filter((e) => e.target === key);
        const outgoing = dag.edges.filter((e) => e.source === key);
        if (key.startsWith("material:")) {
          const b = node.balancePerSecond as Record<string, number>;
          close(b.produced + b.external, b.consumed + b.target + b.surplus, `${key} ledger`);
          close(
            incoming.reduce((s, e) => s + Number(e.value), 0),
            b.produced + b.external,
            `${key} incoming`,
          );
          close(
            outgoing.reduce((s, e) => s + Number(e.value), 0),
            b.consumed + b.target + b.surplus,
            `${key} outgoing`,
          );
        }
        if (key.startsWith("recipe:")) {
          for (const [field, edges, endpoint] of [
            ["inputsPerCraft", incoming, "source"],
            ["outputsPerCraft", outgoing, "target"],
          ] as const) {
            const coefficients = node[field] as Record<string, number>;
            assert.equal(edges.length, Object.keys(coefficients).length);
            for (const [material, amount] of Object.entries(coefficients)) {
              close(
                Number(edges.find((e) => e[endpoint] === `material:${material}`)!.value),
                amount * Number(node.craftsPerSecond),
                `${key} ${material}`,
              );
            }
          }
        }
      }
      const reachable = new Set(Object.keys(dag.nodes).filter((key) => key.startsWith("supply:")));
      for (let previous = -1; previous !== reachable.size;) {
        previous = reachable.size;
        for (const edge of dag.edges) if (reachable.has(edge.source)) reachable.add(edge.target);
      }
      assert.equal(
        reachable.size,
        Object.keys(dag.nodes).length,
        "Every process and target must connect to upstream raw supply",
      );
    }
  }),
  defineTest("complete Factorio target chains render all branches and catalyst/coolant returns", async () => {
    for (const file of ["science-1-per-second.json", "rocket-1-per-second.json"]) {
      const dag = await exampleGraph("factorio", file);
      const stage = buildStageData({ dag, selection: { type: "full" } })!;
      assert.equal(stage.nodes.length, Object.keys(dag.nodes).length);
      assert.equal(stage.edges.length, dag.edges.length);
      assert.ok(stage.edges.every((e) => !/NaN|Infinity/.test(e.path)));
      assert.ok(stage.nodes.every((n) => [n.x, n.y, n.height].every(Number.isFinite)));
      assert.ok(new Set(stage.nodes.map((n) => n.layer)).size > 8);
      for (const edge of dag.edges.filter((e) => e.metadata?.feedback))
        assert.ok(stage.edges.find((e) => e.id === edge.id)!.flow!.feedback);
      for (const node of stage.nodes.filter((n) => n.key.startsWith("target:")))
        assert.equal(node.layer, Math.max(...stage.nodes.map((n) => n.layer)));
    }
    const science = await exampleGraph("factorio", "science-1-per-second.json");
    assert.ok(
      science.edges.some(
        (e) => e.source === "recipe:pentapod-egg" && e.target === "material:item:pentapod-egg" && e.metadata?.feedback,
      ),
    );
    assert.ok(
      science.edges.some(
        (e) =>
          e.source === "recipe:cryogenic-science-pack" &&
          e.target === "material:fluid:fluoroketone-hot" &&
          e.metadata?.feedback,
      ),
    );
    assert.ok(science.edges.some((e) => e.source === "material:item:bioflux" && e.target === "recipe:biter-egg"));
    assert.ok(science.nodes["recipe:nutrients-from-bioflux"]);
  }),
  defineTest("example opens are independent copies and recent entries reopen without folder permission", async () => {
    const first = await loadExampleWorkspace("factorio", "/", localFetch);
    const second = await loadExampleWorkspace("factorio", "/", localFetch);
    const a = await readGraphFile(first.files.get("science-1-per-second.json")!);
    const b = await readGraphFile(second.files.get("science-1-per-second.json")!);
    a.nodes["material:fluid:water"].title = "Edited";
    assert.equal(b.nodes["material:fluid:water"].title, "Water");
    first.files.clear();
    assert.ok(second.files.size > 0);
    const recents = readRecentMetadata({
      getItem: () =>
        JSON.stringify([
          {
            id: "example:factorio",
            kind: "workspace",
            name: "Factorio production",
            location: "Factorio production",
            openedAt: 123,
            exampleId: "factorio",
            lastGraph: "science-1-per-second.json",
          },
        ]),
      setItem: () => {},
    });
    assert.equal(recents[0].canReopen, true);
    assert.equal(recents[0].exampleId, "factorio");
  }),
  defineTest("unknown or unavailable examples fail cleanly and respect the deployment base", async () => {
    await assert.rejects(loadExampleWorkspace("../escape", "/", localFetch), /Unknown/);
    let requested = "";
    const unavailable = (async (url: string) => {
      requested = url;
      return new Response("Unavailable", { status: 503 });
    }) as typeof fetch;
    await assert.rejects(loadExampleWorkspace("factorio", "/graph-studio/", unavailable), /Could not load/);
    assert.equal(requested, "/graph-studio/examples/factorio/graph-studio.workspace.json");
  }),
  defineTest("unsafe paths and missing graphs reject opening; unavailable notes fail only when opened", async () => {
    const manifest = JSON.parse(await readFile("public/examples/factorio/graph-studio.workspace.json", "utf8"));
    for (const asset of [
      "../outside.md",
      "/outside.md",
      "https://example.com/note.md",
      "notes/../README.md",
      "README.md?key=1",
    ]) {
      const invalid = { ...manifest, metadata: { ...manifest.metadata, assets: [asset] } };
      let requests = 0;
      const fetcher = (async () => {
        requests++;
        return new Response(JSON.stringify(invalid));
      }) as typeof fetch;
      await assert.rejects(loadExampleWorkspace("factorio", "/", fetcher));
      assert.equal(requests, 1, "Reject before requesting any file outside the manifest");
    }
    const missing = (async (url: string) =>
      url.endsWith("README.md") ? new Response("", { status: 404 }) : localFetch(url)) as typeof fetch;
    const folder = await loadExampleWorkspace("factorio", "/", missing);
    assert.equal((await discoverWorkspace(folder)).activePath, "science-1-per-second.json");
    await assert.rejects(readWorkspaceFile(folder.files.get("README.md")!), /Factorio production\/README.md/);
    const fallback = (async (url: string) =>
      url.endsWith("README.md")
        ? new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } })
        : localFetch(url)) as typeof fetch;
    const fallbackFolder = await loadExampleWorkspace("factorio", "/", fallback);
    await assert.rejects(readWorkspaceFile(fallbackFolder.files.get("README.md")!), /Factorio production\/README.md/);
    const missingGraph = (async (url: string) =>
      url.endsWith("science-1-per-second.json") ? new Response("", { status: 404 }) : localFetch(url)) as typeof fetch;
    await assert.rejects(
      loadExampleWorkspace("factorio", "/", missingGraph),
      /Factorio production\/science-1-per-second.json/,
    );
  }),
  defineTest("large examples open without downloading notes and share only immutable cached files", async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      return localFetch(url);
    }) as typeof fetch;
    const first = await loadExampleWorkspace("mathematics", "/", fetcher);
    const workspace = await discoverWorkspace(first);
    assert.equal(requested.length, 1 + workspace.graphs.length);
    assert.ok(requested.every((url) => url.endsWith(".json")));
    assert.equal(first.files.size, 228, "The full workspace inventory stays available");
    const note = first.files.get("README.md")!;
    const [a, b] = await Promise.all([readWorkspaceFile(note), readWorkspaceFile(note)]);
    assert.equal(a, b);
    assert.equal(requested.filter((url) => url.endsWith("README.md")).length, 1);
    assert.match(await a.text(), /Mathematics/);
    const count = requested.length;
    const second = await loadExampleWorkspace("mathematics", "/", fetcher);
    assert.equal(requested.length, count, "Reopening must not repeat network requests");
    assert.notEqual(first.files, second.files);
    assert.notEqual(first.files.get("mathematics.json"), second.files.get("mathematics.json"));
  }),
  defineTest("refresh replaces cached downloads while failed note requests remain retryable", async () => {
    let revision = "First";
    let failNote = true;
    const fetcher = (async (url: string) => {
      if (url.endsWith("README.md") && failNote) return new Response("Missing", { status: 404 });
      const response = await localFetch(url);
      if (!url.endsWith("science-1-per-second.json")) return response;
      const graph = await response.json();
      return new Response(JSON.stringify({ ...graph, title: revision }));
    }) as typeof fetch;
    const first = await loadExampleWorkspace("factorio", "/", fetcher);
    await assert.rejects(readWorkspaceFile(first.files.get("README.md")!));
    failNote = false;
    assert.ok((await readWorkspaceFile(first.files.get("README.md")!)).size > 0);
    revision = "Second";
    const refreshed = await loadExampleWorkspace("factorio", "/", fetcher, { reload: true });
    assert.equal((await readGraphFile(first.files.get("science-1-per-second.json")!)).title, "First");
    assert.equal((await readGraphFile(refreshed.files.get("science-1-per-second.json")!)).title, "Second");
  }),
  defineTest("stalled example requests time out, abort and can be retried", async () => {
    let stalled = true;
    let signal: AbortSignal | null = null;
    const fetcher = (async (url: string, options?: RequestInit) => {
      signal = options?.signal ?? null;
      if (stalled) return new Promise<Response>(() => {});
      return localFetch(url);
    }) as typeof fetch;
    await assert.rejects(loadExampleWorkspace("factorio", "/", fetcher, { timeoutMs: 10 }), /timed out/);
    assert.equal((signal as AbortSignal | null)?.aborted, true);
    stalled = false;
    const folder = await loadExampleWorkspace("factorio", "/", fetcher);
    assert.equal((await discoverWorkspace(folder)).activePath, "science-1-per-second.json");
  }),
  defineTest("switching from a Sankey example to mathematics restores a layered layout", async () => {
    const dag = await exampleGraph("mathematics", "mathematics.json");
    assert.equal(Object.keys(dag.nodes).length, 11);
    const state = graphReducer(
      { ...initialGraphAppState, chartType: "sankey", layout: { mode: "dagre" } },
      {
        type: "graphLoaded",
        documentId: "mathematics-example",
        dag,
        fileName: "mathematics.json",
        selection: { type: "full" },
        status: "",
      },
    );
    assert.equal(state.chartType, "node-link");
    assert.equal(state.layout.mode, "dagre");
    assert.equal(state.source.dirty, false);
  }),
]);
