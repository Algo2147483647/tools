import { createLayoutResult, type LayoutResultDocument } from "../schema/layoutResult";
import assert from "node:assert/strict";
import type { AiSettings } from "../ai/types";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { emptyLayoutData, defaultLayoutIntent } from "../graph/compound/layoutData";
import { buildCompoundStage } from "../layout/compound/layout";
import { getStageAppearance } from "../layout/shared/appearance";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { defaultLayoutSession, parseLayoutSession, repairLayoutSession } from "../schema/layoutSession";
import { compoundAiContext } from "../layout/compound/ai/request";
import { runCompoundAiLayout } from "../layout/compound/ai/workflow";
import { compoundExecutionFeedback } from "../layout/compound/ai/workflow";
import { compareLayoutMetrics } from "../layout/compound/layout-quality";
import { executeCompoundDecision } from "../layout/compound/ai/execute";
import { parseCompoundDecision, type CompoundAiDecision } from "../layout/compound/ai/decision";
import { applyLayoutResult } from "../layout/shared/applyLayoutResult";
import { inspectDraft } from "../layout/compound/ai/geometry";
import { readFile } from "node:fs/promises";
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
  protocolVersion: 1,
  action: "evaluate",
  hypothesis: "Compare exact spatial design",
  layout,
});
const finish = (candidateId = "trial-1") => ({
  protocolVersion: 1,
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
    assert.ok(!("position" in context.context.nodes[0]) && !("localPosition" in context.context.nodes[0]));
    assert.equal(context.context.diagnosticsTruncated, false);
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
    const doc = defaultLayoutSession();
    doc.charts.compound = layout;
    assert.equal(parseLayoutSession(doc).charts.compound.portMode, "midpoints");
    assert.equal(parseLayoutSession({ charts: { compound: {} } }).charts.compound.portMode, "distributed");
    assertCompoundGeometry(input.dag, stage, view);
  }),
  defineTest("flow order survives rename and drops removed or reparented siblings", () => {
    const layout = defaultLayoutSession();
    layout.charts.compound.constraints = [
      { type: "flow-order", scopeId: "g", nodeIds: ["a", "b", "c"], strength: "soft" },
    ];
    const dag = serializeDag(graph());
    dag.nodes.renamed = dag.nodes.a;
    delete dag.nodes.a;
    dag.hierarchy_edges!.find((e) => e.target === "a")!.target = "renamed";
    const repaired = repairLayoutSession(layout, dag, [{ from: "a", to: "renamed" }]);
    assert.deepEqual(repaired.charts.compound.constraints[0], {
      ...layout.charts.compound.constraints[0],
      nodeIds: ["renamed", "b", "c"],
    });
    dag.hierarchy_edges = dag.hierarchy_edges!.filter((e) => e.target !== "c");
    const final = repairLayoutSession(repaired, dag).charts.compound.constraints[0];
    assert.equal(final.type, "flow-order");
    if (final.type === "flow-order") assert.deepEqual(final.nodeIds, ["renamed", "b"]);
  }),
  defineTest("AI returns Schema Layout and the selected exact geometry is rendered without a solver", async () => {
    const { stage, problem } = await fixture();
    const first = shifted(stage, 100);
    await withModel([evaluate(first), finish()], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
      });
      assert.deepEqual(createLayoutResult(result.stage, "compound"), first);
      assert.ok(result.report.changed && result.report.precise);
      assert.equal(result.report.evaluations, 1);
      const request = JSON.parse(requests[1].messages[1].content).context;
      assert.deepEqual(request.currentLayout, first);
      assert.ok(request.session.feedback.after);
      assert.deepEqual(request.session.workingDraft, { candidateId: "trial-1", revision: 1 });
      assert.ok(request.session.observations.every((entry: object) => !("layout" in entry)));
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
          budget: { maxStagnant: 3, maxRequests: 5 },
          onEvaluation: (e) => statuses.push(e.status),
        });
        assert.deepEqual(statuses, ["failed", "evaluated"]);
        assert.equal(result.report.candidateId, "trial-2");
        assert.match(JSON.parse(requests[1].messages[1].content).context.session.feedback.error, /overlap|endpoint/i);
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
  defineTest("a model that keeps evaluating stops at the total request budget", async () => {
    const { stage, problem } = await fixture();
    await withModel(
      Array.from({ length: 4 }, (_, i) => evaluate(shifted(stage, 100 * (i + 1)))),
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          budget: { maxStagnant: 5 },
        });
        assert.equal(result.report.evaluations, 4);
        assert.equal(result.report.stopReason, "request-budget");
        assert.equal(requests.length, 4);
        assert.equal(result.report.candidateId, "current");
      },
    );
  }),
  defineTest("malformed continuation reports its error and selects the best legal candidate", async () => {
    const { stage, problem } = await fixture();
    const before = createLayoutResult(stage, "compound");
    await withModel([evaluate(shifted(stage, 100)), { invalid: true }, { invalid: true }], async () => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
      });
      assert.equal(result.report.stopReason, "request-error");
      assert.equal(result.report.candidateId, "current");
      assert.equal(result.report.requests, 3);
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
  defineTest("Compound requires its protocol version and validates draft revisions and change variants", async () => {
    const { stage } = await fixture();
    const parse = (value: Record<string, unknown>) =>
      parseCompoundDecision(value, new Set(["current"]), new Map([["current", 0]]), false);
    const revise = {
      protocolVersion: 1,
      action: "revise",
      hypothesis: "Fix one route",
      baseCandidateId: "current",
      baseRevision: 0,
      changes: [{ type: "reroute-edge", id: stage.edges[0].id }],
    };
    assert.equal(parse(revise).action, "revise");
    for (const value of [
      { ...evaluate(createLayoutResult(stage, "compound")), protocolVersion: undefined },
      { ...finish("current"), protocolVersion: 2 },
      { ...revise, baseRevision: 1 },
      { ...revise, baseCandidateId: "missing" },
      { ...revise, changes: [] },
      { ...revise, changes: [{ type: "move-node", id: "a", position: [NaN, 2] }] },
      { ...revise, changes: [{ type: "reroute-edge", id: "x", arbitrary: true }] },
    ])
      assert.throws(() => parse(value));
  }),
  defineTest("propose uses the solver and visible edge IDs while returning complete Layout v4", async () => {
    const { stage, problem, input } = await fixture();
    const intent = defaultLayoutIntent();
    intent.constraints = [
      { type: "direction", scopeId: "g", value: "RIGHT", strength: "soft" },
      { type: "port-side", edgeId: stage.edges[0].id, end: "source", side: "east", strength: "soft" },
    ];
    await withModel(
      [{ protocolVersion: 1, action: "propose", hypothesis: "Read chain eastward", intent }, finish()],
      async () => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Read eastward",
          signal: new AbortController().signal,
        });
        assert.equal(result.report.trials[0].status, "evaluated", result.report.trials[0].error);
        assert.equal(result.report.candidateId, "trial-1");
        assert.equal(result.report.precise, false);
        assert.ok(result.stage.nodeMap.a.x < result.stage.nodeMap.b.x);
        assert.equal(createLayoutResult(result.stage, "compound").version, 4);
        assertCompoundGeometry(input.dag, result.stage, view);
      },
    );
  }),
  defineTest("a failed exact draft can be repaired by rerouting one edge, preserving all other geometry", async () => {
    const { stage, problem } = await fixture();
    problem.stored.portMode = "midpoints";
    const before = createLayoutResult(stage, "compound");
    const broken = structuredClone(before);
    broken.geometry.edges[0].points![0][0] += 10;
    const revise = {
      protocolVersion: 1,
      action: "revise",
      hypothesis: "Repair midpoint attachment",
      baseCandidateId: "trial-1",
      baseRevision: 1,
      changes: [{ type: "reroute-edge", id: stage.edges[0].id }],
    };
    await withModel([evaluate(broken), revise, finish("trial-2")], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Fix ports",
        signal: new AbortController().signal,
        budget: { maxStagnant: 3 },
      });
      assert.equal(result.report.candidateId, "trial-2", result.report.summary);
      assert.deepEqual(
        result.report.trials.map((t) => t.status),
        ["failed", "evaluated"],
      );
      assert.deepEqual(createLayoutResult(result.stage, "compound"), before);
      const context = JSON.parse(requests[1].messages[1].content).context;
      assert.deepEqual(context.currentLayout, broken);
      assert.ok(context.session.feedback.issues.some((i: { code: string }) => i.code === "port"));
      assert.deepEqual(result.report.trials[1].reroutedEdgeIds, [stage.edges[0].id]);
    });
  }),
  defineTest("manual replacement paths fail visibly and are never automatically changed", async () => {
    const { stage, problem } = await fixture();
    const baseLayout = createLayoutResult(stage, "compound");
    const points: [number, number][] = [
      [1, 1],
      [2, 2],
    ];
    const result = executeCompoundDecision({
      problem,
      baseLayout,
      decision: {
        protocolVersion: 1,
        action: "revise",
        hypothesis: "Manual route",
        baseCandidateId: "current",
        baseRevision: 0,
        changes: [{ type: "replace-route", id: stage.edges[0].id, points, label: [1, 1] }],
      },
    });
    assert.deepEqual(result.layout.geometry.edges[0].points, points);
    assert.deepEqual(result.reroutedEdgeIds, []);
    assert.throws(() => applyLayoutResult(result.layout, stage));
    assert.deepEqual(createLayoutResult(stage, "compound"), baseLayout);
  }),
  defineTest("failed duplicates are cached and consecutive failures stop the run", async () => {
    const { stage, problem } = await fixture();
    const layout = createLayoutResult(stage, "compound");
    layout.geometry.nodes[0].position = [0, 0];
    let executions = 0;
    await withModel([evaluate(layout), evaluate(layout)], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
        execute: async (input) => {
          executions++;
          return executeCompoundDecision(input);
        },
      });
      assert.equal(executions, 1);
      assert.equal(requests.length, 2);
      assert.equal(result.report.stopReason, "no-improvement");
      assert.equal(result.report.candidateId, "current");
      assert.deepEqual(
        result.report.trials.map((t) => t.status),
        ["failed", "reused"],
      );
    });
  }),
  defineTest("protocol corrections share the total request budget", async () => {
    const { stage, problem } = await fixture();
    await withModel(
      [evaluate(shifted(stage, 10)), { bad: true }, evaluate(shifted(stage, 20)), { bad: true }],
      async (requests) => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
          budget: { maxStagnant: 5 },
        });
        assert.equal(requests.length, 4);
        assert.equal(result.report.requests, 4);
        assert.equal(result.report.stopReason, "request-budget");
      },
    );
  }),
  defineTest("deadline aborts an in-flight model request and reports a legal fallback", async () => {
    const { stage, problem } = await fixture();
    const original = globalThis.fetch;
    let aborted = false;
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      if (!init.body) return new Response(JSON.stringify({ data: [] }));
      return await new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }) as typeof fetch;
    try {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
        budget: { timeoutMs: 50 },
      });
      assert.ok(aborted);
      assert.equal(result.report.stopReason, "deadline");
      assert.equal(result.report.candidateId, "current");
    } finally {
      globalThis.fetch = original;
    }
  }),
  defineTest("a deadline cannot install an invalid initial layout", async () => {
    const { stage, problem } = await fixture();
    const invalidStage = { ...stage, nodes: stage.nodes.map((n) => ({ ...n, x: 0 })) };
    await withModel([{ bad: true }, { bad: true }], async () => {
      await assert.rejects(
        runCompoundAiLayout({
          settings,
          problem,
          currentStage: invalidStage,
          message: "Arrange",
          signal: new AbortController().signal,
        }),
        /No legal candidate/,
      );
    });
  }),
  defineTest("commerce card-crossing diagnostics are repaired locally without moving nodes", async () => {
    const raw = JSON.parse(
      await readFile(new URL("../../public/examples/commerce/commerce.json", import.meta.url), "utf8"),
    );
    const dag = normalizeDagInput(raw);
    const stage = await buildCompoundStage({
      dag,
      view,
      appearance,
      showNodeDetail: false,
      alignNodeWidthsToMax: true,
      layout: { ...emptyLayoutData(), portMode: "midpoints" },
    });
    const problem = stage.compoundLayout!,
      baseline = createLayoutResult(stage, "compound"),
      broken = structuredClone(baseline);
    const pairs = [
      ["dispatch", "carrier", "email"],
      ["orders", "metrics", "synthetic-monitor"],
    ];
    const ids: string[] = [];
    for (const [source, target, obstacle] of pairs) {
      const edge = stage.edges.find((e) => e.source === source && e.target === target)!;
      assert.ok(edge);
      const card = stage.nodeMap[obstacle];
      const route = broken.geometry.edges.find((e) => e.id === edge.id)!;
      route.points = [
        [card.x - card.width, card.y],
        [card.x + card.width, card.y],
      ];
      ids.push(edge.id);
    }
    const issues = inspectDraft(broken, problem);
    assert.ok(pairs.every(([, , obstacle]) => issues.some((i) => i.nodeId === obstacle && i.code === "card-crossing")));
    const decision: CompoundAiDecision = {
      protocolVersion: 1,
      action: "revise",
      hypothesis: "Repair crossing routes",
      baseCandidateId: "trial-3",
      baseRevision: 1,
      changes: ids.map((id) => ({ type: "reroute-edge", id })),
    };
    const result = executeCompoundDecision({ problem, baseLayout: broken, decision });
    assert.equal(result.error, undefined);
    const repaired = applyLayoutResult(result.layout, stage);
    assert.deepEqual(result.layout.geometry.nodes, baseline.geometry.nodes);
    assert.deepEqual(result.layout.geometry.groups, baseline.geometry.groups);
    for (const edge of baseline.geometry.edges.filter((e) => !ids.includes(e.id)))
      assert.deepEqual(
        result.layout.geometry.edges.find((e) => e.id === edge.id),
        edge,
      );
    assert.deepEqual(new Set(result.reroutedEdgeIds), new Set(ids));
    assertCompoundGeometry(dag, repaired, view);
  }),
  defineTest("moving an unrelated card invalidates the route it obstructs, preserving a distant route", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {}, blocker: {}, u: {}, v: {} },
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "uv", source: "u", target: "v" },
      ],
    });
    const stage = await buildCompoundStage({
      dag,
      view,
      appearance,
      showNodeDetail: false,
      alignNodeWidthsToMax: true,
    });
    const base = createLayoutResult(stage, "compound");
    base.geometry.size = [1000, 900];
    const positions: Record<string, [number, number]> = {
      a: [160, 150],
      b: [660, 150],
      blocker: [410, 350],
      u: [160, 650],
      v: [660, 650],
    };
    for (const n of base.geometry.nodes) n.position = positions[n.id];
    for (const e of base.geometry.edges) {
      const source = stage.edges.find((edge) => edge.id === e.id)!.source;
      const y = positions[source][1],
        half = stage.nodeMap[source].width / 2;
      e.points = [
        [160 + half, y],
        [660 - half, y],
      ];
      e.label = [410, y - 10];
    }
    const arranged = applyLayoutResult(base, stage);
    const result = executeCompoundDecision({
      problem: arranged.compoundLayout!,
      baseLayout: base,
      decision: {
        protocolVersion: 1,
        action: "revise",
        hypothesis: "Move unrelated blocker",
        baseCandidateId: "current",
        baseRevision: 0,
        changes: [{ type: "move-node", id: "blocker", position: [410, 150] }],
      },
    });
    assert.equal(result.error, undefined);
    const ab = stage.edges.find((e) => e.source === "a")!.id,
      uv = stage.edges.find((e) => e.source === "u")!.id;
    assert.deepEqual(result.reroutedEdgeIds, [ab]);
    assert.deepEqual(
      result.layout.geometry.edges.find((e) => e.id === uv),
      base.geometry.edges.find((e) => e.id === uv),
    );
    assertCompoundGeometry(dag, applyLayoutResult(result.layout, stage), view);
  }),
  defineTest("group moves translate descendants and fixed external nodes cannot be moved", async () => {
    const { stage, problem } = await fixture();
    const base = createLayoutResult(stage, "compound");
    const g = base.geometry.groups![0];
    const result = executeCompoundDecision({
      problem,
      baseLayout: base,
      decision: {
        protocolVersion: 1,
        action: "revise",
        hypothesis: "Move group",
        baseCandidateId: "current",
        baseRevision: 0,
        changes: [{ type: "move-group", id: g.id, position: [g.position[0] + 50, g.position[1] + 50] }],
      },
    });
    assert.equal(result.error, undefined);
    applyLayoutResult(result.layout, stage);
    for (const node of base.geometry.nodes)
      assert.deepEqual(result.layout.geometry.nodes.find((n) => n.id === node.id)!.position, [
        node.position[0] + 50,
        node.position[1] + 50,
      ]);
    const fixed = {
      ...problem,
      projection: {
        ...problem.projection,
        items: problem.projection.items.map((i) => (i.id === "a" ? { ...i, external: true } : i)),
      },
    };
    const rejected = executeCompoundDecision({
      problem: fixed,
      baseLayout: base,
      decision: {
        protocolVersion: 1,
        action: "revise",
        hypothesis: "Invalid move",
        baseCandidateId: "current",
        baseRevision: 0,
        changes: [{ type: "move-node", id: "a", position: [10, 10] }],
      },
    });
    assert.match(rejected.error!, /External node is fixed/);
  }),
  defineTest("selected direction is enforced by proposals and exact evaluations", async () => {
    const { stage, problem } = await fixture();
    const directed = { ...problem, stored: { ...problem.stored, direction: "RIGHT" as const } };
    const directedStage = { ...stage, compoundLayout: directed };
    await withModel(
      [
        evaluate(createLayoutResult(stage, "compound")),
        { protocolVersion: 1, action: "propose", hypothesis: "Honor rightward flow", intent: defaultLayoutIntent() },
        finish("trial-2"),
      ],
      async () => {
        const result = await runCompoundAiLayout({
          settings,
          problem: directed,
          currentStage: directedStage,
          message: "Right",
          signal: new AbortController().signal,
          budget: { maxStagnant: 3 },
        });
        assert.equal(result.report.trials[0].status, "failed");
        assert.equal(result.report.candidateId, "trial-2", result.report.summary);
        assert.ok(result.stage.nodeMap.b.x > result.stage.nodeMap.a.x);
      },
    );
  }),
]);
