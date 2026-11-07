import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { LocalService } from "../service";
import { createApplication } from "../http";
import { revision } from "../files";
import { createStyleDocument } from "../../src/schema/styleProtocol";
import { getDefaultChartStyle } from "../../src/schema/appearance/styles";

const graph = (title = "Original") =>
  JSON.stringify({ format: "graph-studio", version: 3, title, nodes: { a: {} }, edges: [] });
async function fixture(run: (service: LocalService, root: string, opened: string[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "graph-studio-service-"));
  const opened: string[] = [];
  const service = new LocalService(join(root, "state"), join(root, "examples"), async (path) => {
    opened.push(path);
  });
  try {
    await service.initialize();
    await run(service, root, opened);
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("create, persistent recent identity, session, remove and restart", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Notes");
    assert.equal(created.activePath, "graph.json");
    assert.equal(created.manifest, null);
    await service.session(created.id, "graph.json");
    assert.equal((await service.recent())[0].lastGraph, "graph.json");
    assert.equal((await service.register(join(root, "Notes/../Notes"), "workspace")).id, created.id);
    await assert.rejects(service.create(root, "Notes"), /exist/i);
    await service.close();
    await service.initialize();
    assert.equal((await service.recent())[0].id, created.id);
    await service.removeRecent([created.id]);
    assert.equal((await service.recent()).length, 0);
    assert.ok(await readFile(join(root, "Notes/graph.json")));
  }));

test("broken and stale manifests cannot gate discovery or graph creation", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Notes");
    await writeFile(join(root, "Notes/graph-studio.workspace.json"), "{");
    await writeFile(join(root, "Notes/extra.json"), graph("Extra"));
    let found = await service.snapshot(created.id);
    assert.equal(found.graphs.length, 2);
    assert.match(found.notices.join(" "), /ignored/i);
    await writeFile(
      join(root, "Notes/graph-studio.workspace.json"),
      JSON.stringify({ format: "graph-studio-workspace", version: 1, graphs: ["missing.json"] }),
    );
    found = await service.snapshot(created.id);
    assert.match(found.graphs[0].error!, /missing/);
    assert.ok(found.graphs.some((graph) => graph.path === found.activePath && !graph.error));
    await service.write(created.id, "new.json", graph(), null);
    assert.equal((await service.snapshot(created.id)).graphs.length, 4);
  }));

test("file opening preference survives restart and invalid updates preserve its value", async () =>
  fixture(async (service) => {
    assert.deepEqual(service.getPreferences(), { fileOpenMode: "preview" });
    await service.updatePreferences({ fileOpenMode: "external" });
    await service.close();
    await service.initialize();
    assert.deepEqual(service.getPreferences(), { fileOpenMode: "external" });
    await assert.rejects(service.updatePreferences({ fileOpenMode: "unknown" }), /preview or external/);
    assert.deepEqual(service.getPreferences(), { fileOpenMode: "external" });
    await service.updatePreferences({ fileOpenMode: "preview" });
    await service.close();
    await service.initialize();
    assert.deepEqual(service.getPreferences(), { fileOpenMode: "preview" });
  }));

test("conditional saves detect external edits and serialize competing writes", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Notes");
    const original = await service.read(created.id, "graph.json");
    const results = await Promise.allSettled([
      service.write(created.id, "graph.json", graph("First"), original.revision),
      service.write(created.id, "graph.json", graph("Second"), original.revision),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const saved = await service.read(created.id, "graph.json");
    await writeFile(join(root, "Notes/graph.json"), graph("External"));
    await assert.rejects(service.write(created.id, "graph.json", graph(), saved.revision), /changed outside/);
    assert.equal(JSON.parse(await readFile(join(root, "Notes/graph.json"), "utf8")).title, "External");
    const current = await service.read(created.id, "graph.json");
    await assert.rejects(
      service.write(created.id, "graph.json", '{"nodes":{}}', current.revision),
      /Unsupported graph/,
    );
    await assert.rejects(service.write(created.id, "graph.json", graph(), null), /changed outside/);
  }));

