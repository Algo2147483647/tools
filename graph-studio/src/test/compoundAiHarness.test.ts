import { createLayoutResult } from "../schema/layoutResult";
import assert from "node:assert/strict";
import type { AiSettings } from "../ai/types";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { emptyLayoutData } from "../graph/compound/layoutData";
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
import { validateDesign, type CompoundDesign } from "../layout/compound/ai/design";

const review = (candidateId = "trial-1", revision = 1, problems = false) => ({
  candidateId,
  revision,
  readingFlow: "The chain reads left to right.",
  hierarchy: "The containing group is clear.",
  relationships: "The actual connections remain readable.",
  problems: problems
    ? [
        {
          ids: ["g"],
          observation: "The group has insufficient margin.",
          change: "Move the group right.",
          expectedEffect: "The group has breathing room.",
        },
      ]
    : [],
});
const designPlan = (): CompoundDesign => ({
  purpose: "Explain the chain within its containing group.",
  readingPath: ["a", "b", "c"],
  regions: [{ id: "g", role: "primary", reason: "Contains the main flow." }],
  scopes: [
    { groupId: null, direction: "RIGHT", rows: [["g"]], reason: "One primary region." },
    { groupId: "g", direction: "RIGHT", rows: [["a", "b", "c"]], reason: "Read the chain." },
  ],
  connections: [],
});
const design = (plan = designPlan(), prior: ReturnType<typeof review> | null = null) => ({
  protocolVersion: 2,
  action: "design",
  hypothesis: "Make the main flow clear",
  design: plan,
  review: prior,
});
const finish = (candidateId = "trial-1", revision = 1) => ({
  protocolVersion: 2,
  action: "finish",
  candidateId,
  summary: "The main reading path is clear.",
  review: review(candidateId, revision),
});

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

