import { useMemo, useReducer, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { normalizeDagInput } from "../src/graph/normalize";
import { projectGraphDocument } from "../src/graph/serialize";
import { readTimelineLayout } from "../src/graph/timelineLayout";
import { graphReducer } from "../src/state/graphReducer";
import { createInitialGraphState } from "../src/state/initialState";
import { getDefaultChartStyle } from "../src/state/chartStyles";
import { getStageAppearance } from "../src/layout/appearance";
import { useTimelineStage } from "../src/controllers/useTimelineStage";
import { useTimelineLayout } from "../src/controllers/useTimelineLayout";
import TimelineArrangePanel from "../src/components/TimelineArrangePanel";
import type { GraphAction } from "../src/state/graphActions";
import type { StageData } from "../src/layout/types";
import "../src/styles/index.css";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
async function waitFor(predicate: () => boolean) {
  const deadline = performance.now() + 20000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for timeline fixture.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const dag = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  metadata: { timeline: { asOf: "2026-01-01" } },
  nodes: {
    a: { title: "Research and discovery", track: "Research", time: { at: "2000" } },
    b: {
      title: "Engineering development and long prototype title",
      track: "Engineering",
      time: { start: "2002", end: "2015" },
    },
    c: { title: "Operations", track: "Operations", time: { at: "2018" } },
    d: { title: "Ongoing monitoring", track: "Operations", time: { start: "2020", end: null } },
    unknown: { title: "Unscheduled work", track: "Research" },
  },
  edges: [
    { id: "ab", source: "a", target: "b", metadata: { timeline: { kind: "sequence" } } },
    { id: "bc", source: "b", target: "c", metadata: { timeline: { kind: "dependency", sourceTime: "2010" } } },
    { id: "cd", source: "c", target: "d", metadata: { timeline: { kind: "sequence" } } },
  ],
});
const style = getDefaultChartStyle("timeline"),
  appearance = getStageAppearance(style.appearance, "timeline");
const settings = {
  provider: "openai-compatible" as const,
  executionMode: "auto-edit" as const,
  baseUrl: "http://127.0.0.1:1/timeline-layout-test",
  model: "fixture-model",
  apiKey: "",
  temperature: 0,
  maxTokens: 1000,
};
const plan = {
  trackOrder: ["Operations", "Engineering", "Research"],
  eventOrder: ["c", "b", "a"],
  edgeRouting: "avoid",
};
const validResponse = JSON.stringify({
  version: 1,
  explanation: "Place operations before engineering and research.",
  plan,
});
let response = validResponse,
  invalidNext = false,
  hold = false,
  requests = 0;
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  if (!String(input).startsWith(`${settings.baseUrl}/`)) return originalFetch(input, init);
  requests++;
  assert(JSON.parse(String(init?.body)).model === "fixture-model", "Wrong configured model.");
  if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (hold)
    await new Promise((_, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }),
    );
  const content = invalidNext ? "invalid JSON" : response;
  invalidNext = false;
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
let fixture: {
  state: ReturnType<typeof createInitialGraphState>;
  dispatch: Dispatch<GraphAction>;
  layout: ReturnType<typeof useTimelineLayout>;
  view: ReturnType<typeof useTimelineStage>;
  setFilter: Dispatch<SetStateAction<boolean>>;
};
function Harness() {
  const [state, dispatch] = useReducer(graphReducer, undefined, () => {
    const loaded = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: `timeline-browser-${crypto.randomUUID()}`,
      dag,
      fileName: "fixture.json",
      selection: { type: "full" },
      status: "Loaded fixture",
    });
    const timeline = graphReducer(loaded, { type: "chartTypeChanged", chartType: "timeline" });
    return graphReducer(timeline, {
      type: "timelineSettingsChanged",
      patch: { ...style.timeline, layout: "tracks", orientation: "vertical", locked: false },
    });
  });
  const [filter, setFilter] = useState(false),
    [open, setOpen] = useState(true);
  const visibleDag = useMemo(
    () => (filter ? projectGraphDocument(state.dag!, new Set(["a", "b"])) : state.dag),
    [state.dag, filter],
  );
  const view = useTimelineStage({
    dag: state.dag,
    visibleDag,
    generation: state.document.generation,
    settings: state.timelineSettings,
    appearance,
    showNodeDetail: false,
    range: null,
  });
  const layout = useTimelineLayout(state, dispatch, settings, {
    stage: view.stage,
    focusedKey: null,
    timelineLayout: { ...view, ready: true },
  });
  fixture = { state, dispatch, layout, view, setFilter };
  return (
    <>
      <button id="timeline-arrange-toggle" onClick={() => setOpen(!open)}>
        Arrange
      </button>
      <TimelineArrangePanel
        appearance={style.appearance}
        open={open}
        onClose={() => setOpen(false)}
        controller={layout}
        settings={state.timelineSettings}
        onSettingsChange={(patch) => dispatch({ type: "timelineSettingsChanged", patch })}
        onReadapt={view.readapt}
        model={settings.model}
      />
    </>
  );
}
const geometry = (stage: StageData) =>
  JSON.stringify({ nodes: stage.nodes, edges: stage.edges, width: stage.stageWidth, height: stage.stageHeight });
