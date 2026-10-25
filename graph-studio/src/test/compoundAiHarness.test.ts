import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AiSettings } from "../ai/types";
import { requestToolTurn } from "../ai/transport/toolConversation";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { emptyLayoutData } from "../graph/compound/layoutData";
import { buildCompoundStage } from "../layout/compound/layout";
import { getStageAppearance } from "../layout/shared/appearance";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { defaultLayoutSession, parseLayoutSession, repairLayoutSession } from "../schema/layoutSession";
import { createLayoutResult } from "../schema/layoutResult";
import { runCompoundAiLayout, type CompoundCheckpoint } from "../layout/compound/ai/workflow";
import { compareLayoutMetrics } from "../layout/compound/layout-quality";
import { executeCompoundDecision, type CompoundExecutionInput } from "../layout/compound/ai/execute";
import { applyLayoutResult } from "../layout/shared/applyLayoutResult";
import { inspectDraft } from "../layout/compound/ai/geometry";
import { validateDesign, type CompoundDesign } from "../layout/compound/ai/design";
import { graphOverview, inspectGraph, inspectLayout } from "../layout/compound/ai/observation";
import { LAYOUT_TOOLS } from "../layout/compound/ai/protocol";
import { assertCompoundGeometry } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

const settings: AiSettings = { provider: "deepseek", baseUrl: "https://fixture.invalid", apiKey: "", model: "fixture" };
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
const designPlan = (): CompoundDesign => ({
  purpose: "Explain the chain",
  readingPath: ["a", "b", "c"],
  regions: [{ id: "g", role: "primary", reason: "Main flow" }],
  scopes: [
    { groupId: null, direction: "RIGHT", rows: [["g"]], reason: "Core" },
    { groupId: "g", direction: "RIGHT", primaryPath: ["a", "b", "c"], reason: "Read forward" },
  ],
  connections: [],
});
const ref = (candidateId = "trial-1", revision = 1) => ({ candidateId, revision });
const call = (name: string, args: unknown, id?: string) => ({ name, args, id });
const compose = (plan = designPlan(), base = ref("current", 0), id?: string) =>
  call("compose_layout", { ...base, hypothesis: "Explain flow", design: plan }, id);
const inspect = (base = ref()) => call("inspect_layout", { ...base, scopeId: null, nodeIds: [], includeRoutes: false });
const finish = (base = ref()) =>
  call("finish_layout", {
    ...base,
    summary: "The flow is understandable.",
    review: { readingFlow: "Forward", hierarchy: "Contained", relationships: "Actual graph relations", tradeoffs: [] },
  });
async function withModel(turns: ReturnType<typeof call>[][], run: (requests: any[]) => Promise<void>) {
  const old = globalThis.fetch,
    requests: any[] = [];
  globalThis.fetch = (async (_url, init) => {
    if (!init?.body) return new Response(JSON.stringify({ data: [] }));
    requests.push(JSON.parse(String(init.body)));
    assert.ok(requests.length <= turns.length, "Unexpected model call");
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "",
              reasoning_content: `reason-${requests.length}`,
              tool_calls: turns[requests.length - 1].map((c, i) => ({
                id: c.id ?? `call-${requests.length}-${i}`,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            },
          },
        ],
      }),
    );
  }) as typeof fetch;
  try {
    await run(requests);
  } finally {
    globalThis.fetch = old;
  }
}
const runOptions = (f: Awaited<ReturnType<typeof fixture>>) => ({
  settings,
  problem: f.problem,
  currentStage: f.stage,
  message: "Arrange",
  signal: new AbortController().signal,
});