test("relative paths, junction escapes and single-file grants are enforced", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Notes");
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside/secret.md"), "outside");
    await symlink(join(root, "outside"), join(root, "Notes/link"), process.platform === "win32" ? "junction" : "dir");
    for (const path of ["../outside/secret.md", "/secret.md", "C:/secret.md", "link/secret.md", "link/new.md"])
      await assert.rejects(service.write(created.id, path, "overwrite", null));
    const single = await service.register(join(root, "Notes/graph.json"), "file");
    await assert.rejects(service.read(single.id, "other.json"), /neighboring/);
    assert.equal(await readFile(join(root, "outside/secret.md"), "utf8"), "outside");
    await mkdir(join(root, "standalone"));
    await writeFile(join(root, "standalone/secret.md"), "authorized");
    const granted = await service.register(join(root, "standalone/secret.md"), "file");
    await rename(join(root, "standalone"), join(root, "original"));
    await symlink(join(root, "outside"), join(root, "standalone"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(service.read(granted.id, "secret.md"), /directory changed/);
  }));

test("external editor opens the exact original Markdown path, not a copy", async () =>
  fixture(async (service, root, opened) => {
    const created = await service.create(root, "Notes");
    const name = "math 中文 & notes.md";
    await writeFile(join(root, "Notes", name), "# Original");
    await service.openFile(created.id, name);
    assert.deepEqual(opened, [join(root, "Notes", name)]);
    await assert.rejects(service.openFile(created.id, "run.cmd"), /cannot be opened/);
    await assert.rejects(service.openFile(created.id, "missing.md"));
  }));

test("linked style and graph association commit together and reject stale graph revisions", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Notes");
    const before = await service.read(created.id, "graph.json");
    const input = {
      kind: "style",
      expectedRevision: before.revision,
      document: createStyleDocument("node-link", getDefaultChartStyle("node-link")),
    };
    const saved = await service.saveLinked(created.id, "graph.json", input);
    const disk = JSON.parse(await readFile(join(root, "Notes/graph.json"), "utf8"));
    assert.equal(disk.metadata.style, saved.reference);
    assert.equal(JSON.parse(await readFile(join(root, "Notes", saved.path), "utf8")).format, "graph-studio-style");
    assert.equal((await service.read(created.id, "graph.json")).revision, saved.revision);
    await assert.rejects(service.saveLinked(created.id, "graph.json", input), /changed outside/);
  }));

test("interrupted linked writes recover before the service opens", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Notes");
    const old = await service.read(created.id, "graph.json");
    await service.close();
    await writeFile(
      join(root, "state/transaction.json"),
      JSON.stringify({
        id: created.id,
        writes: [
          { path: "note.md", content: "# recovered", before: null },
          { path: "graph.json", content: graph("Recovered"), before: old.revision },
        ],
      }),
    );
    await service.initialize();
    assert.equal((await service.read(created.id, "graph.json")).revision, revision(graph("Recovered")));
    assert.equal(await readFile(join(root, "Notes/note.md"), "utf8"), "# recovered");
  }));

