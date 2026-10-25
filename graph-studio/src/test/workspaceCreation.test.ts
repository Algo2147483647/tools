import type { WorkspaceFolder } from "../workspace/types";
import { saveWorkspaceStyle } from "../workspace/saveStyle";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { parseStyleDocument } from "../schema/styleProtocol";
import { getAppearanceSchema } from "../schema/appearance/schema";
import { readLinkedStyle } from "../workspace/linkedStyle";
import { graphReducer } from "../app/document/graphReducer";
import { createInitialGraphState } from "../app/document/initialState";
import { serializeDag } from "../graph/serialize";
import { normalizeDagInput } from "../graph/normalize";
import assert from "node:assert/strict";
import { createLocalWorkspace, createWorkspaceGraph, graphFileName, workspaceFolderName } from "../workspace/creation";
import { discoverWorkspace, readGraphFile, WORKSPACE_MANIFEST } from "../workspace/discovery";
import { readWorkspaceDirectory } from "../workspace/browserAccess";
import { defineSuite, defineTest } from "./harness";

function disk(initial: Record<string, unknown> = {}, folderName = "Test workspace") {
  const contents = new Map(Object.entries(initial).map(([name, value]) => [name, JSON.stringify(value)]));
  const options = { permission: "granted" as PermissionState, failWrite: "", aborted: false };
  const file = (name: string): FileSystemFileHandle => ({
    name,
    kind: "file",
    isSameEntry: async (other) => other.name === name,
    getFile: async () => new File([contents.get(name)!], name),
    createWritable: async () => {
      let pending = "";
      return {
        write: async (data: unknown) => {
          if (name === options.failWrite) throw new Error("Disk write failed");
          pending = String(data);
        },
        close: async () => {
          contents.set(name, pending);
        },
        abort: async () => {
          options.aborted = true;
        },
      } as unknown as FileSystemWritableFileStream;
    },
  });
  const handle: FileSystemDirectoryHandle = {
    kind: "directory",
    name: folderName,
    isSameEntry: async (other) => other === handle,
    resolve: async () => null,
    queryPermission: async () => options.permission,
    requestPermission: async () => options.permission,
    getFileHandle: async (name, settings) => {
      if (!contents.has(name)) {
        if (!settings?.create) throw new DOMException("Missing", "NotFoundError");
        contents.set(name, "");
      }
      return file(name);
    },
    removeEntry: async (name) => {
      contents.delete(name);
    },
    entries: async function* () {
      for (const name of contents.keys()) yield [name, file(name)];
    },
  };
  return { contents, handle, options, open: async () => discoverWorkspace(await readWorkspaceDirectory(handle)) };
}

function parentDisk() {
  const parent = disk();
  const children = new Map<string, ReturnType<typeof disk>>();
  const options = { failWrite: "", extraFileOnFailure: false };
  const originalEntries = parent.handle.entries!;
  parent.handle.entries = async function* () {
    yield* originalEntries();
    for (const [name, child] of children) yield [name, child.handle];
  };
  parent.handle.getDirectoryHandle = async (name, settings) => {
    if (!children.has(name)) {
      if (!settings?.create) throw new DOMException("Missing", "NotFoundError");
      const child = disk({}, name);
      child.options.failWrite = options.failWrite;
      const removeFile = child.handle.removeEntry!;
      child.handle.removeEntry = async (path) => {
        await removeFile(path);
        if (options.extraFileOnFailure) child.contents.set("external.txt", "keep");
      };
      children.set(name, child);
    }
    return children.get(name)!.handle;
  };
  parent.handle.removeEntry = async (name) => {
    if (children.get(name)?.contents.size) throw new DOMException("Not empty", "InvalidModificationError");
    children.delete(name);
  };
  return { ...parent, children, options: { parent: parent.options, creation: options } };
}

