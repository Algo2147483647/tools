import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AiSettings } from "../ai/types";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { emptyLayoutData } from "../graph/compound/layoutData";
import { buildCompoundStage } from "../layout/compound/layout";
import { getStageAppearance } from "../layout/shared/appearance";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { defaultLayoutDocument, parseLayoutDocument, repairLayoutDocument } from "../schema/layoutProtocol";
import { compoundAiContext } from "../layout/compound/ai/request";
import { applyCompoundAiPlan, parseCompoundAiPlan } from "../layout/compound/ai/protocol";
import { runCompoundAiLayout } from "../layout/compound/ai/workflow";
import { compoundExecutionFeedback } from "../layout/compound/ai/workflow";
import { compareLayoutMetrics } from "../layout/compound/layout-quality";
import { assertCompoundGeometry } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

const settings: AiSettings = {
  provider: "openai-compatible",
  baseUrl: "https://fixture.invalid",
  apiKey: "",
  model: "fixture",
  temperature: 0,
  maxTokens: 900,
  executionMode: "ask",
};
const appearance = getStageAppearance(getDefaultChartStyle("compound").appearance, "compound");
const view = { focusGroupId: null, collapsedGroupIds: [] as string[] };
const graph = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: { g: {}, a: {}, b: {}, c: {} },
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ],
    hierarchy_edges: ["a", "b", "c"].map((target) => ({ id: `h-${target}`, source: "g", target })),
  });
const fixture = async () => {
  const input = { dag: graph(), view, appearance, showNodeDetail: false, alignNodeWidthsToMax: true };
  const stage = await buildCompoundStage(input);
  return { input, stage, problem: stage.compoundLayout! };
};
const response = (constraints: unknown[] = []) => ({ version: 1, preferences: { direction: "AUTO" }, constraints });
async function withModel(replies: unknown[], run: (requests: any[]) => Promise<void>) {
  const original = globalThis.fetch;
  const requests: any[] = [];
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    requests.push(JSON.parse(init.body));
    assert.ok(requests.length <= replies.length, "Unexpected model call beyond the bounded fixture");
    return new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(replies[requests.length - 1]) } }],
      }),
    );
  }) as typeof fetch;
  try {
    await run(requests);
  } finally {
    globalThis.fetch = original;
  }
}