test("API authenticates sessions, rejects other origins, serves bytes, and propagates conflicts", async () =>
  fixture(async (service, root) => {
    const app = createApplication(service, { staticDirectory: root, dialog: async () => null });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      assert.equal((await fetch(origin + "/api/v1/recents")).status, 401);
      const session = await fetch(origin + "/api/v1/session");
      const token = ((await session.json()) as { token: string }).token;
      const headers = {
        Cookie: `graph_studio_session=${token}`,
        "X-Graph-Studio-Token": token,
        Origin: origin,
        "Content-Type": "application/json",
      };
      const request = (path: string, method = "GET", data?: unknown) =>
        fetch(origin + "/api/v1" + path, { method, headers, ...(data ? { body: JSON.stringify(data) } : {}) });
      assert.equal(
        (await fetch(origin + "/api/v1/recents", { headers: { ...headers, Origin: "https://other.example" } })).status,
        403,
      );
      assert.deepEqual(await (await request("/dialogs/directory", "POST", {})).json(), { path: null });
      assert.deepEqual(await (await request("/preferences")).json(), { fileOpenMode: "preview" });
      assert.deepEqual(await (await request("/preferences", "PATCH", { fileOpenMode: "external" })).json(), {
        fileOpenMode: "external",
      });
      assert.equal((await request("/preferences", "PATCH", { fileOpenMode: "invalid" })).status, 400);
      const created = (await (await request("/workspaces", "POST", { parent: root, name: "Notes" })).json()) as {
        id: string;
      };
      const file = await request(`/files/${created.id}/file?path=graph.json`);
      assert.ok(file.headers.get("X-File-Revision"));
      assert.equal(
        (
          await request(`/files/${created.id}/file?path=graph.json`, "PUT", {
            content: graph(),
            expectedRevision: "old",
          })
        ).status,
        409,
      );
      const stream = await request(`/events?locationId=${created.id}`);
      const reader = stream.body!.getReader();
      assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
      service.events.emit("change", { locationId: created.id, path: "graph.json" });
      assert.match(new TextDecoder().decode((await reader.read()).value), /event: change/);
      await reader.cancel();
    } finally {
      app.closeEvents();
      await new Promise<void>((resolve) => {
        app.server.close(() => resolve());
        (app.server as typeof app.server & { closeAllConnections(): void }).closeAllConnections();
      });
    }
  }));

test("service lock prevents competing state writers", async () =>
  fixture(async (service, root) => {
    const second = new LocalService(service.stateDirectory, resolve(root, "examples"));
    await assert.rejects(second.initialize(), /already running/);
    await second.close();
    assert.ok(await readFile(join(service.stateDirectory, "service.lock")));
  }));
import { analyzeReferences } from "../../src/workspace/referenceAdapters";
import { rebaseWorkspaceDocument } from "../../src/app/document/workspaceMutation";
import { createInitialGraphState } from "../../src/app/document/initialState";
import { normalizeDagInput } from "../../src/graph/normalize";