export const compoundAiHarnessSuite = defineSuite("Compound AI planning harness", [
  defineTest("active reasoning refreshes the idle timeout through design and review", async () => {
    const { stage, problem } = await fixture();
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (_url, init) => {
      if (!init?.body) return new Response(JSON.stringify({ data: [] }));
      const reply = ++calls === 1 ? design() : finish();
      const encoder = new TextEncoder();
      let tick = 0;
      return new Response(
        new ReadableStream({
          start(controller) {
            const timer = setInterval(() => {
              const chunk =
                ++tick < 5
                  ? { delta: { reasoning_content: "Considering relationships. " } }
                  : { delta: { content: JSON.stringify(reply) }, finish_reason: "stop" };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [chunk] })}\n\n`));
              if (tick === 5) {
                clearInterval(timer);
                controller.close();
              }
            }, 25);
            init.signal?.addEventListener(
              "abort",
              () => {
                clearInterval(timer);
                controller.error(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;
    try {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
        budget: { idleTimeoutMs: 100, timeoutMs: 5000 },
      });
      assert.equal(result.report.requests, 2);
      assert.equal(result.report.stopReason, "selected");
      assert.ok(result.report.elapsedMs > 200);
    } finally {
      globalThis.fetch = original;
    }
  }),
  defineTest("idle and total deadlines identify unreviewed drafts without claiming retention", async () => {
    for (const idle of [true, false]) {
      const { stage, problem } = await fixture();
      const original = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async (_url, init) => {
        if (!init?.body) return new Response(JSON.stringify({ data: [] }));
        if (++calls === 1)
          return new Response(
            JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(design()) } }] }),
          );
        return new Promise<Response>((_resolve, reject) => {
          if (init.signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
          else
            init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
              once: true,
            });
        });
      }) as typeof fetch;
      try {
        await assert.rejects(
          runCompoundAiLayout({
            settings,
            problem,
            currentStage: stage,
            message: "Arrange",
            signal: new AbortController().signal,
            budget: { idleTimeoutMs: idle ? 50 : 5000, timeoutMs: idle ? 5000 : 300 },
          }),
          (error: Error) => {
            assert.match(error.message, idle ? /stopped producing output/ : /time limit reached/);
            assert.match(error.message, /1 drafts evaluated/);
            assert.ok(!error.message.includes("retained"));
            return true;
          },
        );
      } finally {
        globalThis.fetch = original;
      }
    }
  }),
  defineTest("DOWN uses physical rows without transposing canvas cells", async () => {
    const { stage, problem } = await fixture();
    const plan = designPlan();
    plan.scopes[1].direction = "DOWN";
    plan.scopes[1].rows = [
      ["a", "b"],
      ["c", null],
    ];
    const result = executeCompoundDecision({
      problem,
      baseLayout: createLayoutResult(stage, "compound"),
      decision: { protocolVersion: 2, action: "design", hypothesis: "Read down", design: plan, review: null },
    });
    const nodes = new Map(result.layout.geometry.nodes.map((n) => [n.id, n.position]));
    assert.equal(nodes.get("a")![0], nodes.get("c")![0]);
    assert.equal(nodes.get("a")![1], nodes.get("b")![1]);
    assert.ok(nodes.get("c")![1] > nodes.get("a")![1]);
  }),
  defineTest("a legal design is accepted even when numeric quality regresses", async () => {
    const { stage, problem } = await fixture();
    const plan = designPlan();
    plan.scopes[1].rows = [["a", null, null, null, null, "b", null, null, null, null, "c"]];
    await withModel([design(plan), finish()], async () => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Make a spacious reading path",
        signal: new AbortController().signal,
      });
      assert.equal(result.report.candidateId, "trial-1");
      assert.ok(result.report.after.length > result.report.before.length);
    });
  }),
  defineTest("failed design is repaired structurally and then reviewed", async () => {
    const { stage, problem } = await fixture();
    const broken = designPlan();
    broken.scopes[1].rows = [["a", "b"]];
    await withModel(
      [design(broken), design(designPlan(), review("trial-1", 1, true)), finish("trial-2", 2)],
      async () => {
        const result = await runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: new AbortController().signal,
        });
        assert.deepEqual(
          result.report.trials.map((t) => t.status),
          ["failed", "evaluated"],
        );
        assert.equal(result.report.reviews[0].mode, "invalid-draft");
      },
    );
  }),
  defineTest("design is executed and reviewed before finish with versioned text evidence", async () => {
    const { stage, problem } = await fixture();

    await withModel([design(), finish()], async (requests) => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Explain the chain",
        signal: new AbortController().signal,
      });
      assert.equal(result.report.observationMode, "structure-only");
      assert.equal(result.report.reviews.length, 1);
      assert.equal(result.report.candidateId, "trial-1");
      assert.equal(typeof requests[1].messages[1].content, "string");
      const context = JSON.parse(requests[1].messages[1].content).context;
      assert.equal(context.session.candidateId, "trial-1");
      assert.equal(context.session.observationMode, "structure-only");
      assert.ok(!JSON.stringify(context).includes("base64"));
      assertCompoundGeometry(graph(), result.stage, view);
    });
  }),
  defineTest("a revision is executed again and only its own review can finish it", async () => {
    const { stage, problem } = await fixture();
    const revise = {
      protocolVersion: 2,
      action: "revise",
      hypothesis: "Add breathing room",
      baseCandidateId: "trial-1",
      baseRevision: 1,
      review: review("trial-1", 1, true),
      changes: [{ type: "move-group", id: "g", position: [100, 100] }],
    };
    await withModel([design(), revise, finish("trial-2", 2)], async () => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
      });
      assert.equal(result.report.reviews.length, 2);
      assert.equal(result.report.candidateId, "trial-2");
      assert.equal(result.stage.compoundLayout!.baseline.boxes.g.x, 100);
    });
  }),
  defineTest("parallel cells do not become artificial graph dependencies", async () => {
    const { stage, problem } = await fixture();
    const plan = designPlan();
    plan.scopes[1].rows = [
      ["a", "c"],
      ["b", null],
    ];
    const result = executeCompoundDecision({
      problem,
      baseLayout: createLayoutResult(stage, "compound"),
      decision: {
        protocolVersion: 2,
        action: "design",
        hypothesis: "Parallel composition",
        design: plan,
        review: null,
      },
    });
    const a = result.layout.geometry.nodes.find((n) => n.id === "a")!,
      b = result.layout.geometry.nodes.find((n) => n.id === "b")!;
    assert.equal(a.position[0], b.position[0]);
    assert.ok(a.position[1] < b.position[1]);
    assert.deepEqual(result.data.constraints, []);
    assert.equal(serializeDag(graph()).edges.length, 2);
  }),
  defineTest("design rejects omissions, duplicate cells, wrong scopes and selected direction changes", async () => {
    const { problem } = await fixture();
    const omitted = designPlan();
    omitted.scopes[1].rows = [["a", "b"]];
    assert.throws(() => validateDesign(problem, omitted), /exactly once/);
    const duplicate = designPlan();
    duplicate.scopes[1].rows = [["a", "b", "a"]];
    assert.throws(() => validateDesign(problem, duplicate), /exactly once/);
    const wrong = designPlan();
    wrong.scopes[1].groupId = "missing";
    assert.throws(() => validateDesign(problem, wrong), /Unknown/);
    assert.throws(
      () => validateDesign({ ...problem, stored: { ...problem.stored, direction: "DOWN" } }, designPlan()),
      /Preserve selected/,
    );
  }),
  defineTest("the new protocol rejects legacy actions, stale reviews and premature finish", () => {
    const session = { candidateId: "trial-1", revision: 1, valid: true, designed: true };
    assert.throws(() => parseCompoundDecision({ ...finish(), protocolVersion: 1 }, session));
    assert.throws(() => parseCompoundDecision({ protocolVersion: 2, action: "propose" }, session));
    assert.throws(() => parseCompoundDecision(finish("trial-2", 2), session), /Review/);
    assert.throws(() => parseCompoundDecision(finish(), { ...session, designed: false }), /Begin/);
    assert.throws(() => parseCompoundDecision(finish(), { ...session, valid: false }), /legal/);
    assert.throws(() => parseCompoundDecision(design(), session), /Review/);
  }),
  defineTest("all design reviews use structure only", async () => {
    const { stage, problem } = await fixture();
    await withModel([design(), finish()], async () => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
      });
      assert.equal(result.report.observationMode, "structure-only");
    });
  }),
  defineTest("budget reserves the final review and never installs an unreviewed edit", async () => {
    const { stage, problem } = await fixture();
    await withModel([design(), design(designPlan(), review("trial-1", 1, true))], async () => {
      const result = await runCompoundAiLayout({
        settings,
        problem,
        currentStage: stage,
        message: "Arrange",
        signal: new AbortController().signal,
        budget: { maxRequests: 2 },
      });
      assert.equal(result.report.evaluations, 1);
      assert.equal(result.report.stopReason, "request-budget");
      assert.equal(result.report.candidateId, "trial-1");
    });
  }),
  defineTest("cancellation during execution stops before another model call", async () => {
    const { stage, problem } = await fixture();
    const abort = new AbortController();
    await withModel([design()], async (requests) => {
      await assert.rejects(
        runCompoundAiLayout({
          settings,
          problem,
          currentStage: stage,
          message: "Arrange",
          signal: abort.signal,
          execute: async (input) => {
            abort.abort();
            return executeCompoundDecision(input);
          },
        }),
        /cancelled/,
      );
      assert.equal(requests.length, 1);
    });
  }),
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
        protocolVersion: 2,
        action: "revise",
        review: review(),
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
      protocolVersion: 2,
      action: "revise",
      review: review(),
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
        protocolVersion: 2,
        action: "revise",
        review: review(),
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
        protocolVersion: 2,
        action: "revise",
        review: review(),
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
        protocolVersion: 2,
        action: "revise",
        review: review(),
        hypothesis: "Invalid move",
        baseCandidateId: "current",
        baseRevision: 0,
        changes: [{ type: "move-node", id: "a", position: [10, 10] }],
      },
    });
    assert.match(rejected.error!, /External node is fixed/);
  }),
]);
