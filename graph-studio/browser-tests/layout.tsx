import { useEffect, useMemo, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { graphReducer } from "../src/app/document/graphReducer";
import { createInitialGraphState } from "../src/app/document/initialState";
import { useCompoundStage } from "../src/app/layout/useCompoundStage";
import { useCompoundLayoutPlan } from "../src/app/layout/useCompoundLayoutPlan";
import { normalizeDagInput } from "../src/graph/normalize";
import { getStageAppearance } from "../src/layout/shared/appearance";
import { getDefaultChartStyle } from "../src/schema/appearance/styles";
import type { AiSettings } from "../src/ai/types";
import CompoundLayoutPanel from "../src/components/compound/LayoutPanel";

// Isolated test page: count real Worker solves and keep all model requests local.
let solves = 0,
  requests = 0;
const budgets: number[] = [];
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options);
    solves++;
  }
};
let mode: "valid" | "invalid" | "delayed" = "valid";
let release: (() => void) | undefined;
const valid = { version: 1, preferences: { direction: "DOWN" }, constraints: [] };
window.fetch = async (_url, init) => {
  requests++;
  const body = JSON.parse(String(init?.body));
  check(body.thinking?.type === "disabled", "DeepSeek layout must disable thinking");
  budgets.push(body.max_tokens);
  if (mode === "delayed")
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  return new Response(
    JSON.stringify({
      id: "local-fixture",
      choices: [
        {
          finish_reason: requests === 1 ? "length" : "stop",
          message: {
            content: JSON.stringify(mode === "invalid" ? { commands: ["/rm a"] } : valid),
          },
        },
      ],
    }),
  );
};
const settings: AiSettings = {
  provider: "deepseek",
  baseUrl: "https://fixture.invalid",
  apiKey: "",
  model: "deepseek-v4-flash",
  temperature: 0,
  maxTokens: 900,
  executionMode: "ask",
};
const graph = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  nodes: { g: {}, a: {}, b: {} },
  edges: [{ id: "ab", source: "a", target: "b" }],
  hierarchy_edges: [
    { id: "ga", source: "g", target: "a" },
    { id: "gb", source: "g", target: "b" },
  ],
});
const appearance = getStageAppearance(getDefaultChartStyle("compound").appearance, "compound");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test: () => boolean) {
  const end = Date.now() + 10000;
  while (!test()) {
    if (Date.now() > end) throw new Error("Timed out");
    await delay(20);
  }
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function Fixture() {
  const [state, dispatch] = useReducer(graphReducer, undefined, () =>
    graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      dag: graph,
      documentId: "fixture",
      fileName: "fixture.json",
      selection: { type: "full" },
      status: "Loaded",
    }),
  );
  const input = useMemo(
    () => ({
      dag: state.dag!,
      view: { focusGroupId: null, collapsedGroupIds: [] },
      layout: state.layoutDocument.data.charts.compound,
      appearance,
      showNodeDetail: false,
      alignNodeWidthsToMax: true,
    }),
    [state.dag, state.layoutDocument.data.charts.compound],
  );
  const layout = useCompoundStage(input);
  const controller = useCompoundLayoutPlan(
    state,
    dispatch,
    { stage: layout.stage, focusedKey: null, compoundLayout: layout },
    settings,
  );
  const [results, setResults] = useState<string[]>([]);
  current = { state, layout, controller, dispatch };
  useEffect(() => {
    const pass = (message: string) => setResults((old) => [...old, `PASS ${message}`]);
    void (async () => {
      await until(() => current!.controller.ready);
      const before = solves,
        dag = current!.state.dag;
      await current!.controller.generate("Arrange down");
      await until(
        () => current!.controller.ready && current!.state.layoutDocument.data.charts.compound.direction === "DOWN",
      );
      await delay(350);
      check(solves === before + 1, `Expected one solve, got ${solves - before}`);
      check(current!.state.dag === dag && !current!.state.source.dirty, "Layout changed graph data");
      check(requests === 2 && budgets[0] === 4096 && budgets[1] === 8192, "Truncation must change the retry budget");
      pass("DeepSeek disables thinking and recovers from truncation with a larger independent budget");
      pass("one AI declaration installs one Worker result without recomputation or graph mutation");
      const stage = current!.layout.stage,
        count = solves,
        calls = requests;
      mode = "invalid";
      await current!.controller.generate("invalid");
      await delay(50);
      check(
        requests === calls + 2 && solves === count && current!.layout.stage === stage,
        "Invalid response changed the live stage",
      );
      pass("two invalid responses preserve the current stage and never invoke the solver");
      mode = "delayed";
      const pending = current!.controller.generate("slow");
      await until(() => !!release);
      current!.controller.change({ direction: "RIGHT" });
      await until(
        () => current!.controller.ready && current!.state.layoutDocument.data.charts.compound.direction === "RIGHT",
      );
      release!();
      await pending;
      await delay(100);
      check(current!.state.layoutDocument.data.charts.compound.direction === "RIGHT", "Stale request applied");
      check(!current!.controller.busy, "Cancellation left the controller busy");
      pass("input changes cancel in-flight requests and ignore late responses");
      const oldSolves = solves;
      current!.dispatch({ type: "undoRequested" });
      await until(
        () => current!.controller.ready && current!.state.layoutDocument.data.charts.compound.direction === "DOWN",
      );
      check(solves === oldSolves + 1, "Undo must recompute declarations");
      pass("undo restores declarations and computes fresh geometry");
      current!.controller.change({
        portMode: "midpoints",
        constraints: [
          { type: "direction", scopeId: "g", value: "DOWN", strength: "soft" },
          { type: "flow-order", scopeId: "g", nodeIds: ["b", "a"], strength: "soft" },
        ],
      });
      await until(
        () => current!.controller.ready && current!.state.layoutDocument.data.charts.compound.portMode === "midpoints",
      );
      const orderedStage = current!.layout.stage!;
      check(orderedStage.nodeMap.b.y < orderedStage.nodeMap.a.y, "AI flow order was not applied");
      const n = current!.layout.stage!;
      for (const edge of n.edges)
        for (const [id, p] of [
          [edge.source, edge.points![0]],
          [edge.target, edge.points!.at(-1)!],
        ] as const) {
          const b = n.compoundLayout!.baseline.boxes[id];
          const centers = [
            [b.x, b.y + b.height / 2],
            [b.x + b.width, b.y + b.height / 2],
            [b.x + b.width / 2, b.y],
            [b.x + b.width / 2, b.y + b.height],
          ];
          check(
            centers.some(([x, y]) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01),
            "Endpoint is not a side midpoint",
          );
        }
      pass("port mode changes recompute routes with endpoints restricted to side midpoints");
      const automaticSolves = solves,
        automaticCalls = requests;
      current!.controller.change({ method: "automatic" });
      await until(
        () => current!.controller.ready && current!.state.layoutDocument.data.charts.compound.method === "automatic",
      );
      check(solves === automaticSolves + 1 && requests === automaticCalls, "Automatic must run a fresh local solve");
      const automatic = current!.state.layoutDocument.data.charts.compound;
      check(
        automatic.constraints.length === 0 && automatic.direction === "AUTO" && automatic.portMode === "midpoints",
        "Automatic retained AI decisions or reset port settings",
      );
      check(
        JSON.stringify(current!.layout.stage!.nodes) !== JSON.stringify(orderedStage.nodes),
        "Automatic did not update geometry",
      );
      pass("Automatic clears the AI plan, restores automatic direction and updates geometry without a model call");
      setResults((old) => [...old, "ALL PASSED"]);
    })().catch((error) => setResults((old) => [...old, `FAIL ${String(error)}`]));
  }, []);
  return (
    <main>
      <h1>Layout lifecycle regression</h1>
      <ul>
        {results.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p>{controller.message}</p>
      <CompoundLayoutPanel controller={controller} model={settings.model} />
    </main>
  );
}
let current:
  | {
      state: ReturnType<typeof createInitialGraphState>;
      layout: ReturnType<typeof useCompoundStage>;
      controller: ReturnType<typeof useCompoundLayoutPlan>;
      dispatch: React.Dispatch<Parameters<typeof graphReducer>[1]>;
    }
  | undefined;
createRoot(document.getElementById("root")!).render(<Fixture />);
