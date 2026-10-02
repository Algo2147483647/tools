import assert from "node:assert/strict";
import { type RecentLocation, rankRecentLocations, readRecentMetadata } from "../adapters/recentImport";
import { resolveRelativeFile } from "../adapters/relativeLinks";
import { readWorkspaceDirectory, requestReadAccess, workspaceFromFiles } from "../adapters/workspaceAccess";
import {
  chooseWorkspaceGraph,
  createWorkspaceManifest,
  discoverWorkspace,
  parseWorkspaceManifest,
  readGraphFile,
  WORKSPACE_MANIFEST,
} from "../workspace/discovery";
import { linkPath, manifestPath } from "../workspace/paths";
import type { WorkspaceFolder, WorkspaceGraph } from "../workspace/types";
import { defineSuite, defineTest } from "./harness";

const graph = (title = "Example") => ({
  format: "graph-studio",
  version: 3,
  title,
  metadata: { author: "User" },
  nodes: { A: { title: "Hello" } },
  edges: [],
});
const manifest = (graphs = ["graph.json"], extra = {}) => ({
  format: "graph-studio-workspace",
  version: 1,
  graphs,
  ...extra,
});
function folder(contents: Record<string, unknown>): WorkspaceFolder {
  return {
    name: "Test",
    handle: null,
    files: new Map(
      Object.entries(contents).map(([path, data]) => [
        path,
        {
          path,
          handle: null,
          file: new File([typeof data === "string" ? data : JSON.stringify(data)], path.split("/").pop()!),
        },
      ]),
    ),
  };
}
function selectedFile(path: string) {
  const file = new File(["{}"], path.split("/").pop()!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}
const summary = (path: string, error?: string): WorkspaceGraph => ({
  path,
  title: path,
  nodeCount: 1,
  edgeCount: 0,
  error,
});
const recent = (id: string, time: number): RecentLocation => ({
  id,
  kind: "workspace",
  name: id,
  location: id,
  openedAt: time,
  canReopen: false,
});

export const workspaceSuite = defineSuite("Workspace opening and local paths", [
  defineTest("manifest round-trips legal metadata without accepting unknown fields", () => {
    const input = manifest(["graphs/main.json"], {
      defaultGraph: "graphs/main.json",
      name: "Math",
      metadata: { nested: { a: [1, true, null] } },
    });
    const result = parseWorkspaceManifest(input);
    assert.deepEqual(result, input);
    assert.notEqual(result, input);
    for (const bad of [
      { ...input, version: 2 },
      { ...input, extra: true },
      { ...input, metadata: [] },
      { ...input, name: " " },
      { ...input, defaultGraph: "missing.json" },
      { ...input, graphs: ["a.json", "a.json"] },
    ])
      assert.throws(() => parseWorkspaceManifest(bad));
  }),
  defineTest("manifest paths reject escapes, absolute paths, aliases and URL suffixes", () => {
    for (const path of [
      "../g.json",
      "/g.json",
      "C:/g.json",
      "g/../../a.json",
      "./g.json",
      "g\\a.json",
      "g.json?x",
      "g.json#x",
      "g.txt",
      " g.json",
      "g/../a.json",
    ])
      assert.throws(() => manifestPath(path), path);
    assert.equal(manifestPath("graphs/数学.json"), "graphs/数学.json");
    assert.throws(() => parseWorkspaceManifest(manifest([WORKSPACE_MANIFEST])));
  }),
  defineTest("workspace manifest restricts graph discovery and preserves asset access", async () => {
    const workspace = await discoverWorkspace(
      folder({
        [WORKSPACE_MANIFEST]: manifest(["graphs/main.json"], { name: "Math", defaultGraph: "graphs/main.json" }),
        "graphs/main.json": graph(),
        "ignored.json": graph(),
        "docs/readme.md": "Hello",
      }),
    );
    assert.equal(workspace.name, "Math");
    assert.equal(workspace.rootName, "Test");
    assert.equal(workspace.activePath, "graphs/main.json");
    assert.deepEqual(
      workspace.graphs.map((g) => g.path),
      ["graphs/main.json"],
    );
    assert.ok(workspace.files.has("docs/readme.md"));
  }),
  defineTest("bad manifest or a missing declared file rejects workspace opening", async () => {
    await assert.rejects(discoverWorkspace(folder({ [WORKSPACE_MANIFEST]: manifest(["absent.json"]) })), /missing/);
    await assert.rejects(
      discoverWorkspace(folder({ [WORKSPACE_MANIFEST]: { version: 99 }, "graph.json": graph() })),
      /Unsupported/,
    );
    await assert.rejects(discoverWorkspace(folder({ [WORKSPACE_MANIFEST]: "{" })));
  }),
  defineTest("automatic discovery ignores unrelated JSON and surfaces invalid graph documents", async () => {
    const workspace = await discoverWorkspace(
      folder({
        "main.json": graph(),
        "package.json": { name: "package" },
        "broken.json": "{",
        "bad.graph.json": "{",
        "future.json": { format: "graph-studio", version: 99 },
      }),
    );
    assert.deepEqual(
      workspace.graphs.map((g) => g.path),
      ["bad.graph.json", "future.json", "main.json"],
    );
    assert.ok(workspace.graphs[0].error);
    assert.ok(workspace.graphs[1].error);
    assert.equal(workspace.activePath, null);
    assert.ok(workspace.notices.some((message) => message.includes("2 unrelated")));
  }),
  defineTest("startup choice is recent, explicit default, root graph.json, then sole graph", () => {
    const graphs = [summary("graph.json"), summary("main.json"), summary("second.json")];
    const m = parseWorkspaceManifest(
      manifest(
        graphs.map((g) => g.path),
        { defaultGraph: "main.json" },
      ),
    );
    assert.equal(chooseWorkspaceGraph(graphs, m, "second.json"), "second.json");
    assert.equal(chooseWorkspaceGraph(graphs, m, "deleted.json"), "main.json");
    assert.equal(chooseWorkspaceGraph(graphs, null), "graph.json");
    assert.equal(chooseWorkspaceGraph([summary("nested/only.json")], null), "nested/only.json");
    assert.equal(chooseWorkspaceGraph(graphs.slice(1), null), null);
    assert.equal(chooseWorkspaceGraph([], null), null);
  }),
  defineTest("invalid explicit default does not silently open a different graph", () => {
    const graphs = [summary("graph.json"), summary("bad.json", "invalid")];
    const m = parseWorkspaceManifest(manifest(["graph.json", "bad.json"], { defaultGraph: "bad.json" }));
    assert.equal(chooseWorkspaceGraph(graphs, m), null);
    assert.equal(chooseWorkspaceGraph(graphs, m, "graph.json"), "graph.json");
  }),
  defineTest("empty folders and unrelated project folders can open without a graph", async () => {
    const workspace = await discoverWorkspace(folder({ "package.json": { name: "app" }, "README.md": "Text" }));
    assert.equal(workspace.activePath, null);
    assert.equal(workspace.graphs.length, 0);
    assert.equal((await discoverWorkspace(folder({}))).graphs.length, 0);
  }),
  defineTest("manifest export keeps invalid graph entries and metadata but drops stale default", async () => {
    const workspace = await discoverWorkspace(
      folder({
        [WORKSPACE_MANIFEST]: manifest(["graph.json", "bad.graph.json"], { metadata: { custom: 42 } }),
        "graph.json": graph(),
        "bad.graph.json": "{",
      }),
    );
    workspace.activePath = "deleted.json";
    const exported = createWorkspaceManifest(workspace);
    assert.equal(exported.defaultGraph, undefined);
    assert.deepEqual(exported.metadata, { custom: 42 });
    assert.deepEqual(exported.graphs, ["graph.json", "bad.graph.json"]);
    assert.deepEqual(parseWorkspaceManifest(exported), exported);
  }),
  defineTest("graph file reads use fresh handles and preserve document metadata", async () => {
    let title = "First";
    const handle = {
      getFile: async () => new File([JSON.stringify(graph(title))], "graph.json"),
    } as FileSystemFileHandle;
    const entry = { path: "graph.json", handle };
    assert.equal((await readGraphFile(entry)).title, "First");
    title = "Updated";
    const result = await readGraphFile(entry);
    assert.equal(result.title, "Updated");
    assert.deepEqual(result.metadata, { author: "User" });
    await assert.rejects(
      readGraphFile({ path: "bad.json", handle: null, file: new File(["{}"], "bad.json") }),
      /bad.json/,
    );
  }),
  defineTest("discovery is bounded and manifests avoid scanning unrelated JSON", async () => {
    const contents = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`other/${i}.json`, {}]));
    await assert.rejects(discoverWorkspace(folder(contents)), /1,000/);
    const w = await discoverWorkspace(folder({ ...contents, [WORKSPACE_MANIFEST]: manifest(), "graph.json": graph() }));
    assert.equal(w.activePath, "graph.json");
  }),
  defineTest("folder enumeration skips generated and hidden directories without reading assets", async () => {
    let reads = 0;
    const fileHandle = {
      kind: "file",
      name: "graph.json",
      getFile: async () => {
        reads++;
        return new File(["{}"], "graph.json");
      },
    };
    const directory = (name: string, entries: unknown[]) => ({
      kind: "directory",
      name,
      async *entries() {
        yield* entries;
      },
    });
    const handle = directory("Root", [
      ["graph.json", fileHandle],
      ["node_modules", directory("node_modules", [["x.json", fileHandle]])],
      [".git", directory(".git", [])],
      ["docs", directory("docs", [["note.md", fileHandle]])],
    ]) as unknown as FileSystemDirectoryHandle;
    const result = await readWorkspaceDirectory(handle);
    assert.equal(reads, 0);
    assert.deepEqual([...result.files.keys()], ["graph.json", "docs/note.md"]);
  }),
  defineTest("fallback folder selection strips exactly one root and rejects duplicates", () => {
    const result = workspaceFromFiles([
      selectedFile("Root/graph.json"),
      selectedFile("Root/docs/note.md"),
      selectedFile("Root/node_modules/pkg/data.json"),
    ]);
    assert.equal(result.name, "Root");
    assert.deepEqual([...result.files.keys()], ["graph.json", "docs/note.md"]);
    assert.throws(
      () => workspaceFromFiles([selectedFile("Root/a.json"), selectedFile("Other/a.json")]),
      /same workspace/,
    );
    assert.throws(() => workspaceFromFiles([selectedFile("Root/a.json"), selectedFile("Root/a.json")]), /Duplicate/);
    assert.throws(() => workspaceFromFiles([selectedFile("Root/../outside.json")]), /outside/);
  }),
  defineTest("recent handle access uses an existing grant or explicitly requests one", async () => {
    let requested = 0;
    const handle = {
      queryPermission: async () => "granted",
      requestPermission: async () => {
        requested++;
        return "granted";
      },
    } as unknown as FileSystemFileHandle;
    assert.equal(await requestReadAccess(handle), true);
    assert.equal(requested, 0);
    handle.queryPermission = async () => "prompt";
    assert.equal(await requestReadAccess(handle), true);
    assert.equal(requested, 1);
    handle.requestPermission = async () => "denied";
    assert.equal(await requestReadAccess(handle), false);
  }),
  defineTest("links resolve relative to each source file, including URL-encoded names", () => {
    assert.equal(linkPath("../docs/Read%20me.md?view=1#intro", "graphs/main.json"), "docs/Read me.md");
    assert.equal(linkPath("./next.md", "docs/start.md"), "docs/next.md");
    assert.equal(linkPath("docs\\note.md"), "docs/note.md");
    for (const path of ["../secret", "%2e%2e/secret", "%2fsecret", "C:/secret", "\\\\server\\share", "bad%XX"])
      assert.throws(() => linkPath(path), path);
    assert.throws(() => linkPath("../../secret", "docs/start.md"), /outside/);
  }),
  defineTest("relative files require an open workspace and cannot escape its file inventory", async () => {
    assert.equal((await resolveRelativeFile(null, "docs/a.md")).ok, false);
    const root = { ...folder({ "docs/a.md": "Text" }), baseFile: "graphs/main.json" };
    const resolved = await resolveRelativeFile(root, "../docs/a.md");
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.file.relativePath, "docs/a.md");
      assert.equal(resolved.file.previewKind, "markdown");
      URL.revokeObjectURL(resolved.file.url);
    }
    assert.equal((await resolveRelativeFile(root, "../../secret.md")).ok, false);
    assert.equal((await resolveRelativeFile(root, "../missing.md")).ok, false);
  }),
  defineTest("recent list updates existing records and keeps at most twenty locations", () => {
    const list = Array.from({ length: 25 }, (_, i) => recent(String(i), i));
    const ranked = rankRecentLocations(list, { ...recent("4", 100), lastGraph: "new.json" });
    assert.equal(ranked.length, 20);
    assert.equal(ranked[0].id, "4");
    assert.equal(ranked[0].lastGraph, "new.json");
    assert.equal(ranked.filter((r) => r.id === "4").length, 1);
  }),
  defineTest("recent metadata tolerates unavailable or corrupt storage without trusting handles", () => {
    assert.deepEqual(readRecentMetadata({ getItem: () => "{", setItem: () => {} }), []);
    assert.deepEqual(
      readRecentMetadata({
        getItem: () => {
          throw Error("blocked");
        },
        setItem: () => {},
      }),
      [],
    );
    const result = readRecentMetadata({
      getItem: () =>
        JSON.stringify([
          null,
          {},
          recent("ok", 20),
          { ...recent("bad", 0), kind: "other" },
          { ...recent("old", 1), canReopen: true, handle: { fake: true } },
        ]),
      setItem: () => {},
    });
    assert.deepEqual(
      result.map((r) => r.id),
      ["ok", "old"],
    );
    assert.equal(result[1].canReopen, false);
    assert.equal(result[1].handle, undefined);
  }),
]);
