import { useMemo, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { normalizeDagInput } from "../src/graph/normalize";
import { graphReducer } from "../src/state/graphReducer";
import { createInitialGraphState } from "../src/state/initialState";
import { getDefaultChartStyle } from "../src/state/chartStyles";
import { getStageAppearance } from "../src/layout/appearance";
import { defaultLayoutIntent, readLayoutData } from "../src/layout/compound-layout-plan";
import { useCompoundStage } from "../src/controllers/useCompoundStage";
import { useCompoundLayoutPlan } from "../src/controllers/useCompoundLayoutPlan";
import { useAiController } from "../src/controllers/useAiController";
import type { AiExecutionMode, AiResponse } from "../src/ai/types";
import type { ConsoleController } from "../src/controllers/useConsoleController";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function waitFor(predicate: () => boolean) {
  const deadline = performance.now() + 20000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for the layout fixture.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const dag = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  nodes: { a: { title: "Start" }, b: { title: "Process" }, c: { title: "Finish" } },
  edges: [
    { id: "ab", source: "a", target: "b", value: "request" },
    { id: "bc", source: "b", target: "c", value: "response" },
  ],
});
const style = getDefaultChartStyle("compound");
const appearance = getStageAppearance(style.appearance, "compound");
const messages: string[] = [];
const testConsole = {
  entries: [],
  contextNodeKey: null,
  appendMessage: (_tone: string, text: string) => {
    messages.push(text);
  },
  recordInput: () => {},
  upsertReview: () => {},
  setReviewStatus: () => {},
  runSource: () => {
    throw new Error("A layout response must not execute graph commands.");
  },
} as Pick<
  ConsoleController,
  "entries" | "contextNodeKey" | "appendMessage" | "recordInput" | "upsertReview" | "setReviewStatus" | "runSource"
>;
let fixture: ReturnType<typeof Harness> extends null
  ? {
      state: ReturnType<typeof createInitialGraphState>;
      dispatch: React.Dispatch<import("../src/state/graphActions").GraphAction>;
      layout: ReturnType<typeof useCompoundLayoutPlan>;
      ai: ReturnType<typeof useAiController>;
      setFilter: React.Dispatch<React.SetStateAction<string>>;
      setMode: React.Dispatch<React.SetStateAction<AiExecutionMode>>;
    }
  : never;
function Harness(): null {
  const [state, dispatch] = useReducer(graphReducer, undefined, () => {
    const loaded = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: `browser-layout-${crypto.randomUUID()}`,
      dag,
      fileName: "fixture.json",
      selection: { type: "full" },
      status: "Loaded fixture.",
    });
    return graphReducer(loaded, { type: "chartTypeChanged", chartType: "compound" });
  });
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<AiExecutionMode>("review");
  const input = useMemo(
    () => ({
      dag: state.dag!,
      view: { focusGroupId: null, collapsedGroupIds: [] },
      selectedType: filter,
      appearance,
      showNodeDetail: false,
      alignNodeWidthsToMax: true,
      showEdgeLabels: true,
    }),
    [state.dag, filter],
  );
  const stage = useCompoundStage(input);
  const layout = useCompoundLayoutPlan(state, dispatch, {
    stage: stage.stage,
    focusedKey: null,
    compound: { view: input.view },
    compoundLayout: stage,
  });
  const settings = useMemo(
    () => ({
      provider: "openai-compatible" as const,
      executionMode: mode,
      baseUrl: "http://127.0.0.1:1/compound-layout-test",
      model: "fixture",
      apiKey: "",
      temperature: 0,
      maxTokens: 1000,
    }),
    [mode],
  );
  const ai = useAiController({
    state,
    dispatch,
    appearance: style.appearance,
    settings,
    consoleController: testConsole,
    compoundLayout: layout,
  });
  fixture = { state, dispatch, layout, ai, setFilter, setMode };
  return null;
}
const intent = {
  ...defaultLayoutIntent(),
  constraints: [{ type: "direction" as const, scopeId: null, value: "DOWN" as const, strength: "soft" as const }],
};
let response: AiResponse = {
  kind: "propose_layout",
  layoutProtocolVersion: 1,
  answer: "Arrange the flow vertically.",
  intent,
};
const originalFetch = window.fetch;

