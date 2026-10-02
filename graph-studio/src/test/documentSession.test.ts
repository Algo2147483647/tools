import assert from "node:assert/strict";
import { createInitialAiHarnessState, installPlan, syncHarnessRuntime } from "../ai/harness";
import { createPlanFromAiResponse } from "../ai/plans";
import { requestProviderText } from "../ai/providerTransport";
import { applyGraphCommand } from "../graph/commands";
import { DEFAULT_GRAPH_APPEARANCE, sanitizeGraphAppearance } from "../graph/appearance";
import { serializeDag } from "../graph/serialize";
import { getStageAppearance } from "../layout/appearance";
import { buildStageData } from "../layout/stage-layout";
import { graphReducer } from "../state/graphReducer";
import { prepareGraphTransaction } from "../state/graphTransactions";
import { createInitialGraphState, type GraphAppState } from "../state/initialState";
import { getInitialGraphPagePreferences } from "../state/preferences";
import { createDocumentSaver } from "../state/saveDocument";
import { documentIdentity, prepareWorkspace, prepareWorkspaceGraph } from "../workspace/opening";
import { createSampleDag } from "./fixtures";
import { defineSuite, defineTest } from "./harness";

const handle = { name: "graph.json" } as FileSystemFileHandle;
function open(state = createInitialGraphState(), id = "workspace-a") {
  const dag = createSampleDag();
  return graphReducer(state, {
    type: "graphLoaded",
    documentId: documentIdentity(id, "graph.json"),
    dag,
    fileName: "graph.json",
    fileHandle: handle,
    selection: { type: "full" },
    status: "Opened",
  });
}
function add(state: GraphAppState, key: string) {
  const result = applyGraphCommand(state.dag!, { type: "addNode", key });
  return graphReducer(state, prepareGraphTransaction(state, [result], "Add " + key)!);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export const documentSessionSuite = defineSuite("Document lifecycle and architecture regressions", [
  defineTest("initial states and preference defaults do not share mutable state", () => {
    const a = createInitialGraphState(),
      b = createInitialGraphState();
    a.ui.consoleSidebarOpen = true;
    a.history.push({ type: "full" });
    assert.equal(b.ui.consoleSidebarOpen, false);
    assert.deepEqual(b.history, []);
    const preferences = getInitialGraphPagePreferences();
    preferences.aiSettings.model = "changed";
    assert.notEqual(getInitialGraphPagePreferences().aiSettings.model, "changed");
    preferences.layoutMode = "dagre";
    assert.equal(createInitialGraphState(preferences).layout.mode, "dagre");
  }),
  defineTest("same-named documents have separate identities and every opening a new generation", () => {
    const a = open(),
      b = open(a, "workspace-b"),
      reopened = open(b, "workspace-b");
    assert.notEqual(a.document.id, b.document.id);
    assert.equal(b.document.id, reopened.document.id);
    assert.notEqual(b.document.generation, reopened.document.generation);
    assert.notEqual(documentIdentity("a/b", "c"), documentIdentity("a", "b/c"));
  }),
  defineTest("a delayed save marks only its snapshot saved and preserves subsequent edits", async () => {
    let state = add(open(), "E");
    const snapshot = state,
      writing = deferred<void>(),
      started = deferred<void>();
    let written = "";
    const save = createDocumentSaver({
      requestPermission: async () => true,
      write: async (_handle, content) => {
        written = content;
        started.resolve();
        await writing.promise;
      },
    });
    const pending = save(snapshot, "snapshot-json", () => state.document.generation === snapshot.document.generation);
    await started.promise;
    state = add(state, "F");
    writing.resolve();
    const action = await pending;
    assert.ok(action);
    state = graphReducer(state, action);
    assert.equal(written, "snapshot-json");
    assert.equal(state.source.dirty, true);
    assert.equal(state.editHistory.savedRevision, snapshot.editHistory.revision);
    assert.equal(state.document.savedDag, snapshot.dag);
    assert.ok(state.dag!.nodes.F);
    assert.equal(graphReducer(state, { type: "undoRequested" }).source.dirty, false);
  }),
  defineTest("switching before permission resolves prevents a stale file write", async () => {
    const snapshot = open(),
      permission = deferred<boolean>();
    let state = snapshot,
      writes = 0;
    const save = createDocumentSaver({
      requestPermission: () => permission.promise,
      write: async () => {
        writes++;
      },
    });
    const pending = save(snapshot, "json", () => state.document.generation === snapshot.document.generation);
    state = open(state, "workspace-b");
    permission.resolve(true);
    assert.equal(await pending, null);
    assert.equal(writes, 0);
  }),
  defineTest("save completion and failure after switching cannot change the new document", async () => {
    for (const failed of [false, true]) {
      const snapshot = open(),
        writing = deferred<void>(),
        started = deferred<void>();
      let state = snapshot;
      const save = createDocumentSaver({
        requestPermission: async () => true,
        write: async () => {
          started.resolve();
          await writing.promise;
        },
      });
      const pending = save(snapshot, "json", () => state.document.generation === snapshot.document.generation);
      await started.promise;
      state = open(state); // Reopening the same path also invalidates the old session.
      if (failed) writing.reject(new Error("disk"));
      else writing.resolve();
      assert.equal(await pending, null);
      assert.equal(state.ui.status, "Opened");
      assert.equal(
        graphReducer(state, {
          type: "saved",
          generation: snapshot.document.generation,
          revision: 0,
          dag: snapshot.dag!,
          status: "stale",
        }),
        state,
      );
    }
  }),
  defineTest("overlapping saves are serialized and permission denial leaves dirty state intact", async () => {
    const snapshot = add(open(), "E"),
      permission = deferred<boolean>();
    let writes = 0;
    const save = createDocumentSaver({
      requestPermission: () => permission.promise,
      write: async () => {
        writes++;
      },
    });
    const pending = save(snapshot, "old", () => true);
    assert.equal(await save(snapshot, "new", () => true), null);
    permission.resolve(false);
    const action = await pending;
    assert.ok(action);
    assert.equal(graphReducer(snapshot, action).source.dirty, true);
    assert.equal(writes, 0);
  }),
  defineTest("undo then edit uses a new revision and preserves a saved snapshot outside history", () => {
    const saved = add(open(), "E");
    let state = graphReducer(saved, {
      type: "saved",
      generation: saved.document.generation,
      revision: saved.editHistory.revision,
      dag: saved.dag!,
      status: "Saved",
    });
    state = add(graphReducer(state, { type: "undoRequested" }), "F");
    assert.notEqual(state.editHistory.revision, saved.editHistory.revision);
    assert.equal(state.source.dirty, true);
    assert.equal(state.editHistory.redoStack.length, 0);
    for (let i = 0; i < 102; i++) state = add(state, "extra" + i);
    assert.equal(state.editHistory.undoStack.length, 100);
    assert.equal(state.document.savedDag, saved.dag);
  }),
  defineTest("workspace preparation reads an entire candidate before changing application state", async () => {
    const data = JSON.stringify(serializeDag(createSampleDag()));
    const entry = { path: "graph.json", file: new File([data], "graph.json"), handle: null };
    const prepared = await prepareWorkspace({ name: "Workspace", handle: null, files: new Map([[entry.path, entry]]) });
    assert.ok(prepared.dag?.nodes.A);
    assert.equal(prepared.workspace.activePath, entry.path);
    assert.ok((await prepareWorkspaceGraph(prepared.workspace, entry.path)).dag.nodes.A);
    await assert.rejects(prepareWorkspaceGraph(prepared.workspace, "missing.json"), /Graph not found/);
    entry.file = new File(["invalid"], "graph.json");
    await assert.rejects(prepareWorkspaceGraph(prepared.workspace, entry.path));
    assert.ok(prepared.dag!.nodes.A);
  }),
  defineTest("AI plans cannot be applied to a different document or reopened revision", () => {
    const harness = syncHarnessRuntime(createInitialAiHarnessState("review"), {
      graphId: "a",
      graphRevision: "session-a:1",
      mode: "review",
    });
    const plan = createPlanFromAiResponse({
      harness,
      turnId: "turn",
      userMessage: "add",
      response: {
        kind: "inspect",
        answer: "Inspect",
        commands: ["/keys"],
      },
    });
    const installed = installPlan(harness, plan, "turn");
    for (const change of [
      { graphId: "b", graphRevision: "session-a:1" },
      { graphId: "a", graphRevision: "session-b:1" },
    ]) {
      const next = syncHarnessRuntime(installed, { ...change, mode: "review" });
      assert.equal(next.pendingCommandBatch, undefined);
      assert.equal(next.activePlan?.status, "superseded");
      const failed = syncHarnessRuntime(
        { ...installed, activePlan: { ...installed.activePlan!, status: "failed" } },
        { ...change, mode: "review" },
      );
      assert.equal(failed.pendingCommandBatch, undefined);
      assert.equal(failed.activePlan?.status, "superseded");
      const orphaned = syncHarnessRuntime({ ...installed, activePlan: undefined }, { ...change, mode: "review" });
      assert.equal(orphaned.pendingCommandBatch, undefined);
    }
  }),
  defineTest("every AI transport propagates cancellation without making an external request", async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.signal, controller.signal);
      throw new DOMException("Aborted", "AbortError");
    };
    try {
      for (const provider of ["openai-compatible", "deepseek", "anthropic", "gemini", "ollama"] as const) {
        await assert.rejects(
          requestProviderText(
            { ...getInitialGraphPagePreferences().aiSettings, provider },
            "system",
            "user",
            controller.signal,
          ),
          { name: "AbortError" },
        );
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }),
  defineTest("geometry inputs exclude presentation changes but include spacing and Sankey bar width", () => {
    const base = DEFAULT_GRAPH_APPEARANCE;
    const cosmetic = sanitizeGraphAppearance({
      ...base,
      css: ".dag-node { opacity: .8; }",
      cssVars: { ...base.cssVars, "--dag-node-fill": "#123456" },
      display: { ...base.display, sankeyLinkOpacity: 80 },
    });
    assert.deepEqual(getStageAppearance(base), getStageAppearance(cosmetic));
    const spacing = sanitizeGraphAppearance({ ...base, layout: { ...base.layout, rowGap: base.layout.rowGap + 10 } });
    assert.notDeepEqual(getStageAppearance(base), getStageAppearance(spacing));
    const width = sanitizeGraphAppearance({
      ...base,
      display: { ...base.display, sankeyNodeWidth: base.display.sankeyNodeWidth + 2 },
    });
    assert.notDeepEqual(getStageAppearance(base), getStageAppearance(width));
    const dag = createSampleDag();
    assert.deepEqual(
      buildStageData({ dag, selection: { type: "full" }, appearance: getStageAppearance(base) }),
      buildStageData({ dag, selection: { type: "full" }, appearance: getStageAppearance(cosmetic) }),
    );
  }),
]);
