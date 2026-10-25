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
  defineTest("coordinate errors reach the model for revision without hidden placement repair", async () => {
    const { input, problem, stage } = await fixture();
    const valid = [
      { nodeId: "a", x: 0, y: 500 },
      { nodeId: "b", x: 0, y: 250 },
      { nodeId: "c", x: 0, y: 0 },
    ];
    const trial = (placements: unknown[]) => ({
      action: "evaluate",
      hypothesis: "Test exact positions",
      plan: { ...response(), placements },
    });
    const evaluations: string[] = [];
    await withModel(
      [
        trial([
          { nodeId: "a", x: 0, y: 0 },
          { nodeId: "b", x: 0, y: 0 },
        ]),
        trial(valid),
        { action: "finish", candidateId: "trial-2", summary: "Separated siblings in reverse reading order." },
      ],
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          onEvaluation: (e) => evaluations.push(e.status),
          compute: (layout, runtime) =>
            buildCompoundStage({ ...input, layout, solve: async (p) => arrangePreciseCompound(p, runtime!) }),
        });
        assert.deepEqual(evaluations, ["failed", "evaluated"]);
        const context = JSON.parse(requests[1].messages[1].content).context;
        assert.match(context.session.observations[1].error, /Sibling overlap/);
        assert.deepEqual(context.session.selectableCandidates, ["current"]);
        assert.ok(result.report.changed);
        assert.ok(result.report.precise);
        assert.equal(result.report.evaluations, 2);
        assert.ok(result.report.after.movedNodes > 0);
        assert.equal(result.report.trials[1].positionedNodes, 3);
        assert.ok(result.stage.nodeMap.a.y > result.stage.nodeMap.b.y);
      },
    );
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
  defineTest(
    "partial coordinate revisions use the latest observation and can select an earlier exact trial",
    async () => {
      const { input, problem, stage } = await fixture();
      const trial = (placements: unknown[]) => ({
        action: "evaluate",
        hypothesis: "Test spacing",
        plan: { ...response(), placements },
      });
      const evaluated: Awaited<ReturnType<typeof buildCompoundStage>>[] = [];
      await withModel(
        [
          trial([{ nodeId: "g", x: 137, y: 83 }]),
          trial([{ nodeId: "g", x: 537, y: 83 }]),
          { action: "finish", candidateId: "trial-1", summary: "Prefer the first location." },
        ],
        async () => {
          const result = await runCompoundAiLayout({
            settings,
            problem,
            currentStage: stage,
            message: "Arrange",
            signal: new AbortController().signal,
            compute: async (layout, runtime) => {
              if (evaluated.length) assert.deepEqual(runtime!.baseline, evaluated.at(-1)!.compoundLayout!.baseline);
              const next = await buildCompoundStage({
                ...input,
                layout,
                solve: async (p) => arrangePreciseCompound(p, runtime!),
              });
              evaluated.push(next);
              return next;
            },
          });
          assert.equal(result.stage.compoundLayout!.baseline.boxes.g.x, 173);
          assert.equal(evaluated[1].compoundLayout!.baseline.boxes.g.x, 573);
          assert.equal(result.report.candidateId, "trial-1");
        },
      );
    },
  ),
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
  defineTest("an unchanged trial is explicitly reported as unchanged", async () => {
    const { problem, stage } = await fixture();
    await withModel(
      [
        { action: "evaluate", hypothesis: "Retain geometry", plan: response() },
        { action: "finish", candidateId: "trial-1", summary: "This trial made no visual change." },
      ],
      async () => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          compute: async () => stage,
        });
        assert.equal(result.report.changed, false);
        assert.equal(result.report.after.movedNodes, 0);
        assert.equal(result.report.after.changedEdges, 0);
        assert.equal(result.report.trials.length, 1);
      },
    );
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
  defineTest("every successful solve is observed and only an explicit model selection is applied", async () => {
    const { input, problem, stage } = await fixture();
    let solves = 0;
    const evaluate = (constraints: unknown[] = []) => ({
      action: "evaluate",
      hypothesis: "Test the main flow",
      plan: response(constraints),
    });
    await withModel(
      [
        evaluate([{ type: "prefer-outer-route", edgeId: "ab" }]),
        evaluate(),
        { action: "finish", candidateId: "trial-2", summary: "Remove the unhelpful routing hint." },
      ],
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          compute: async (layout) => {
            solves++;
            return buildCompoundStage({ ...input, layout });
          },
        });
        assert.equal(solves, 2);
        assert.equal(requests.length, 3);
        const context = JSON.parse(requests[1].messages[1].content).context;
        const observation = context.session.observations[1];
        assert.equal(observation.kind, "evaluated");
        for (const key of ["crossings", "bends", "length", "sharedLength", "area", "labelCollisions"])
          assert.equal(typeof observation.result.delta[key], "number");
        assert.equal(context.selectedDirection, "AUTO");
        assert.deepEqual(result.data.constraints, []);
        assert.equal(result.stage.layoutQuality!.aiAssessment, "Remove the unhelpful routing hint.");
        assert.equal(stage.layoutQuality!.aiAssessment, undefined);
      },
    );
  }),
  defineTest(
    "the model can select a legal candidate with a worse numeric score; no hidden Automatic fallback",
    async () => {
      const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
      const input = { dag, view, appearance, showNodeDetail: false, alignNodeWidthsToMax: true };
      const currentStage = await buildCompoundStage(input);
      const problem = currentStage.compoundLayout!;
      await withModel(
        [
          {
            action: "evaluate",
            hypothesis: "Prefer vertical reading for the domain",
            plan: { ...response(), preferences: { direction: "DOWN" } },
          },
          { action: "finish", candidateId: "trial-1", summary: "Choose vertical reading despite its longer routes." },
        ],
        async () => {
          const result = await runCompoundAiLayout({
            settings,
            problem,
            currentStage,
            message: "Vertical reading",
            signal: new AbortController().signal,
            compute: (layout) => buildCompoundStage({ ...input, layout }),
          });
          assert.ok(result.data.constraints.some((c) => c.type === "direction" && c.value === "DOWN"));
          assert.equal(result.stage.layoutQuality!.aiAssessment, "Choose vertical reading despite its longer routes.");
          assert.ok(
            compareLayoutMetrics(
              result.stage.layoutQuality!.metrics,
              currentStage.layoutQuality!.metrics,
              "readability",
            ) > 0,
          );
        },
      );
    },
  ),
  defineTest("failed solves are exposed to the model and cannot be selected", async () => {
    const { input, problem, stage } = await fixture();
    let solves = 0;
    await withModel(
      [
        { action: "evaluate", hypothesis: "Try direction", plan: response() },
        { action: "finish", candidateId: "trial-1", summary: "Invalid selection" },
        { action: "evaluate", hypothesis: "Revise after failure", plan: response() },
        { action: "finish", candidateId: "trial-2", summary: "The revised arrangement is valid." },
      ],
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          compute: async (layout) => {
            if (++solves === 1) throw new Error("No legal slot in g");
            return buildCompoundStage({ ...input, layout });
          },
        });
        const context = JSON.parse(requests[1].messages[1].content).context;
        assert.equal(context.session.observations[1].error, "No legal slot in g");
        assert.deepEqual(context.session.selectableCandidates, ["current"]);
        const correction = JSON.parse(requests[2].messages[1].content);
        assert.equal(correction.correction.code, "semantic");
        assert.ok(correction.instruction.includes("preserving your design intent"));
        assert.ok(!correction.instruction.includes("at most 8 constraints"));
        assert.equal(requests.length, 4);
        assert.equal(solves, 2);
        assert.equal(result.stage.layoutQuality!.aiAssessment, "The revised arrangement is valid.");
      },
    );
  }),
  defineTest("malformed continuation never silently applies a prior trial", async () => {
    const { input, problem, stage } = await fixture();
    let solves = 0;
    await withModel(
      [{ action: "evaluate", hypothesis: "Test", plan: response() }, { invalid: true }, { invalid: true }],
      async (requests) => {
        await assert.rejects(() =>
          runCompoundAiLayout({
            settings,
            problem,
            currentStage: stage,
            message: "Arrange",
            signal: new AbortController().signal,
            compute: async (layout) => {
              solves++;
              return buildCompoundStage({ ...input, layout });
            },
          }),
        );
        assert.equal(solves, 1);
        assert.equal(requests.length, 3);
        assert.equal(stage.layoutQuality!.aiAssessment, undefined);
        assert.deepEqual(problem.stored.constraints, []);
      },
    );
  }),
  defineTest("identical trials reuse their calculation but still require the model to finish", async () => {
    const { input, problem, stage } = await fixture();
    let solves = 0;
    const trial = { action: "evaluate", hypothesis: "Test", plan: response() };
    await withModel(
      [trial, trial, { action: "finish", candidateId: "trial-1", summary: "Keep this result." }],
      async (requests) => {
        await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          compute: async (layout) => {
            solves++;
            return buildCompoundStage({ ...input, layout });
          },
        });
        assert.equal(solves, 1);
        assert.equal(requests.length, 3);
        assert.equal(
          JSON.parse(requests[2].messages[1].content).context.session.observations[2].kind,
          "reused-evaluation",
        );
      },
    );
  }),
  defineTest("evaluation budget returns control to the model for final selection, never to a ranker", async () => {
    const { input, problem, stage } = await fixture();
    let solves = 0;
    const trials = ["east", "south", "west", "north"].map((side) => ({
      action: "evaluate",
      hypothesis: `Try ${side}`,
      plan: response([{ type: "port-side", edgeId: "ab", end: "source", side }]),
    }));
    await withModel(
      [...trials, trials[0], { action: "finish", candidateId: "trial-3", summary: "Choose the third evaluation." }],
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          compute: async (layout) => {
            solves++;
            return buildCompoundStage({ ...input, layout });
          },
        });
        assert.equal(solves, 4);
        assert.equal(requests.length, 6);
        assert.equal(JSON.parse(requests[4].messages[1].content).context.session.canEvaluate, false);
        assert.equal(result.stage.layoutQuality!.aiAssessment, "Choose the third evaluation.");
      },
    );
  }),
  defineTest("cancellation after a solve stops the agent before another decision or commit", async () => {
    const { input, problem, stage } = await fixture();
    const abort = new AbortController();
    await withModel([{ action: "evaluate", hypothesis: "Test", plan: response() }], async (requests) => {
      await assert.rejects(
        () =>
          runCompoundAiLayout({
            settings,
            problem,
            currentStage: stage,
            message: "Arrange",
            signal: abort.signal,
            compute: async (layout) => {
              const result = await buildCompoundStage({ ...input, layout });
              abort.abort();
              return result;
            },
          }),
        /cancelled/,
      );
      assert.equal(requests.length, 1);
    });
  }),
  defineTest(
    "DeepSeek planning enables thinking with an independent budget and can explicitly keep current",
    async () => {
      const { problem, stage } = await fixture();
      await withModel(
        [
          {
            action: "finish",
            candidateId: "current",
            summary: "The current organization fits the requested reading flow.",
          },
        ],
        async (requests) => {
          const result = await runCompoundAiLayout({
            settings: { ...settings, provider: "deepseek" },
            problem,
            currentStage: stage,
            message: "Arrange",
            signal: new AbortController().signal,
            compute: async () => {
              throw new Error("No evaluation was requested");
            },
          });
          assert.deepEqual(requests[0].thinking, { type: "enabled" });
          assert.equal(requests[0].max_tokens, 8192);
          assert.deepEqual(result.data, problem.stored);
          assert.equal(result.report.evaluations, 0);
          assert.equal(result.report.candidateId, "current");
          assert.equal(result.report.changed, false);
        },
      );
    },
  ),
]);