export const compoundAiHarnessSuite = defineSuite("Compound AI planning harness", [
  defineTest("minimum canvas whitespace does not trigger a model refinement", async () => {
    const { problem, stage } = await fixture();
    const widened = { ...stage, compoundLayout: { ...problem, baseline: { ...problem.baseline, height: 10000 } } };
    assert.equal(compoundExecutionFeedback(problem, widened).needsRevision, false);
  }),
  defineTest("readability does not sacrifice route length for a tiny overlap improvement", async () => {
    const { stage } = await fixture();
    const normal = { ...stage.layoutQuality!.metrics, sharedLength: 20 };
    const detour = { ...normal, sharedLength: 19, length: normal.length + 5000 };
    assert.ok(compareLayoutMetrics(detour, normal, "readability") > 0);
  }),
  defineTest("midpoint mode reaches the solver and persists independently of graph data", async () => {
    const { input } = await fixture();
    const layout = { ...emptyLayoutData(), portMode: "midpoints" as const };
    const stage = await buildCompoundStage({ ...input, layout });
    const boxes = stage.compoundLayout!.baseline.boxes;
    for (const edge of stage.edges)
      for (const [id, p] of [
        [edge.source, edge.points![0]],
        [edge.target, edge.points!.at(-1)!],
      ] as const) {
        const b = boxes[id];
        const centers = [
          [b.x, b.y + b.height / 2],
          [b.x + b.width, b.y + b.height / 2],
          [b.x + b.width / 2, b.y],
          [b.x + b.width / 2, b.y + b.height],
        ];
        assert.ok(centers.some(([x, y]) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01));
      }
    const doc = defaultLayoutDocument();
    doc.charts.compound = layout;
    assert.equal(parseLayoutDocument(doc).charts.compound.portMode, "midpoints");
    assert.equal(
      parseLayoutDocument({ format: "graph-studio-layout", version: 1, charts: { compound: {} } }).charts.compound
        .portMode,
      "distributed",
    );
    assertCompoundGeometry(input.dag, stage, view);
  }),
  defineTest("group direction and sibling flow order change actual geometry without editing graph", async () => {
    const { input, problem } = await fixture();
    const supplied = compoundAiContext(problem);
    const plan = parseCompoundAiPlan(
      response([
        { type: "direction", scopeId: "g", value: "DOWN" },
        { type: "flow-order", scopeId: "g", nodeIds: ["c", "b", "a"] },
      ]),
      { direction: "AUTO", ...supplied },
    );
    const data = applyCompoundAiPlan(emptyLayoutData(), plan, null, supplied);
    const stage = await buildCompoundStage({ ...input, layout: data });
    assert.ok(stage.nodeMap.c.y < stage.nodeMap.b.y && stage.nodeMap.b.y < stage.nodeMap.a.y);
    assert.deepEqual(serializeDag(input.dag), serializeDag(graph()));
    assertCompoundGeometry(input.dag, stage, view);
    assert.equal(stage.warnings.length, 0);
    const document = defaultLayoutDocument();
    document.charts.compound = data;
    assert.deepEqual(parseLayoutDocument(document), document);
  }),
  defineTest(
    "structural plans reject hidden scopes, non-siblings, duplicate IDs and conflicting root directions",
    async () => {
      const { problem } = await fixture();
      const supplied = compoundAiContext(problem);
      for (const constraint of [
        { type: "direction", scopeId: "missing", value: "DOWN" },
        { type: "flow-order", scopeId: "g", nodeIds: ["g", "a", "b"] },
        { type: "flow-order", scopeId: "g", nodeIds: ["a", "a", "b"] },
        { type: "flow-order", scopeId: "g", nodeIds: ["a", "b"] },
        { type: "direction", scopeId: null, value: "DOWN" },
      ])
        assert.throws(() => parseCompoundAiPlan(response([constraint]), { direction: "AUTO", ...supplied }));
    },
  ),
  defineTest("replacement retracts visible hints while preserving unsupplied scopes and edges", async () => {
    const { problem } = await fixture();
    const current = emptyLayoutData();
    current.constraints = [
      { type: "prefer-outer-route", edgeId: "ab", strength: "soft" },
      { type: "direction", scopeId: "g", value: "DOWN", strength: "soft" },
      { type: "prefer-outer-route", edgeId: "hidden-edge", strength: "soft" },
      { type: "direction", scopeId: "hidden-group", value: "RIGHT", strength: "soft" },
    ];
    const next = applyCompoundAiPlan(current, { direction: "AUTO", constraints: [] }, null, compoundAiContext(problem));
    assert.deepEqual(next.constraints, current.constraints.slice(2));
  }),
  defineTest("flow order survives rename and drops removed or reparented siblings", () => {
    const layout = defaultLayoutDocument();
    layout.charts.compound.constraints = [
      { type: "flow-order", scopeId: "g", nodeIds: ["a", "b", "c"], strength: "soft" },
    ];
    const dag = serializeDag(graph());
    dag.nodes.renamed = dag.nodes.a;
    delete dag.nodes.a;
    dag.hierarchy_edges!.find((e) => e.target === "a")!.target = "renamed";
    const repaired = repairLayoutDocument(layout, dag, [{ from: "a", to: "renamed" }]);
    assert.deepEqual(repaired.charts.compound.constraints[0], {
      ...layout.charts.compound.constraints[0],
      nodeIds: ["renamed", "b", "c"],
    });
    dag.hierarchy_edges = dag.hierarchy_edges!.filter((e) => e.target !== "c");
    const final = repairLayoutDocument(repaired, dag).charts.compound.constraints[0];
    assert.equal(final.type, "flow-order");
    if (final.type === "flow-order") assert.deepEqual(final.nodeIds, ["renamed", "b"]);
  }),
  defineTest("Commerce all-outer plan stays close to content and supplies detour evidence to the planner", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const view = { focusGroupId: null, collapsedGroupIds: ["checkout", "payments", "fulfillment", "aftersales"] };
    const input = { dag, view, appearance, showNodeDetail: false, alignNodeWidthsToMax: true };
    const before = await buildCompoundStage(input);
    const supplied = compoundAiContext(before.compoundLayout!);
    assert.ok(supplied.context.detours.length > 0);
    assert.ok(supplied.context.groupConnections.length > 0);
    const plan = parseCompoundAiPlan(
      response(
        before.compoundLayout!.projection.edges.map((e) => ({
          type: "prefer-outer-route",
          edgeId: e.originalEdgeIds[0],
        })),
      ),
      { direction: "AUTO", ...supplied },
    );
    const layout = applyCompoundAiPlan(emptyLayoutData(), plan, null, supplied);
    const after = await buildCompoundStage({ ...input, layout });
    const contentBottom = Math.max(...Object.values(after.compoundLayout!.baseline.boxes).map((b) => b.y + b.height));
    assert.ok(after.stageHeight <= contentBottom + 72, "Routing must not accumulate empty bottom lanes");
    assert.ok(after.layoutQuality!.metrics.length < before.layoutQuality!.metrics.length * 1.5);
    assert.ok(after.layoutQuality!.metrics.crossings <= before.layoutQuality!.metrics.crossings + 5);
    assertCompoundGeometry(dag, after, view);
    assert.ok(compoundAiContext(after.compoundLayout!).context.currentConstraints.length > 0);
  }),
  defineTest("harness feeds measured execution back once and lets the revision retract a hint", async () => {
    const { input, problem } = await fixture();
    let solves = 0;
    await withModel([response([{ type: "prefer-outer-route", edgeId: "ab" }]), response()], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        message: "Make the flow clear",
        signal: new AbortController().signal,
        compute: async (layout) => {
          const stage = await buildCompoundStage({ ...input, layout });
          if (++solves === 1) stage.warnings.push("Preferred port unavailable.");
          return stage;
        },
      });
      assert.equal(requests.length, 2);
      assert.equal(solves, 2);
      const first = requests[0].messages.map((m: any) => m.content).join("\n");
      assert.ok(first.includes("flow-order") && first.includes("bounded detour"));
      const context = JSON.parse(requests[1].messages[1].content).context;
      assert.ok(context.executionFeedback.result.after.length > 0);
      assert.ok(context.executionFeedback.result.diagnostics.includes("Preferred port unavailable."));
      assert.equal(context.currentConstraints[0].edgeId, "ab");
      assert.deepEqual(result.data.constraints, []);
      assert.deepEqual(problem.stored.constraints, []);
    });
  }),
  defineTest("a solve failure produces actionable feedback and at most one new plan", async () => {
    const { input, problem } = await fixture();
    let solves = 0;
    await withModel([response(), response()], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        message: "Arrange",
        signal: new AbortController().signal,
        compute: async (layout) => {
          if (++solves === 1) throw new Error("No legal slot in g");
          return buildCompoundStage({ ...input, layout });
        },
      });
      assert.equal(solves, 2);
      assert.equal(requests.length, 2);
      assert.equal(
        JSON.parse(requests[1].messages[1].content).context.executionFeedback.result.solveError,
        "No legal slot in g",
      );
      assert.ok(result.stage.layoutQuality!.validation.valid);
    });
  }),
  defineTest("cancellation after the first solve prevents feedback and commit", async () => {
    const { input, problem } = await fixture();
    const abort = new AbortController();
    await withModel([response()], async (requests) => {
      await assert.rejects(
        () =>
          runCompoundAiLayout({
            settings,
            problem,
            message: "Arrange",
            signal: abort.signal,
            compute: async (layout) => {
              const stage = await buildCompoundStage({ ...input, layout });
              abort.abort();
              return stage;
            },
          }),
        /cancelled/,
      );
      assert.equal(requests.length, 1);
    });
  }),
  defineTest("a repeated refinement reuses the computed stage without a second solve", async () => {
    const { input, problem } = await fixture();
    let solves = 0;
    await withModel([response(), response()], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        message: "Arrange",
        signal: new AbortController().signal,
        compute: async (layout) => {
          solves++;
          const stage = await buildCompoundStage({ ...input, layout });
          stage.warnings.push("Fixed external port");
          return stage;
        },
      });
      assert.equal(requests.length, 2);
      assert.equal(solves, 1);
      assert.ok(result.stage.warnings.includes("Fixed external port"));
    });
  }),
  defineTest("a malformed refinement stays bounded and reports using the first valid computation", async () => {
    const { input, problem } = await fixture();
    let solves = 0;
    await withModel([response(), { invalid: true }, { invalid: true }], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        message: "Arrange",
        signal: new AbortController().signal,
        compute: async (layout) => {
          solves++;
          const stage = await buildCompoundStage({ ...input, layout });
          stage.warnings.push("Fixed external port");
          return stage;
        },
      });
      assert.equal(requests.length, 3);
      assert.equal(solves, 1);
      assert.ok(result.stage.warnings.some((w) => w.includes("refinement could not complete")));
      assert.ok(result.stage.layoutQuality!.validation.valid);
    });
  }),
]);
