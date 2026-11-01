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
    assert.equal(found.activePath, "graph.json");
    await service.write(created.id, "new.json", graph(), null);
    assert.equal((await service.snapshot(created.id)).graphs.length, 4);
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