const tests: [string, () => Promise<void>][] = [
  [
    "Worker candidates apply as one undoable document edit",
    async () => {
      await fixture.layout.propose(intent);
      await waitFor(() => !!fixture.layout.review?.result.candidates.length);
      assert(fixture.state.editHistory.undoStack.length === 0, "Preview changed history.");
      assert(fixture.layout.apply(), "Apply failed.");
      await waitFor(() => fixture.state.editHistory.undoStack.length === 1 && fixture.layout.ready);
      assert(!!readLayoutData(fixture.state.dag!).data.accepted, "Accepted snapshot was not saved.");
      fixture.dispatch({ type: "undoRequested" });
      await waitFor(() => fixture.state.editHistory.undoStack.length === 0 && fixture.layout.ready);
      assert(!readLayoutData(fixture.state.dag!).data.accepted, "Undo retained the applied layout.");
      fixture.dispatch({ type: "redoRequested" });
      await waitFor(() => fixture.state.editHistory.undoStack.length === 1 && fixture.layout.ready);
    },
  ],
  [
    "View changes permanently invalidate a preview",
    async () => {
      await fixture.layout.propose(intent);
      await waitFor(() => !!fixture.layout.review && !fixture.layout.stale);
      const oldKey = fixture.layout.key;
      fixture.setFilter("missing-fixture-type");
      await waitFor(() => fixture.layout.key !== oldKey);
      assert(!fixture.layout.apply(), "A stale preview was accepted.");
      fixture.setFilter("");
      await waitFor(() => fixture.layout.ready && fixture.layout.stale);
      assert(!fixture.layout.apply(), "Returning to a view revived a stale preview.");
    },
  ],
  [
    "Cancellation terminates the active worker without committing",
    async () => {
      const before = fixture.state.dag;
      const request = fixture.layout.propose(intent).catch((error) => error as Error);
      fixture.layout.cancel();
      const outcome = await request;
      assert(outcome instanceof Error && outcome.message.includes("cancelled"), "Cancelled work did not reject.");
      assert(fixture.state.dag === before, "Cancellation modified the graph.");
    },
  ],
  [
    "AI review mode generates geometry without editing the graph",
    async () => {
      fixture.layout.dismiss();
      await waitFor(() => fixture.layout.review === null && !fixture.ai.busy);
      const before = fixture.state.dag;
      await fixture.ai.request("Arrange this graph from top to bottom.");
      await waitFor(() => !fixture.ai.busy && !!fixture.layout.review?.result.candidates.length);
      assert(fixture.state.dag === before, "Review mode applied a layout automatically.");
      assert(fixture.layout.review?.status === "ready", "AI did not produce a ready geometry plan.");
    },
  ],
  [
    "AI auto-edit applies a validated strict layout",
    async () => {
      fixture.setMode("auto-edit");
      await waitFor(() => fixture.ai.harness.mode === "auto-edit" && !fixture.ai.busy);
      const before = fixture.state.editHistory.undoStack.length;
      await fixture.ai.request("Arrange the graph vertically and apply it.");
      await waitFor(() => !fixture.ai.busy && fixture.state.editHistory.undoStack.length === before + 1);
      assert(fixture.layout.review?.status === "applied", "Auto-edit left the plan pending.");
    },
  ],
  [
    "AI malformed geometry is rejected without changing the document",
    async () => {
      const before = fixture.state.dag;
      response = {
        kind: "propose_layout",
        layoutProtocolVersion: 1,
        answer: "Invalid",
        intent: { ...intent, constraints: [{ type: "pin", nodeId: "missing", space: "canvas", strength: "hard" }] },
      };
      await fixture.ai.request("Lock a missing node.");
      await waitFor(() => !fixture.ai.busy);
      assert(fixture.state.dag === before, "An invalid ID changed the graph.");
      assert(
        messages.some((message) => message.includes("outside the layout scope")),
        "Missing diagnostic.",
      );
    },
  ],
];

document.getElementById("run-checks")!.addEventListener("click", async () => {
  const button = document.getElementById("run-checks") as HTMLButtonElement;
  const results = document.getElementById("results")!;
  button.disabled = true;
  results.textContent = "Running…\n";
  window.fetch = async (input, init) => {
    if (String(input).startsWith("http://127.0.0.1:1/compound-layout-test/")) {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
  const root = createRoot(document.getElementById("fixture")!);
  let passed = 0,
    failed = 0;
  try {
    root.render(<Harness />);
    await waitFor(() => !!fixture?.layout.ready);
    for (const [name, test] of tests) {
      try {
        await test();
        passed++;
        results.textContent += `PASS ${name}\n`;
      } catch (error) {
        failed++;
        results.textContent += `FAIL ${name}: ${error instanceof Error ? error.message : error}\n`;
      }
    }
  } catch (error) {
    failed++;
    results.textContent += `FAIL setup: ${String(error)}\n`;
  } finally {
    root.unmount();
    window.fetch = originalFetch;
    button.disabled = false;
    results.textContent += `\n${passed} passed, ${failed} failed`;
  }
});
