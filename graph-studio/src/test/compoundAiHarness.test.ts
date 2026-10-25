import { createLayoutResult, type LayoutResultDocument } from "../schema/layoutResult";
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
import { compoundTopology } from "../layout/compound/topology-layout";
import { compareLayoutMetrics } from "../layout/compound/layout-quality";
import { arrangePreciseCompound, contentOrigin } from "../layout/compound/precise";
import { assertCompoundGeometry } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

const settings: AiSettings = {
  provider: "openai-compatible",
  baseUrl: "https://fixture.invalid",
  apiKey: "",
  model: "fixture",
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
    if (!init.body) return new Response(JSON.stringify({ data: [{ id: settings.model, max_output_tokens: 131072 }] }));
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

function shifted(stage: Awaited<ReturnType<typeof buildCompoundStage>>, dx: number): LayoutResultDocument {
  const layout = createLayoutResult(stage, "compound");
  layout.geometry.size[0] += dx;
  for (const n of [...layout.geometry.nodes, ...layout.geometry.groups!]) n.position[0] += dx;
  for (const e of layout.geometry.edges) {
    e.label[0] += dx;
    for (const p of e.points!) p[0] += dx;
  }
  return layout;
}
const evaluate = (layout: LayoutResultDocument) => ({
  action: "evaluate",
  hypothesis: "Compare exact spatial design",
  layout,
});
const finish = (candidateId = "trial-1") => ({
  action: "finish",
  candidateId,
  summary: "Selected after inspecting geometry and quality.",
});

export const compoundAiHarnessSuite = defineSuite("Compound AI planning harness", [
  defineTest("AI context includes every visible node, edge and full labels beyond previous sample limits", async () => {
    const { problem } = await fixture();
    const template = problem.projection.items.find((n) => n.id === "a")!;
    const title = "title".repeat(100);
    const items = Array.from({ length: 300 }, (_, i) => ({ ...template, id: `n${i}`, parentId: null, title }));
    const edgeTemplate = problem.projection.edges[0];
    const edges = items.slice(1).map((n, i) => ({
      ...edgeTemplate,
      id: `e${i}`,
      source: `n${i}`,
      target: n.id,
      originalEdgeIds: [`e${i}`],
      label: title,
    }));
    const large = {
      ...problem,
      projection: { ...problem.projection, items, edges },
      baseline: {
        ...problem.baseline,
        boxes: Object.fromEntries(items.map((n, i) => [n.id, { x: i * 300, y: 36, width: 100, height: 100 }])),
        routes: {},
      },
    };
    const context = compoundAiContext(large);
    assert.equal(context.context.nodes.length, 300);
    assert.equal(context.context.edges.length, 299);
    assert.equal(context.edgeIds.size, 299);
    assert.equal(context.context.nodes[0].title, title);
    assert.equal(context.context.edges[0].label, title);
    assert.equal(context.context.truncated, false);
    assert.equal(context.context.diagnosticsTruncated, false);
  }),
  defineTest("precise positions survive routing, nested group fitting and serialization boundaries", async () => {
    const { input, problem } = await fixture();
    const placements = [
      { nodeId: "g", x: 137, y: 83 },
      { nodeId: "a", x: 0, y: 400 },
      { nodeId: "b", x: 280, y: 200 },
      { nodeId: "c", x: 0, y: 0 },
    ];
    const plan = parseCompoundAiPlan(
      { ...response(), placements },
      { direction: "AUTO", ...compoundAiContext(problem) },
    );
    const layout = applyCompoundAiPlan(problem.stored, plan, null, compoundAiContext(problem));
    const stage = await buildCompoundStage({
      ...input,
      layout,
      solve: async (p) => arrangePreciseCompound(p, { placements, baseline: problem.baseline }),
    });
    const boxes = stage.compoundLayout!.baseline.boxes;
    for (const p of placements) {
      const node = problem.projection.items.find((n) => n.id === p.nodeId)!;
      const origin = contentOrigin(node.parentId === null ? undefined : boxes[node.parentId]);
      assert.equal(boxes[p.nodeId].x, origin.x + p.x);
      assert.equal(boxes[p.nodeId].y, origin.y + p.y);
    }
    assertCompoundGeometry(input.dag, stage, view);
    const feedback = compoundExecutionFeedback(problem, stage);
    assert.ok(feedback.after.movedNodes > 0);
    assert.ok(feedback.after.changedEdges > 0);
    const document = defaultLayoutDocument();
    document.charts.compound = layout;
    assert.deepEqual(parseLayoutDocument(document), document);
    assert.ok(!JSON.stringify(document).includes("placements"));
    assert.deepEqual(serializeDag(input.dag), serializeDag(graph()));
    const moved = arrangePreciseCompound(stage.compoundLayout!, {
      placements: [{ nodeId: "g", x: 437, y: 83 }],
      baseline: stage.compoundLayout!.baseline,
    });
    assert.equal(moved.geometry.boxes.a.x, boxes.a.x + 300);
    assert.equal(moved.geometry.boxes.a.y, boxes.a.y);
  }),
  defineTest("coordinate validation permits only finite positions on supplied movable IDs", async () => {
    const { problem } = await fixture();
    const policy = { direction: "AUTO" as const, ...compoundAiContext(problem) };
    for (const placements of [
      [{ nodeId: "missing", x: 0, y: 0 }],
      [{ nodeId: "a", x: -1, y: 0 }],
      [{ nodeId: "a", x: Infinity, y: 0 }],
      [
        { nodeId: "a", x: 0, y: 0 },
        { nodeId: "a", x: 1, y: 0 },
      ],
      [{ nodeId: "a", x: 0, y: 0, width: 50 }],
    ])
      assert.throws(() => parseCompoundAiPlan({ ...response(), placements }, policy));
    assert.throws(() =>
      parseCompoundAiPlan(
        { ...response(), placements: [{ nodeId: "a", x: 0, y: 0 }] },
        { ...policy, movableNodeIds: new Set() },
      ),
    );
  }),
  defineTest("structural plans are not artificially limited to 32 supplied preferences or siblings", () => {
    const nodeIds = Array.from({ length: 40 }, (_, i) => `n${i}`),
      edgeIds = new Set(nodeIds);
    const plan = parseCompoundAiPlan(
      response([
        { type: "flow-order", scopeId: null, nodeIds },
        ...nodeIds.map((edgeId) => ({ type: "prefer-outer-route", edgeId })),
      ]),
      { direction: "AUTO", edgeIds, scopes: new Map([[null, { nodeIds, orderable: true }]]) },
    );
    assert.equal(plan.constraints.length, 41);
  }),
  defineTest(
    "every observation reports route extents and complete metric deltas without deciding for the model",
    async () => {
      const { problem, stage } = await fixture();
      const widened = { ...stage, compoundLayout: { ...problem, baseline: { ...problem.baseline, height: 10000 } } };
      const feedback = compoundExecutionFeedback(problem, widened);
      assert.equal(feedback.canvas.height, 10000);
      assert.ok(feedback.canvas.routeBottom < 10000);
      assert.equal(feedback.delta.crossings, 0);
      assert.equal(feedback.delta.bends, 0);
      assert.ok(!("needsRevision" in feedback));
    },
  ),
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
  defineTest("partial flow order retains all branch relationships instead of replacing them with a chain", async () => {
    const edges: [string, string][] = [
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "d"],
    ];
    const topology = compoundTopology(["a", "b", "c", "d"], edges, ["a", "d"]);
    for (const edge of edges) assert.ok(topology.forward.some((e) => JSON.stringify(e) === JSON.stringify(edge)));
    assert.ok(topology.layers.some((layer) => layer.includes("b") && layer.includes("c")));
    const { problem } = await fixture();
    const plan = parseCompoundAiPlan(response([{ type: "flow-order", scopeId: "g", nodeIds: ["a", "c"] }]), {
      direction: "AUTO",
      ...compoundAiContext(problem),
    });
    assert.equal(plan.constraints.length, 1);
  }),
  defineTest("AI direction choices remain revisable while explicit user direction remains enforced", async () => {
    const { problem } = await fixture();
    const chosen = applyCompoundAiPlan(
      emptyLayoutData(),
      { direction: "DOWN", constraints: [] },
      null,
      compoundAiContext(problem),
    );
    assert.equal(chosen.direction, "AUTO");
    assert.ok(chosen.constraints.some((c) => c.type === "direction" && c.value === "DOWN"));
    assert.doesNotThrow(() =>
      parseCompoundAiPlan(
        { ...response(), preferences: { direction: "RIGHT" } },
        { direction: chosen.direction, ...compoundAiContext(problem) },
      ),
    );
    assert.throws(() =>
      parseCompoundAiPlan(
        { ...response(), preferences: { direction: "RIGHT" } },
        { direction: "DOWN", ...compoundAiContext(problem) },
      ),
    );
  }),
  defineTest("AI returns Schema Layout and the selected exact geometry is rendered without a solver", async () => {
    const { stage, problem } = await fixture();
    const first = shifted(stage, 100),
      second = shifted(stage, 400);
    await withModel([evaluate(first), evaluate(second), finish()], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
      });
      assert.deepEqual(createLayoutResult(result.stage, "compound"), first);
      assert.ok(result.report.changed && result.report.precise);
      assert.equal(result.report.evaluations, 2);
      const request = JSON.parse(requests[1].messages[1].content).context;
      assert.deepEqual(request.currentLayout, first);
      assert.ok(request.session.observations[1].result.after);
      assert.deepEqual(result.data.constraints, []);
    });
  }),
  defineTest("invalid geometry is returned as feedback and can never be selected", async () => {
    const { stage, problem } = await fixture();
    const invalid = createLayoutResult(stage, "compound");
    invalid.geometry.nodes[0].position = [...invalid.geometry.nodes[1].position];
    const statuses: string[] = [];
    await withModel(
      [evaluate(invalid), finish(), evaluate(shifted(stage, 50)), finish("trial-2")],
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          onEvaluation: (e) => statuses.push(e.status),
        });
        assert.deepEqual(statuses, ["failed", "evaluated"]);
        assert.equal(result.report.candidateId, "trial-2");
        assert.match(
          JSON.parse(requests[1].messages[1].content).context.session.observations[1].error,
          /overlap|endpoint/i,
        );
      },
    );
  }),
  defineTest("unchanged results and repeated candidates are reported honestly", async () => {
    const { stage, problem } = await fixture();
    const layout = createLayoutResult(stage, "compound");
    await withModel([evaluate(layout), evaluate(layout), finish()], async () => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
      });
      assert.equal(result.report.changed, false);
      assert.deepEqual(
        result.report.trials.map((t) => t.status),
        ["evaluated", "reused"],
      );
    });
  }),
  defineTest(
    "the model controls iteration beyond the former six-decision limit and may select a larger canvas",
    async () => {
      const { stage, problem } = await fixture();
      await withModel(
        [...Array.from({ length: 7 }, (_, i) => evaluate(shifted(stage, 100 * (i + 1)))), finish("trial-7")],
        async () => {
          const result = await runCompoundAiLayout({
            settings,
            problem,
            currentStage: stage,
            message: "Arrange",
            signal: new AbortController().signal,
          });
          assert.equal(result.report.evaluations, 7);
          assert.equal(result.stage.stageWidth, stage.stageWidth + 700);
        },
      );
    },
  ),
  defineTest("malformed continuation never silently commits the last valid layout", async () => {
    const { stage, problem } = await fixture();
    const before = createLayoutResult(stage, "compound");
    await withModel([evaluate(shifted(stage, 100)), { invalid: true }, { invalid: true }], async () => {
      await assert.rejects(
        runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
        }),
      );
      assert.deepEqual(createLayoutResult(stage, "compound"), before);
    });
  }),
  defineTest("cancellation after evaluation stops before another decision", async () => {
    const { stage, problem } = await fixture();
    const abort = new AbortController();
    await withModel([evaluate(shifted(stage, 100))], async (requests) => {
      await assert.rejects(
        runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: abort.signal,
          onEvaluation: () => abort.abort(),
        }),
        /cancelled/,
      );
      assert.equal(requests.length, 1);
    });
  }),
]);
