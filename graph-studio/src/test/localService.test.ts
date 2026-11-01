import assert from "node:assert/strict";
import { localEntry, readLocalFile, writeLocalFile, LocalApiError, workspaceFromSnapshot } from "../workspace/localApi";
import { graphReducer } from "../app/document/graphReducer";
import { createInitialGraphState } from "../app/document/initialState";
import { normalizeDagInput } from "../graph/normalize";
import { defineSuite, defineTest } from "./harness";

export const localServiceSuite = defineSuite("Local service frontend integration", [
  defineTest("file references encode paths and retain the loaded revision after conflicts", async () => {
    const previous = globalThis.fetch;
    let conflict = true;
    let submitted: any;
    globalThis.fetch = (async (input, options) => {
      if (String(input).endsWith("/session")) return new Response(JSON.stringify({ token: "test" }));
      assert.ok(String(input).includes("path=notes%2FA%20%26%20B.md"));
      if (options?.method === "PUT") {
        submitted = JSON.parse(String(options.body));
        return conflict
          ? new Response(JSON.stringify({ error: { code: "FILE_CHANGED", message: "External edit" } }), { status: 409 })
          : new Response(JSON.stringify({ revision: "new" }));
      }
      return new Response("# Original", { headers: { "X-File-Revision": "old", "Content-Type": "text/markdown" } });
    }) as typeof fetch;
    try {
      const entry = localEntry("workspace", "notes/A & B.md");
      assert.equal(await (await readLocalFile(entry.local!)).text(), "# Original");
      await assert.rejects(
        writeLocalFile(entry.local!, "# Changed"),
        (error) => error instanceof LocalApiError && error.code === "FILE_CHANGED",
      );
      assert.equal(entry.local!.revision, "old");
      assert.equal(submitted.expectedRevision, "old");
      conflict = false;
      await writeLocalFile(entry.local!, "# Changed");
      assert.equal(entry.local!.revision, "new");
    } finally {
      globalThis.fetch = previous;
    }
  }),
  defineTest("backend snapshots expose files without browser handles", () => {
    const folder = workspaceFromSnapshot({
      id: "workspace",
      kind: "workspace",
      name: "Notes",
      rootName: "Notes",
      location: "D:/Notes",
      files: ["graph.json"],
      graphs: [],
      manifest: null,
      notices: [],
      activePath: null,
    });
    assert.equal(folder.localId, "workspace");
    assert.equal(folder.handle, null);
    assert.deepEqual(folder.files.get("graph.json")!.local, { locationId: "workspace", path: "graph.json" });
  }),
  defineTest("persisted style associations preserve unsaved node edits and record the disk baseline", () => {
    const disk = normalizeDagInput({ format: "graph-studio", version: 3, nodes: { a: { title: "Disk" } }, edges: [] });
    const state = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: "test",
      dag: disk,
      fileName: "graph.json",
      selection: { type: "full" },
      status: "",
    });
    const persistedDag = { ...disk, metadata: { style: "appearance.json" } };
    const clean = graphReducer(state, {
      type: "styleReferenceBound",
      generation: state.document.generation,
      reference: "appearance.json",
      persistedDag,
    });
    assert.equal(clean.source.dirty, false);
    const edited = {
      ...state,
      dag: { ...disk, nodes: { ...disk.nodes, a: { ...disk.nodes.a, title: "Unsaved" } } },
      source: { ...state.source, dirty: true },
    };
    const bound = graphReducer(edited, {
      type: "styleReferenceBound",
      generation: state.document.generation,
      reference: "appearance.json",
      persistedDag,
    });
    assert.equal(bound.dag!.nodes.a.title, "Unsaved");
    assert.equal(bound.document.savedDag!.nodes.a.title, "Disk");
    assert.equal(bound.source.dirty, true);
    assert.equal(bound.dag!.metadata!.style, "appearance.json");
  }),
]);