export const workspaceCreationSuite = defineSuite("Creating workspace graph files", [
  defineTest("save and bind uses full Schema documents, preserves metadata and reloads after graph save", async () => {
    for (const chartType of ["node-link", "compound", "timeline", "sankey", "spatial"] as const) {
      const raw = {
        format: "graph-studio",
        version: 3,
        nodes: { a: {} },
        edges: [],
        metadata: { title: "Keep", layout: "existing.layout.json" },
      };
      const source = disk({ "graph.json": raw });
      const workspace = await source.open();
      const style = getDefaultChartStyle(chartType);
      style.appearance.css = ".dag-node { opacity: .75; }";
      style.hideNodeBorders = !style.hideNodeBorders;
      if (style.timeline) style.timeline.typeColors = { Category: "#123456" };
      const saved = await saveWorkspaceStyle(workspace, "graph.json", chartType, style);
      const json = JSON.parse(source.contents.get(saved.entry.path)!);
      assert.deepEqual(json, getAppearanceSchema(chartType, style).example);
      assert.deepEqual(parseStyleDocument(json, chartType).style, style);
      assert.deepEqual(JSON.parse(source.contents.get("graph.json")!), raw);
      const before = graphReducer(createInitialGraphState(), {
        type: "graphLoaded",
        dag: normalizeDagInput(raw),
        documentId: "test",
        fileName: "graph.json",
        selection: { type: "full" },
        status: "",
      });
      const bound = graphReducer(before, {
        type: "styleReferenceBound",
        generation: before.document.generation,
        reference: saved.reference,
      });
      assert.equal(bound.source.dirty, true);
      assert.deepEqual(bound.dag!.metadata, { ...raw.metadata, style: saved.reference });
      assert.equal(graphReducer(before, { type: "styleReferenceBound", generation: -1, reference: "stale" }), before);
      const undone = graphReducer(bound, { type: "undoRequested" });
      assert.deepEqual(undone.dag, before.dag);
      assert.equal(undone.source.dirty, false);
      assert.deepEqual(graphReducer(undone, { type: "redoRequested" }).dag, bound.dag);
      source.contents.set("graph.json", JSON.stringify(serializeDag(bound.dag!)));
      const reopened = await source.open();
      const loaded = await readLinkedStyle(
        normalizeDagInput(JSON.parse(source.contents.get("graph.json")!)),
        "graph.json",
        reopened,
      );
      assert.deepEqual(loaded.linkedStyle, style);
      assert.equal(loaded.linkedChartType, chartType);
      style.appearance.css = ".dag-node { opacity: .5; }";
      const count = source.contents.size;
      const again = await saveWorkspaceStyle(reopened, "graph.json", chartType, style, undefined, saved.reference);
      assert.equal(again.reference, saved.reference);
      assert.equal(source.contents.size, count);
      assert.deepEqual(
        JSON.parse(source.contents.get(saved.entry.path)!),
        getAppearanceSchema(chartType, style).example,
      );
      const updated = graphReducer(bound, {
        type: "styleReferenceBound",
        generation: bound.document.generation,
        reference: saved.reference,
      });
      assert.equal(updated.dag, bound.dag);
      assert.equal(updated.editHistory, bound.editHistory);
    }
  }),
  defineTest("updating an existing style preserves its path and retains its contents on write failure", async () => {
    const raw = { format: "graph-studio", version: 3, nodes: {}, edges: [], metadata: { style: "shared.style.json" } };
    const style = getDefaultChartStyle("compound");
    const source = disk({ "graph.json": raw, "shared.style.json": getAppearanceSchema("compound", style).example });
    const workspace = await source.open();
    const original = new Map(source.contents);
    style.appearance.css = ".dag-node { opacity: .3; }";
    source.options.failWrite = "shared.style.json";
    await assert.rejects(
      saveWorkspaceStyle(workspace, "graph.json", "compound", style, undefined, raw.metadata.style),
      /Disk write failed/,
    );
    assert.deepEqual(source.contents, original);
    source.options.failWrite = "";
    for (const path of [
      "../escape.json",
      "graph.json",
      "https://example.com/style.json",
      "graph-studio.workspace.json",
    ])
      await assert.rejects(saveWorkspaceStyle(workspace, "graph.json", "compound", style, undefined, path));
    assert.deepEqual(source.contents, original);
  }),
  defineTest("style write failure, cancellation and denial leave no file or link", async () => {
    const source = disk({ "graph.json": { format: "graph-studio", version: 3, nodes: {}, edges: [] } });
    const workspace = await source.open();
    const style = getDefaultChartStyle("compound");
    const original = new Map(source.contents);
    source.options.permission = "denied";
    await assert.rejects(saveWorkspaceStyle(workspace, "graph.json", "compound", style), /Write access/);
    assert.deepEqual(source.contents, original);
    source.options.permission = "granted";
    source.options.failWrite = "graph.compound.style.json";
    await assert.rejects(saveWorkspaceStyle(workspace, "graph.json", "compound", style), /Disk write failed/);
    assert.deepEqual(source.contents, original);
    source.options.failWrite = "";
    let currentChecks = 0;
    await assert.rejects(
      saveWorkspaceStyle(workspace, "graph.json", "compound", style, () => ++currentChecks < 2),
      { name: "AbortError" },
    );
    assert.deepEqual(source.contents, original);
    await assert.rejects(
      saveWorkspaceStyle(workspace, "graph.json", "compound", { ...style, unexpected: true } as any),
    );
    assert.deepEqual(source.contents, original);
  }),
  defineTest("style is saved next to nested graph files with a relative reference", async () => {
    const child = disk({ "nested.json": { format: "graph-studio", version: 3, nodes: {}, edges: [] } });
    const root = disk();
    root.handle.getDirectoryHandle = async (name) => {
      assert.equal(name, "graphs");
      return child.handle;
    };
    const workspace: WorkspaceFolder = {
      name: "Root",
      handle: root.handle,
      files: new Map([
        [
          "graphs/nested.json",
          { path: "graphs/nested.json", handle: await child.handle.getFileHandle!("nested.json") },
        ],
      ]),
    };
    const saved = await saveWorkspaceStyle(
      workspace,
      "graphs/nested.json",
      "node-link",
      getDefaultChartStyle("node-link"),
    );
    assert.equal(saved.entry.path, "graphs/nested.node-link.style.json");
    assert.equal(saved.reference, "nested.node-link.style.json");
    const linked = await readLinkedStyle(
      normalizeDagInput({
        format: "graph-studio",
        version: 3,
        nodes: {},
        edges: [],
        metadata: { style: saved.reference },
      }),
      "graphs/nested.json",
      { ...workspace, files: new Map(workspace.files).set(saved.entry.path, saved.entry) },
    );
    assert.deepEqual(linked.linkedStyle, getDefaultChartStyle("node-link"));
  }),

  defineTest("creates a named folder with a saved startup graph and manifest that reopen together", async () => {
    const source = parentDisk();
    const result = await createLocalWorkspace(source.handle, "  我的工作空间  ");
    const reopened = await discoverWorkspace(await readWorkspaceDirectory(result.handle));
    assert.equal(reopened.name, "我的工作空间");
    assert.equal(reopened.activePath, "graph.json");
    assert.equal(reopened.graphs[0].nodeCount, 1);
    assert.deepEqual(reopened.manifest?.graphs, ["graph.json"]);
    assert.equal(reopened.files.size, 2);
    assert.equal(source.contents.size, 0);
    const second = await createWorkspaceGraph(reopened, "second");
    assert.deepEqual(second.workspace.manifest?.graphs, ["graph.json", "second.json"]);
  }),
  defineTest("refuses existing folders and files, including case variants, without overwriting", async () => {
    const source = parentDisk();
    await createLocalWorkspace(source.handle, "Existing");
    const original = [...source.children.get("Existing")!.contents];
    await assert.rejects(createLocalWorkspace(source.handle, "EXISTING"), /already exists/);
    assert.deepEqual([...source.children.get("Existing")!.contents], original);
    source.contents.set("notes", "untouched");
    await assert.rejects(createLocalWorkspace(source.handle, "notes"), /already exists/);
    assert.equal(source.contents.get("notes"), "untouched");
    assert.equal(source.children.size, 1);
  }),
  defineTest("invalid workspace names, unavailable access and denied permission create nothing", async () => {
    const source = parentDisk();
    for (const name of [
      "",
      "..",
      "../escape",
      "sub/folder",
      "sub\\folder",
      "C:folder",
      "NUL",
      "CON.txt",
      "graph.",
      "a".repeat(256),
    ])
      assert.throws(() => workspaceFolderName(name));
    await assert.rejects(createLocalWorkspace(source.handle, "../escape"), /valid workspace name/);
    await assert.rejects(createLocalWorkspace({ ...source.handle, getDirectoryHandle: undefined }, "New"), /support/);
    source.options.parent.permission = "denied";
    await assert.rejects(createLocalWorkspace(source.handle, "New"), /Write access was not granted/);
    assert.equal(source.children.size, 0);
  }),
  defineTest("a failed startup graph or manifest write rolls back the new workspace", async () => {
    for (const failWrite of ["graph.json", WORKSPACE_MANIFEST]) {
      const source = parentDisk();
      source.options.creation.failWrite = failWrite;
      await assert.rejects(createLocalWorkspace(source.handle, "New"), /Disk write failed/);
      assert.equal(source.children.size, 0);
    }
  }),
  defineTest("rollback preserves unrelated files added concurrently and reports the incomplete folder", async () => {
    const source = parentDisk();
    source.options.creation.failWrite = WORKSPACE_MANIFEST;
    source.options.creation.extraFileOnFailure = true;
    await assert.rejects(createLocalWorkspace(source.handle, "New"), /incomplete folder/);
    assert.deepEqual([...source.children.get("New")!.contents], [["external.txt", "keep"]]);
  }),
  defineTest("creates a real v3 graph in an empty workspace that survives reopening", async () => {
    const source = disk();
    const original = await source.open();
    const result = await createWorkspaceGraph(original, "First graph");
    assert.equal(result.entry.path, "First graph.json");
    assert.ok(result.entry.handle?.createWritable);
    assert.equal(result.workspace.handle, source.handle);
    assert.equal(result.workspace.activePath, result.entry.path);
    assert.equal(result.workspace.graphs.length, 1);
    assert.equal(original.graphs.length, 0);
    assert.equal(original.files.size, 0);
    assert.deepEqual(await readGraphFile(result.entry), result.dag);
    const reopened = await source.open();
    assert.equal(reopened.activePath, result.entry.path);
    assert.equal(reopened.graphs[0].nodeCount, 1);
  }),
  defineTest("updates the latest manifest while preserving its default graph and metadata", async () => {
    const source = disk({ [WORKSPACE_MANIFEST]: { format: "graph-studio-workspace", version: 1, graphs: [] } });
    const first = await createWorkspaceGraph(await source.open(), "first.json");
    const manifest = {
      ...first.workspace.manifest,
      name: "Renamed outside the app",
      defaultGraph: "first.json",
      metadata: { tags: ["keep", "me"] },
    };
    source.contents.set(WORKSPACE_MANIFEST, JSON.stringify(manifest));
    const second = await createWorkspaceGraph(first.workspace, "second");
    assert.deepEqual(second.workspace.manifest, { ...manifest, graphs: ["first.json", "second.json"] });
    assert.deepEqual((await source.open()).manifest, second.workspace.manifest);
    assert.equal((await source.open()).activePath, "first.json");
  }),
  defineTest("refuses duplicates including files added after opening without overwriting", async () => {
    const source = disk();
    const original = await source.open();
    source.contents.set("existing.json", "keep this content");
    await assert.rejects(createWorkspaceGraph(original, "existing"), /already exists/);
    assert.equal(source.contents.get("existing.json"), "keep this content");
    const first = await createWorkspaceGraph(original, "first");
    await assert.rejects(createWorkspaceGraph(first.workspace, "FIRST.JSON"), /already exists/);
  }),
  defineTest("denied write permission leaves the workspace and disk untouched", async () => {
    const source = disk();
    source.options.permission = "denied";
    const original = await source.open();
    await assert.rejects(createWorkspaceGraph(original, "new"), /Write access was not granted/);
    assert.equal(source.contents.size, 0);
    assert.equal(original.graphs.length, 0);
  }),
  defineTest("a graph or manifest write failure removes the new file and retains the manifest", async () => {
    for (const failWrite of ["new.json", WORKSPACE_MANIFEST]) {
      const source = disk({ [WORKSPACE_MANIFEST]: { format: "graph-studio-workspace", version: 1, graphs: [] } });
      const originalManifest = source.contents.get(WORKSPACE_MANIFEST);
      source.options.failWrite = failWrite;
      await assert.rejects(createWorkspaceGraph(await source.open(), "new"), /Disk write failed/);
      assert.equal(source.contents.has("new.json"), false);
      assert.equal(source.contents.get(WORKSPACE_MANIFEST), originalManifest);
      assert.equal(source.options.aborted, true);
    }
  }),
  defineTest("invalid manifests and unavailable directory access never create files", async () => {
    const source = disk();
    const original = await source.open();
    source.contents.set(WORKSPACE_MANIFEST, "invalid json");
    await assert.rejects(createWorkspaceGraph(original, "new"));
    assert.equal(source.contents.has("new.json"), false);
    await assert.rejects(createWorkspaceGraph({ ...original, handle: null }, "new"), /folder access/);
  }),
  defineTest("normalizes names and refuses traversal, reserved names and invalid characters", () => {
    assert.equal(graphFileName("  My graph  "), "My graph.json");
    assert.equal(graphFileName("图.JSON"), "图.JSON");
    for (const name of [
      "",
      " ",
      "../escape",
      "sub/graph",
      "sub\\graph",
      "C:graph",
      "?",
      "graph.",
      "CON.json",
      WORKSPACE_MANIFEST.toUpperCase(),
    ])
      assert.throws(() => graphFileName(name));
  }),
]);
