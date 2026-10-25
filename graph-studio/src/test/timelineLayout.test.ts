import { createLayoutResult } from "../schema/layoutResult";
import assert from "node:assert/strict";
import { applyGraphCommand } from "../graph/commands";
import { defaultLayoutSession, parseLayoutSession, repairLayoutSession } from "../schema/layoutSession";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseTimelineLayoutPlan, validateTimelineLayoutPlan } from "../graph/timeline/layoutData";
import { getStageAppearance } from "../layout/shared/appearance";
import type { StageData } from "../layout/shared/types";
import { timelineLayoutContext } from "../layout/timeline/ai/context";
import { parseTimelineLayoutResponse } from "../layout/timeline/ai/protocol";
import { requestTimelineLayout } from "../layout/timeline/ai/request";
import { buildTimelineStage } from "../layout/timeline/layout";
import { evaluateTimelineLayout, type TimelineLayoutInput } from "../layout/timeline/layout-candidate";
import { validateTimelineArrangement } from "../layout/timeline/layout-quality";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import type { GraphAction } from "../app/document/graphActions";
import { graphReducer } from "../app/document/graphReducer";
import { createInitialGraphState } from "../app/document/initialState";
import { defineSuite, defineTest } from "./harness";

function graph(relative = false) {
  const date = (year: number) => (relative ? year - 2000 : String(year));
  return normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: relative ? { clock: { mode: "relative", unit: "minute" } } : { asOf: "2026-01-01" } },
    nodes: {
      a: { title: "Discovery", track: "Research", type: "Research", time: { at: date(2000) } },
      b: {
        title: "Prototype",
        track: "Engineering",
        type: "Engineering",
        time: { start: date(2001), end: date(2010) },
      },
      c: { title: "Delivery", track: "Operations", type: "Operations", time: { at: date(2015) } },
      d: { title: "Follow-up", track: "Research", type: "Research", time: { at: date(2020) } },
      unknown: { title: "Unscheduled", track: "Operations" },
      ...(!relative
        ? {
            ongoing: { title: "Monitoring", track: "Operations", time: { start: "2021", end: null } },
            ancient: { title: "Earlier history", track: "Research", time: { at: "-000220" } },
          }
        : {}),
    },
    edges: [
      { id: "ab", source: "a", target: "b", metadata: { timeline: { kind: "sequence" } } },
      { id: "bc", source: "b", target: "c", metadata: { timeline: { kind: "dependency", sourceTime: date(2005) } } },
      { id: "ad", source: "a", target: "d", metadata: { timeline: { kind: "reference" } } },
    ],
  });
}
const plan = {
  trackOrder: ["Operations", "Engineering", "Research"],
  eventOrder: ["c", "b", "a"],
  edgeRouting: "avoid" as const,
};
const geometry = (stage: StageData) => ({
  nodes: stage.nodes,
  edges: stage.edges,
  width: stage.stageWidth,
  height: stage.stageHeight,
});