export const compoundAiHarnessSuite = defineSuite("Compound layout tools", [
  defineTest("native provider reasoning signatures survive tool-result round trips", async () => {
    for (const provider of ["anthropic", "gemini", "ollama"] as const) {
      const old = globalThis.fetch,
        requests: any[] = [];
      const block = { type: "thinking", thinking: "Consider scope", signature: "signed-opaque" };
      const part = {
        functionCall: { name: "inspect_graph", args: { scopeId: null, nodeIds: [] } },
        thoughtSignature: "signed-opaque",
      };
      globalThis.fetch = (async (url, init) => {
        if (!init?.body)
          return new Response(
            JSON.stringify(String(url).includes("/v1/models/") ? { max_tokens: 8192 } : { data: [] }),
          );
        requests.push(JSON.parse(String(init.body)));
        const j =
          provider === "anthropic"
            ? {
                content: [
                  block,
                  { type: "tool_use", id: "a", name: "inspect_graph", input: { scopeId: null, nodeIds: [] } },
                ],
                stop_reason: "tool_use",
              }
            : provider === "gemini"
              ? { candidates: [{ content: { parts: [part] }, finishReason: "STOP" }] }
              : {
                  message: {
                    content: "",
                    thinking: "Consider scope",
                    tool_calls: [{ function: { name: "inspect_graph", arguments: { scopeId: null, nodeIds: [] } } }],
                  },
                  done_reason: "stop",
                };
        return new Response(JSON.stringify(j));
      }) as typeof fetch;
      try {
        const first = await requestToolTurn(
          { ...settings, provider },
          "system",
          [{ role: "user", content: "Arrange" }],
          LAYOUT_TOOLS,
          new AbortController().signal,
          () => {},
        );
        const c = first.assistant.calls[0];
        await requestToolTurn(
          { ...settings, provider },
          "system",
          [
            { role: "user", content: "Arrange" },
            first.assistant,
            { role: "tool", callId: c.id, name: c.name, content: '{"nodes":[]}' },
          ],
          LAYOUT_TOOLS,
          new AbortController().signal,
          () => {},
        );
        const r = requests[1];
        if (provider === "anthropic") {
          assert.deepEqual(r.messages[1].content[0], block);
          assert.equal(r.messages[2].content[0].tool_use_id, "a");
        } else if (provider === "gemini") {
          assert.deepEqual(r.contents[1].parts[0], part);
          assert.equal(r.contents[2].parts[0].functionResponse.name, "inspect_graph");
        } else {
          assert.equal(r.messages[2].thinking, "Consider scope");
          assert.equal(r.messages[3].tool_name, "inspect_graph");
          assert.equal(typeof r.messages[2].tool_calls[0].function.arguments, "object");
        }
      } finally {
        globalThis.fetch = old;
      }
    }
  }),
  defineTest("idle or overall timeout checkpoints a draft without installing it", async () => {
    for (const idle of [true, false]) {
      const f = await fixture(),
        old = globalThis.fetch;
      let calls = 0,
        cp: CompoundCheckpoint | undefined;
      globalThis.fetch = (async (_url, init) => {
        if (!init?.body) return new Response(JSON.stringify({ data: [] }));
        if (++calls === 1)
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "tool_calls",
                  message: {
                    content: "",
                    tool_calls: [
                      {
                        id: "compose",
                        function: { name: "compose_layout", arguments: JSON.stringify(compose().args) },
                      },
                    ],
                  },
                },
              ],
            }),
          );
        return new Promise<Response>((_resolve, reject) => {
          if (init.signal?.aborted) reject(new Error("aborted"));
          else init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }) as typeof fetch;
      try {
        await assert.rejects(
          runCompoundAiLayout({
            ...runOptions(f),
            budget: { idleTimeoutMs: idle ? 50 : 5000, timeoutMs: idle ? 5000 : 300 },
            onCheckpoint: (c) => {
              cp = c;
            },
          }),
          idle ? /stalled.*Resume/ : /time limit.*Resume/,
        );
        assert.equal(cp!.trials.length, 1);
        assert.equal(cp!.candidates[1].inspectedAt, undefined);
      } finally {
        globalThis.fetch = old;
      }
    }
  }),
  defineTest("streaming reasoning refreshes the idle timer", async () => {
    const f = await fixture(),
      old = globalThis.fetch;
    let count = 0;
    globalThis.fetch = (async (_url, init) => {
      if (!init?.body) return new Response(JSON.stringify({ data: [] }));
      const tool = [compose(), inspect(), finish()][count++];
      const encoder = new TextEncoder();
      let ticks = 0;
      return new Response(
        new ReadableStream({
          start(controller) {
            const timer = setInterval(() => {
              const delta =
                ++ticks < 5
                  ? { reasoning_content: "Working " }
                  : {
                      tool_calls: [
                        {
                          index: 0,
                          id: `stream-${count}`,
                          function: { name: tool.name, arguments: JSON.stringify(tool.args) },
                        },
                      ],
                    };
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta, ...(ticks === 5 ? { finish_reason: "tool_calls" } : {}) }] })}\n\n`,
                ),
              );
              if (ticks === 5) {
                clearInterval(timer);
                controller.close();
              }
            }, 25);
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;
    try {
      const r = await runCompoundAiLayout({ ...runOptions(f), budget: { idleTimeoutMs: 100, timeoutMs: 5000 } });
      assert.equal(r.report.requests, 3);
      assert.ok(r.report.elapsedMs > 300);
    } finally {
      globalThis.fetch = old;
    }
  }),
  defineTest("native tools carry reasoning and text-only scoped results through final selection", async () => {
    const f = await fixture();
    await withModel(
      [[call("inspect_graph", { scopeId: "g", nodeIds: [] })], [compose()], [inspect()], [finish()]],
      async (requests) => {
        const result = await runCompoundAiLayout(runOptions(f));
        assert.equal(result.report.candidateId, "trial-1");
        assert.equal(result.report.requests, 4);
        assert.equal(result.report.tools.length, 4);
        assert.ok(requests.every((r) => r.tools.length === 6 && !r.response_format));
        assert.deepEqual(requests[0].thinking, { type: "enabled" });
        assert.equal(requests[1].messages.find((m: any) => m.role === "assistant").reasoning_content, "reason-1");
        assert.ok(requests[1].messages.some((m: any) => m.role === "tool" && m.tool_call_id === "call-1-0"));
        const first = JSON.parse(requests[0].messages[1].content);
        assert.equal(first.graph.nodes.length, 4);
        assert.ok(!first.graph.currentLayout);
        assert.ok(requests.every((r) => r.messages.every((m: any) => typeof m.content === "string")));
        assertCompoundGeometry(graph(), result.stage, view);
      },
    );
  }),
  defineTest("relative intent changes geometry; conflicting intent returns actionable failure", async () => {
    const f = await fixture(),
      plan = designPlan();
    plan.scopes[1] = {
      groupId: "g",
      direction: "RIGHT",
      reason: "Parallel",
      primaryPath: ["a", "b"],
      parallelBranches: [{ from: "a", members: ["b", "c"] }],
      alignment: [{ members: ["b", "c"], axis: "left" }],
      spacing: [80, 90],
    };
    const r = executeCompoundDecision({
      problem: f.problem,
      baseLayout: createLayoutResult(f.stage, "compound"),
      decision: { action: "compose", design: plan },
    });
    assert.equal(r.error, undefined);
    const result = applyLayoutResult(r.layout, f.stage),
      b = result.compoundLayout!.baseline.boxes;
    assert.equal(b.b.x, b.c.x);
    assert.ok(b.b.x >= b.a.x + b.a.width + 80);
    assert.ok(b.c.y >= b.b.y + b.b.height + 90);
    assert.ok(
      inspectLayout(f.problem, r.layout, plan, null, [], false)
        .intentChecks.filter((c) => c.kind === "parallel-branches")
        .every((c) => c.satisfied),
    );
    plan.scopes[1].placement = [{ subject: "a", relation: "right", anchor: "b" }];
    const bad = executeCompoundDecision({
      problem: f.problem,
      baseLayout: createLayoutResult(f.stage, "compound"),
      decision: { action: "compose", design: plan },
    });
    assert.match(bad.error!, /Conflicting composition/);
    assert.equal(graph().edges.length, 2);
  }),
  defineTest("local composition retains other scopes and alternative candidates remain selectable", async () => {
    const f = await fixture(),
      wide = designPlan();
    wide.scopes[1].spacing = [1000, 80];
    const local = designPlan();
    local.scopes = [{ groupId: "g", direction: "DOWN", primaryPath: ["a", "b", "c"], reason: "Vertical interior" }];
    await withModel(
      [
        [compose(wide)],
        [compose(local, ref())],
        [call("compare_layouts", { left: ref(), right: ref("trial-2", 2) })],
        [finish(ref())],
      ],
      async () => {
        const result = await runCompoundAiLayout(runOptions(f));
        assert.equal(result.report.candidateId, "trial-1");
        assert.ok(result.report.after.length > result.report.before.length, "No baseline quality gate");
        assert.equal(result.report.trials[1].design!.scopes.length, 2);
      },
    );
  }),
  defineTest("premature finish and stale revision are recoverable and cannot mutate a candidate", async () => {
    const f = await fixture();
    await withModel(
      [
        [compose()],
        [
          finish(),
          call("edit_layout", {
            ...ref("trial-1", 99),
            hypothesis: "Stale",
            changes: [{ type: "move-node", id: "a", position: [1, 1] }],
          }),
        ],
        [inspect(), finish()],
        [finish()],
      ],
      async () => {
        const result = await runCompoundAiLayout(runOptions(f));
        assert.equal(result.report.evaluations, 1);
        assert.equal(result.report.tools.filter((t) => !t.ok).length, 3);
        assert.match(JSON.stringify(result.report.tools), /stale revision/);
      },
    );
  }),
  defineTest("replayed tool IDs execute once, changed arguments with the same ID are rejected", async () => {
    const f = await fixture();
    await withModel(
      [
        [compose(designPlan(), ref("current", 0), "repeat")],
        [compose(designPlan(), ref("current", 0), "repeat")],
        [call("inspect_graph", { scopeId: null, nodeIds: [] }, "repeat"), inspect()],
        [finish()],
      ],
      async () => {
        const r = await runCompoundAiLayout(runOptions(f));
        assert.equal(r.report.evaluations, 1);
        assert.equal(r.report.tools.filter((t) => !t.ok).length, 1);
      },
    );
  }),
  defineTest("checkpoint resumes pending calls without repeating completed composition", async () => {
    const f = await fixture();
    let cp: CompoundCheckpoint | undefined;
    await withModel([[compose(), inspect()]], async () => {
      await assert.rejects(
        runCompoundAiLayout({
          ...runOptions(f),
          budget: { maxToolCalls: 1 },
          onCheckpoint: (c) => {
            cp = c;
          },
        }),
        /Resume/,
      );
    });
    assert.equal(cp!.pendingIndex, 1);
    assert.equal(cp!.trials.length, 1);
    await withModel([[{ ...finish(), id: "resume-finish" }]], async (requests) => {
      const r = await runCompoundAiLayout({ ...runOptions(f), checkpoint: cp });
      assert.equal(r.report.evaluations, 1);
      assert.equal(requests.length, 1);
      assert.equal(r.report.requests, 2);
    });
    await assert.rejects(
      runCompoundAiLayout({ ...runOptions(f), checkpoint: cp, settings: { ...settings, model: "changed" } }),
      /context changed/,
    );
  }),
  defineTest("cancel preserves completed work and never installs a draft", async () => {
    const f = await fixture(),
      abort = new AbortController();
    let cp: CompoundCheckpoint | undefined;
    await withModel([[compose(), inspect()]], async () => {
      await assert.rejects(
        runCompoundAiLayout({
          ...runOptions(f),
          signal: abort.signal,
          onCheckpoint: (c) => {
            cp = c;
            if (c.trials.length) abort.abort();
          },
        }),
        /cancelled/,
      );
    });
    assert.equal(cp!.trials.length, 1);
    assert.deepEqual(createLayoutResult(f.stage, "compound"), cp!.candidates[0].layout);
  }),
  defineTest("scoped graph inspection retains complete labels and boundary endpoints", async () => {
    const f = await fixture();
    f.problem.nodeSemantics = { a: { type: "service", description: "long".repeat(1000) } };
    assert.equal(graphOverview(f.problem).nodes.find((n) => n.id === "a")!.description!.length, 4000);
    const result = inspectGraph(f.problem, null, ["a"]);
    assert.ok(result.boundaryEndpoints.some((n) => n.id === "b"));
    assert.throws(() => inspectGraph(f.problem, "missing", []));
    const plan = designPlan();
    plan.scopes[1].rows = [["a", "b"]];
    assert.throws(() => validateDesign(f.problem, plan), /exactly once/);
    plan.scopes[1].rows = [["a", "b", "c"]];
    plan.scopes[1].primaryPath = ["missing"];
    assert.throws(() => validateDesign(f.problem, plan), /non-sibling/);
  }),
  defineTest("streamed fragmented tool arguments and reasoning survive native chat transport", async () => {
    const old = globalThis.fetch;
    let body: any;
    globalThis.fetch = (async (_url, init) => {
      if (!init?.body) return new Response(JSON.stringify({ data: [] }));
      body = JSON.parse(String(init.body));
      const chunks = [
        { delta: { reasoning_content: "Inspect first" } },
        {
          delta: {
            tool_calls: [
              { index: 0, id: "abc", type: "function", function: { name: "inspect_graph", arguments: '{"scopeId":' } },
            ],
          },
        },
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: 'null,"nodeIds":[]}' } }] },
          finish_reason: "tool_calls",
        },
      ];
      return new Response(chunks.map((c) => `data: ${JSON.stringify({ choices: [c] })}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;
    try {
      const r = await requestToolTurn(
        settings,
        "system",
        [{ role: "user", content: "Arrange" }],
        LAYOUT_TOOLS,
        new AbortController().signal,
        () => {},
      );
      assert.equal(r.assistant.reasoning, "Inspect first");
      assert.deepEqual(JSON.parse(r.assistant.calls[0].arguments), { scopeId: null, nodeIds: [] });
      assert.equal(body.tools.length, 6);
      assert.equal(body.response_format, undefined);
    } finally {
      globalThis.fetch = old;
    }
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
        action: "edit",
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
    const decision: CompoundExecutionInput["decision"] = {
      action: "edit",
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
        action: "edit",
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
        action: "edit",
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
        action: "edit",
        changes: [{ type: "move-node", id: "a", position: [10, 10] }],
      },
    });
    assert.match(rejected.error!, /External node is fixed/);
  }),
]);