function geometryDifference(actual: string, expected: string) {
  const visit = (a: unknown, b: unknown, path: string): string => {
    if (a === b) return "";
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const difference = visit(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          `${path}.${key}`,
        );
        if (difference) return difference;
      }
      return "";
    }
    return `${path}: actual ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`;
  };
  return visit(JSON.parse(actual), JSON.parse(expected), "stage") || "Object serialization order differs.";
}
let algorithmGeometry = "";
async function preview() {
  await fixture.layout.generate("Place Operations, Engineering, then Research; increase branch spacing.");
  await waitFor(() => !!fixture.layout.review && !fixture.layout.busy);
}
const tests: [string, () => Promise<void>][] = [
  [
    "Configured model + real Worker produce a review without editing, even in auto-edit mode",
    async () => {
      algorithmGeometry = geometry(fixture.view.base!);
      const before = fixture.state.dag;
      await preview();
      assert(
        fixture.state.dag === before && fixture.state.editHistory.undoStack.length === 0,
        "Preview edited the document.",
      );
      assert(fixture.layout.review!.after.movedEvents > 0, "AI arrangement did not change geometry.");
      assert(document.querySelector('[role="dialog"][aria-label="Review timeline layout"]'), "Review dialog missing.");
    },
  ],
  [
    "Applied layout matches Worker preview, saves its profile, and supports Undo/Redo",
    async () => {
      const proposed = geometry(fixture.layout.review!.stage);
      assert(fixture.layout.apply(), "Apply rejected a fresh preview.");
      await waitFor(() => fixture.state.editHistory.undoStack.length === 1);
      assert(
        geometry(fixture.view.base!) === proposed,
        `Applied geometry differs from preview: ${geometryDifference(geometry(fixture.view.base!), proposed)}`,
      );
      fixture.dispatch({ type: "undoRequested" });
      await waitFor(() => fixture.state.editHistory.undoStack.length === 0);
      assert(geometry(fixture.view.base!) === algorithmGeometry, "Undo did not restore Algorithm.");
      fixture.dispatch({ type: "redoRequested" });
      await waitFor(() => fixture.layout.mode === "ai");
      assert(geometry(fixture.view.base!) === proposed, "Redo changed the proposal.");
    },
  ],
  [
    "Algorithm/AI buttons switch actual geometry and reuse the saved plan without model calls",
    async () => {
      const count = requests,
        saved = geometry(fixture.view.base!);
      const button = (label: string) =>
        [...document.querySelectorAll<HTMLButtonElement>(".subgraph-tabs button")].find(
          (item) => item.textContent === label,
        )!;
      button("Algorithm").click();
      await waitFor(() => fixture.layout.mode === "algorithm");
      assert(geometry(fixture.view.base!) === algorithmGeometry, "Algorithm geometry was not restored.");
      assert(readTimelineLayout(fixture.state.dag).data.plan, "Switch discarded the AI plan.");
      button("AI").click();
      await waitFor(() => fixture.layout.mode === "ai");
      assert(geometry(fixture.view.base!) === saved && requests === count, "Switch did not reuse the saved plan.");
      assert(button("AI").getAttribute("aria-pressed") === "true", "Mode button is out of sync.");
    },
  ],
  [
    "Horizontal preview matches committed geometry and retains ongoing dates and interior anchors",
    async () => {
      fixture.dispatch({
        type: "timelineSettingsChanged",
        patch: { orientation: "horizontal", intervalTitle: "inside" },
      });
      await waitFor(() => fixture.view.stage?.timeline?.orientation === "horizontal");
      await preview();
      const proposed = geometry(fixture.layout.review!.stage),
        before = fixture.state.dag;
      assert(fixture.layout.apply(), "Horizontal apply failed.");
      await waitFor(() => !fixture.layout.review);
      assert(
        geometry(fixture.view.base!) === proposed,
        `Horizontal preview mismatch: ${geometryDifference(geometry(fixture.view.base!), proposed)}`,
      );
      assert(JSON.stringify(fixture.state.dag!.nodes) === JSON.stringify(before!.nodes), "Timeline data changed.");
    },
  ],
  [
    "Unknown IDs are rejected without a document edit",
    async () => {
      const before = fixture.state.dag;
      response = JSON.stringify({ version: 1, explanation: "Invalid", plan: { eventOrder: ["missing"] } });
      await fixture.layout.generate("Arrange");
      await waitFor(() => !fixture.layout.busy);
      assert(!fixture.layout.review && fixture.state.dag === before, "Invalid plan was accepted.");
      assert(fixture.layout.message.includes("Unknown timeline event"), "Validation error missing.");
      response = validResponse;
    },
  ],
  [
    "Invalid JSON gets exactly one repair request",
    async () => {
      invalidNext = true;
      const count = requests;
      await preview();
      assert(requests === count + 2, "Unexpected repair count.");
      fixture.layout.dismiss();
      await waitFor(() => !fixture.layout.review);
    },
  ],
  [
    "Cancellation aborts a pending provider request without editing",
    async () => {
      const before = fixture.state.dag,
        count = requests;
      hold = true;
      const pending = fixture.layout.generate("Arrange");
      await waitFor(() => requests > count && fixture.layout.busy);
      fixture.layout.cancel();
      await pending;
      hold = false;
      await waitFor(() => !fixture.layout.busy);
      assert(fixture.state.dag === before && !fixture.layout.review, "Cancel changed the graph.");
      assert(fixture.layout.message.includes("cancelled"), "Cancel feedback missing.");
    },
  ],
  [
    "Filter changes cancel in-flight work and permanently invalidate existing previews",
    async () => {
      hold = true;
      const count = requests;
      const pending = fixture.layout.generate("Arrange");
      await waitFor(() => requests > count && fixture.layout.busy);
      fixture.setFilter(true);
      await pending;
      hold = false;
      await waitFor(() => !fixture.layout.busy);
      fixture.setFilter(false);
      await waitFor(() => fixture.view.stage?.nodes.length === 5);
      await preview();
      fixture.setFilter(true);
      await waitFor(() => fixture.layout.stale);
      assert(!fixture.layout.apply(), "Stale preview applied.");
      fixture.setFilter(false);
      await waitFor(() => fixture.view.stage?.nodes.length === 5);
      assert(fixture.layout.stale && !fixture.layout.apply(), "Returning to the old filter revived the preview.");
      fixture.layout.dismiss();
    },
  ],
  [
    "AI can rearrange channels while preserving a locked time axis",
    async () => {
      fixture.dispatch({ type: "timelineSettingsChanged", patch: { locked: true } });
      await waitFor(() => fixture.state.timelineSettings.locked);
      const axis = JSON.stringify(fixture.view.base!.timeline!.axisMap);
      await preview();
      assert(JSON.stringify(fixture.layout.review!.stage.timeline!.axisMap) === axis, "Locked time axis changed.");
      fixture.layout.dismiss();
      fixture.dispatch({ type: "timelineSettingsChanged", patch: { locked: false } });
      await waitFor(() => !fixture.state.timelineSettings.locked);
    },
  ],
];
createRoot(document.getElementById("fixture")!).render(<Harness />);
document.getElementById("run-checks")!.addEventListener("click", async () => {
  const button = document.getElementById("run-checks") as HTMLButtonElement,
    results = document.getElementById("results")!;
  button.disabled = true;
  results.textContent = "Running…\n";
  let passed = 0,
    failed = 0;
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
  results.textContent += `\n${passed} passed, ${failed} failed`;
});
