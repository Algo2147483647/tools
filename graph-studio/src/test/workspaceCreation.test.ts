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