export const timelineLayoutSuite = defineSuite("Timeline AI arrangement", [
  defineTest("strict plans reject graph edits, unknown references, duplicate IDs and invalid spacing", () => {
    assert.deepEqual(parseTimelineLayoutPlan(plan), plan);
    for (const extra of [
      { dates: {} },
      { x: 1 },
      { pins: {} },
      { code: "run()" },
      { eventOrder: ["a", "a"] },
      { trackOrder: null },
      { nodeGap: 0 },
      { horizontalSpread: Infinity },
      { edgeRouting: "spline" },
    ])
      assert.throws(() => parseTimelineLayoutPlan({ ...plan, ...extra }));
    assert.throws(
      () => validateTimelineLayoutPlan({ ...plan, eventOrder: ["missing"] }, graph()),
      /Unknown timeline event/,
    );
    assert.throws(
      () => validateTimelineLayoutPlan({ ...plan, trackOrder: ["missing"] }, graph()),
      /Unknown timeline track/,
    );
    assert.throws(() =>
      parseLayoutSession({ ...defaultLayoutSession(), charts: { timeline: { version: 99, mode: "ai" } } }),
    );
  }),
  defineTest("AI changes track geometry while preserving calendar/relative dates, ports and both orientations", () => {
    for (const relative of [false, true])
      for (const orientation of ["vertical", "horizontal"] as const) {
        const dag = graph(relative),
          original = serializeDag(dag);
        const input: TimelineLayoutInput = {
          dag,
          selection: { type: "full" },
          timelineSettings: { layout: "tracks", orientation },
        };
        const base = buildTimelineStage(input)!;
        const result = evaluateTimelineLayout(input, base, plan);
        assert.equal(result.stage.timeline!.tracks[0].id, "Operations");
        assert.ok(result.after.movedEvents > 0);
        assert.deepEqual(result.stage.timeline!.axisMap, base.timeline!.axisMap);
        assert.deepEqual(validateTimelineArrangement(base, result.stage), []);
        assert.deepEqual(serializeDag(dag), original, "Preview must not mutate the document.");
        const bad = structuredClone(result.stage);
        bad.nodes.find((node) => node.key === "a")!.timeline!.startY += 1;
        assert.ok(validateTimelineArrangement(base, bad).length, "A temporal coordinate change must be rejected.");
      }
  }),
  defineTest("AI prioritizes independent chains without breaking sequence alignment, pins or protocol rows", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { time: { at: "2000" } },
        b: { time: { at: "2010" } },
        c: { time: { start: "2000", end: "2010" } },
        pinned: { time: { at: "2000" } },
        row: { time: { at: "2000" }, space: 7 },
      },
      edges: [{ id: "ab", source: "a", target: "b", metadata: { timeline: { kind: "sequence" } } }],
    });
    const appearance = getDefaultChartStyle("timeline").appearance;
    appearance.nodes.spacing.channel = 50;
    appearance.nodes.spread = 1.5;
    const input: TimelineLayoutInput = {
      dag,
      selection: { type: "full" },
      appearance: getStageAppearance(appearance, "timeline"),
      timelineSettings: { layout: "flow", pins: { pinned: 950 } },
    };
    const base = buildTimelineStage(input)!;
    const arranged = evaluateTimelineLayout(input, base, {
      eventOrder: ["c", "a"],
    }).stage;
    assert.notEqual(arranged.nodeMap.a.x, base.nodeMap.a.x);
    assert.equal(arranged.nodeMap.a.x, arranged.nodeMap.b.x);
    assert.equal(arranged.nodeMap.pinned.x, 950);
    assert.equal(arranged.nodeMap.row.timeline!.space, 7);
    assert.equal(arranged.nodeMap.row.x, arranged.nodeMap.row.timeline!.minimumCross! + 6 * (55.2 + 50) * 1.5);
  }),
  defineTest("saved AI profiles toggle reversibly and the applied layout matches the evaluated preview", () => {
    const dag = graph(),
      original = serializeDag(dag);
    const input: TimelineLayoutInput = { dag, selection: { type: "full" }, timelineSettings: { layout: "tracks" } };
    const algorithm = buildTimelineStage(input)!;
    const preview = evaluateTimelineLayout(input, algorithm, plan);
    const layout = defaultLayoutSession();
    layout.charts.timeline = { version: 1, mode: "ai", plan };
    const loaded = parseLayoutSession(JSON.parse(JSON.stringify(layout)));
    assert.deepEqual(
      geometry(buildTimelineStage({ ...input, arrangement: loaded.charts.timeline.plan })!),
      geometry(preview.stage),
    );
    assert.deepEqual(geometry(buildTimelineStage({ ...input, arrangement: null })!), geometry(algorithm));
    assert.deepEqual(serializeDag(dag), original);
  }),
  defineTest("committing is one undoable edit and stale document/history results are rejected", () => {
    let state = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      documentId: "timeline-ai-test",
      dag: graph(),
      fileName: "timeline.json",
      selection: { type: "full" },
      status: "Loaded",
    });
    state = graphReducer(state, { type: "chartTypeChanged", chartType: "timeline" });
    const before = state;
    const action: GraphAction = {
      type: "timelineLayoutCommitted",
      generation: state.document.generation,
      revision: state.editHistory.revision,
      historyBase: state.editHistory,
      beforeDag: state.dag!,
      data: { version: 1, mode: "ai", plan },
    };
    state = graphReducer(state, action);
    assert.equal(state.editHistory.undoStack.length, 1);
    assert.equal(state.layoutSession.data.charts.timeline.mode, "ai");
    state = graphReducer(state, { type: "undoRequested" });
    assert.equal(state.layoutSession.data.charts.timeline.mode, "algorithm");
    assert.equal(graphReducer(state, action).dag, state.dag, "Undo must not revive a stale preview.");
    state = graphReducer(state, { type: "redoRequested" });
    assert.deepEqual(state.layoutSession.data.charts.timeline.plan, plan);
    assert.equal(graphReducer(before, { ...action, generation: before.document.generation + 1 }).dag, before.dag);
    assert.deepEqual(state.dag!.nodes, before.dag!.nodes);
    assert.deepEqual(state.dag!.edges, before.dag!.edges);
  }),
  defineTest("rename and delete repair independent event references", () => {
    let layout = defaultLayoutSession();
    layout.charts.timeline = { version: 1, mode: "ai", plan };
    let dag = applyGraphCommand(graph(), { type: "renameNode", oldKey: "b", newKey: "prototype" }).dag;
    layout = repairLayoutSession(layout, dag, [{ from: "b", to: "prototype" }]);
    assert.deepEqual(layout.charts.timeline.plan!.eventOrder, ["c", "prototype", "a"]);
    dag = applyGraphCommand(dag, { type: "deleteNode", key: "c" }).dag;
    layout = repairLayoutSession(layout, dag);
    assert.deepEqual(layout.charts.timeline.plan!.eventOrder, ["prototype", "a"]);
    assert.equal(dag.metadata?.layout, undefined);
  }),
  defineTest("model context preserves all visible layout data without sampling or shortening titles", () => {
    const dag = serializeDag(graph());
    for (let i = 0; i < 200; i++)
      dag.nodes[`extra-${i}`] = {
        title: "x".repeat(500),
        track: "Research",
        time: { at: "2000" },
        secret: "not-for-layout",
      };
    const input: TimelineLayoutInput = { dag: normalizeDagInput(dag), selection: { type: "full" } };
    const context = timelineLayoutContext(input, buildTimelineStage(input)!, "extra-199");
    assert.equal(context.sampledEvents, context.totalEvents);
    assert.ok(context.sampledEvents > 160);
    assert.equal(context.truncated, false);
    assert.equal(context.events[0].id, "extra-199");
    assert.equal(context.events[0].title.length, 500);
    const order = context.events.map((node) => node.id);
    assert.deepEqual(parseTimelineLayoutResponse({ version: 1, plan: { eventOrder: order } }).plan.eventOrder, order);
    assert.ok(!JSON.stringify(context).includes("not-for-layout"));
    assert.equal(
      context.tracks.reduce((sum, track) => sum + track.events, 0),
      context.totalEvents,
    );
  }),
  defineTest(
    "provider requests use the configured model, repair invalid JSON once and never execute graph commands",
    async () => {
      const layout = createLayoutResult(
        buildTimelineStage({ dag: graph(), selection: { type: "full" }, timelineSettings: { layout: "tracks" } })!,
        "timeline",
      );
      const original = globalThis.fetch;
      const requests: Record<string, unknown>[] = [];
      globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
        if (!init.body) return new Response(JSON.stringify({ data: [] }));
        requests.push(JSON.parse(init.body));
        const content =
          requests.length === 1
            ? '{"commands":["/rm a"]}'
            : JSON.stringify({ action: "evaluate", hypothesis: "Order tracks", layout });
        return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
      }) as unknown as typeof fetch;
      try {
        const response = await requestTimelineLayout(
          {
            provider: "openai-compatible",
            baseUrl: "http://localhost/mock",
            model: "configured-model",
            apiKey: "",
          },
          timelineLayoutContext(
            { dag: graph(), selection: { type: "full" }, timelineSettings: { layout: "tracks" } },
            buildTimelineStage({ dag: graph(), selection: { type: "full" }, timelineSettings: { layout: "tracks" } })!,
          ),
          "Group related tracks",
          new AbortController().signal,
        );
        assert.equal(requests.length, 2);
        assert.equal(requests[0].model, "configured-model");
        assert.equal(response.action, "evaluate");
        if (response.action === "evaluate") assert.deepEqual(response.layout, layout);
        assert.throws(() => parseTimelineLayoutResponse(JSON.stringify({ version: 1, plan, commands: [] })));
      } finally {
        globalThis.fetch = original;
      }
    },
  ),
]);