test("file catalog rewrites graph Markdown, manifest, Markdown definitions, HTML and CSS and restores bytes", async () =>
  fixture(async (service, root) => {
    const created = await service.create(root, "Files");
    const base = join(root, "Files");
    await mkdir(join(base, "assets"));
    await mkdir(join(base, "notes"));
    await writeFile(join(base, "assets/chart.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const data = {
      format: "graph-studio",
      version: 3,
      nodes: { a: { define: "![Chart](assets/chart.svg#plot)" } },
      edges: [],
    };
    await writeFile(join(base, "graph.json"), JSON.stringify(data, null, 2));
    await writeFile(
      join(base, "notes/a.md"),
      "![Chart](../assets/chart.svg?theme=light#plot)\n\n[chart]: ../assets/chart.svg\n[See chart][chart]\n\n`![Code](../assets/chart.svg)`",
    );
    await writeFile(join(base, "page.html"), '<img src="assets/chart.svg"><a href="assets/chart.svg#plot">Chart</a>');
    await writeFile(join(base, "theme.css"), '.a { background-image: url("assets/chart.svg#plot"); }');
    const originals = new Map(
      await Promise.all(
        (await service.listFiles(created.id)).map(
          async (path) => [path, await readFile(join(base, path), "utf8")] as const,
        ),
      ),
    );
    let index = await service.fileIndex(created.id);
    assert.equal(index.complete, true);
    assert.equal(index.references.filter((r) => r.target === "assets/chart.svg").length, 7);
    const fileId = index.files.find((f) => f.path === "assets/chart.svg")!.id;
    const plan = await service.planFileOperation(created.id, {
      kind: "rename",
      path: "assets/chart.svg",
      name: "new chart.svg",
    });
    const result = await service.mutateFile(created.id, plan.id);
    assert.equal(
      (await service.fileIndex(created.id)).files.find((f) => f.path === "assets/new chart.svg")!.id,
      fileId,
    );
    assert.match(await readFile(join(base, "notes/a.md"), "utf8"), /new%20chart.svg\?theme=light#plot/);
    assert.match(await readFile(join(base, "notes/a.md"), "utf8"), /`!\[Code\]\(\.\.\/assets\/chart.svg\)`/);
    assert.match(await readFile(join(base, "theme.css"), "utf8"), /new%20chart.svg#plot/);
    await service.mutateFile(created.id, result.undoId, true);
    for (const [path, content] of originals) assert.equal(await readFile(join(base, path), "utf8"), content);
    const deletion = await service.planFileOperation(created.id, { kind: "delete", path: "assets/chart.svg" });
    const deleted = await service.mutateFile(created.id, deletion.id);
    index = await service.fileIndex(created.id);
    assert.equal(index.references.filter((r) => r.target === "assets/chart.svg").length, 0);
    assert.equal(JSON.parse(await readFile(join(base, "graph.json"), "utf8")).nodes.a.define, "");
    assert.match(await readFile(join(base, "theme.css"), "utf8"), /background-image: none/);
    assert.equal(await readFile(join(base, "page.html"), "utf8"), "<a >Chart</a>");
    await service.mutateFile(created.id, deleted.undoId, true);
    for (const [path, content] of originals) assert.equal(await readFile(join(base, path), "utf8"), content);
  }));
test("file mutation rejects stale plans, collisions, malformed files and conflicting undo", async () =>
  fixture(async (service, root) => {
    const opened = await service.create(root, "Files");
    const base = join(root, "Files");
    await writeFile(join(base, "note.md"), "Hello");
    await assert.rejects(
      service.planFileOperation(opened.id, { kind: "rename", path: "note.md", name: "../escape.md" }),
      /valid file name/,
    );
    const plan = await service.planFileOperation(opened.id, { kind: "rename", path: "note.md", name: "renamed.md" });
    await writeFile(join(base, "graph.json"), graph("Changed"));
    await assert.rejects(service.mutateFile(opened.id, plan.id), /changed/);
    const next = await service.planFileOperation(opened.id, { kind: "rename", path: "note.md", name: "renamed.md" });
    const result = await service.mutateFile(opened.id, next.id);
    await writeFile(join(base, "renamed.md"), "New edits");
    await assert.rejects(service.mutateFile(opened.id, result.undoId, true), /changed/);
    await writeFile(join(base, "broken.json"), "{");
    assert.equal((await service.fileIndex(opened.id)).complete, false);
    await assert.rejects(service.planFileOperation(opened.id, { kind: "delete", path: "renamed.md" }), /scanning/);
  }));
test("graph protocol references exclude ordinary strings and rebase unsaved graph history", () => {
  const raw = {
    format: "graph-studio",
    version: 3,
    metadata: { style: "theme.json" },
    nodes: { a: { title: "theme.json", define: "[Theme](theme.json)" } },
    edges: [],
  };
  const analysis = analyzeReferences("graph.json", JSON.stringify(raw));
  assert.equal(analysis.links.length, 2);
  const updated = JSON.parse(analysis.rewrite("theme.json", "new.json"));
  assert.equal(updated.nodes.a.title, "theme.json");
  assert.equal(updated.metadata.style, "new.json");
  const state = createInitialGraphState();
  state.dag = normalizeDagInput(raw);
  state.source = {
    fileName: "graph.json",
    dirty: true,
    fileHandle: null,
    localFile: { locationId: "test", path: "graph.json", revision: "old" },
  };
  state.document.savedDag = state.dag;
  const rebased = rebaseWorkspaceDocument(state, "theme.json", "new.json", "new", "graph.json");
  assert.equal(rebased.source.dirty, true);
  assert.equal(rebased.dag!.metadata!.style, "new.json");
  assert.equal(rebased.document.savedDag!.metadata!.style, "new.json");
});
test("interrupted file mutation restores backups before accepting requests", async () =>
  fixture(async (service, root) => {
    const opened = await service.create(root, "Files");
    const base = join(root, "Files");
    const before = await readFile(join(base, "graph.json"));
    const after = Buffer.from(graph("Interrupted"));
    await writeFile(join(base, "graph.json"), after);
    await mkdir(join(root, "state/file-operations"), { recursive: true });
    await writeFile(
      join(root, "state/file-operations/partial.json"),
      JSON.stringify({
        id: "partial",
        workspace: opened.id,
        state: "pending",
        changes: [{ path: "graph.json", before: before.toString("base64"), after: after.toString("base64") }],
      }),
    );
    await assert.rejects(service.write(opened.id, "new.md", "hello", null), /recovery/);
    await service.close();
    await service.initialize();
    assert.deepEqual(await readFile(join(base, "graph.json")), before);
  }));
test("file transaction events are identifiable and delete never emits an external-change echo", async () =>
  fixture(async (service, root) => {
    const opened = await service.create(root, "Files");
    await writeFile(join(root, "Files/unused.md"), "Unused");
    const changes: any[] = [];
    service.events.on("change", (e) => changes.push(e));
    const plan = await service.planFileOperation(opened.id, { kind: "delete", path: "unused.md" });
    const result = await service.mutateFile(opened.id, plan.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.ok(changes.some((e) => e.transactionId === result.transactionId));
    assert.equal(changes.filter((e) => !e.transactionId).length, 0);
  }));
test("linked document paths remain filesystem paths when renaming to a spaced Unicode name", () => {
  const source = JSON.stringify({
    format: "graph-studio",
    version: 3,
    metadata: { style: "styles/theme.json" },
    nodes: {},
    edges: [],
  });
  const result = JSON.parse(
    analyzeReferences("graph.json", source).rewrite("styles/theme.json", "styles/新 theme.json"),
  );
  assert.equal(result.metadata.style, "styles/新 theme.json");
  const manifest = JSON.stringify({
    format: "graph-studio-workspace",
    version: 1,
    graphs: ["a.json", "b.json", "a.json"],
  });
  assert.deepEqual(JSON.parse(analyzeReferences("graph-studio.workspace.json", manifest).rewrite("a.json")).graphs, [
    "b.json",
  ]);
});
test("a mid-commit write failure rolls back every completed file edit", async () =>
  fixture(async (service, root) => {
    const opened = await service.create(root, "Files"),
      base = join(root, "Files");
    await writeFile(join(base, "note.md"), "[Target](target.md)");
    await writeFile(join(base, "target.md"), "Target");
    const plan = await service.planFileOperation(opened.id, { kind: "delete", path: "target.md" });
    const operations = service.fileOperations as any,
      original = operations.write.bind(operations);
    let writes = 0;
    operations.write = async (...args: any[]) => {
      if (++writes === 2) throw new Error("Injected write failure");
      return original(...args);
    };
    await assert.rejects(service.mutateFile(opened.id, plan.id), /Injected/);
    operations.write = original;
    assert.equal(await readFile(join(base, "note.md"), "utf8"), "[Target](target.md)");
    assert.equal(await readFile(join(base, "target.md"), "utf8"), "Target");
    await operations.requireNoPending();
  }));
test("configuration paths keep literal percent characters and platform case rules", () => {
  const text = JSON.stringify({
    format: "graph-studio",
    version: 3,
    metadata: { style: "100% theme.json" },
    nodes: { a: { define: "[Theme](THEME.json)" } },
    edges: [],
  });
  const scan = analyzeReferences("graph.json", text);
  assert.ok(scan.links.some((link) => link.target === "100% theme.json"));
  assert.equal(JSON.parse(scan.rewrite("100% theme.json", "new theme.json")).metadata.style, "new theme.json");
  assert.match(JSON.parse(scan.rewrite("theme.json", "other.json", true)).nodes.a.define, /other.json/);
  assert.match(JSON.parse(scan.rewrite("theme.json", "other.json", false)).nodes.a.define, /THEME.json/);
});
