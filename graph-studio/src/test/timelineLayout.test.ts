import assert from "node:assert/strict";
import { applyGraphCommand } from "../graph/commands";
import { analyzeGraphImport } from "../graph/imports/merge";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import {
parseTimelineLayoutPlan,
readTimelineLayout,
validateTimelineLayoutPlan,
writeTimelineLayout,
} from "../graph/timeline/layoutData";
import { getStageAppearance } from "../layout/shared/appearance";
import type { StageData } from "../layout/shared/types";
import {
parseTimelineLayoutResponse,
requestTimelineLayout,
timelineLayoutContext,
} from "../layout/timeline/ai/request";
import { buildTimelineStage } from "../layout/timeline/layout";
import { evaluateTimelineLayout,type TimelineLayoutInput } from "../layout/timeline/layout-candidate";
import { validateTimelineArrangement } from "../layout/timeline/layout-quality";
import { getDefaultChartStyle } from "../schema/chartStyles";
import type { GraphAction } from "../state/graphActions";
import { graphReducer } from "../state/graphReducer";
import { createInitialGraphState } from "../state/initialState";
import { defineSuite,defineTest } from "./harness";

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
    assert.ok(
      readTimelineLayout({ metadata: { layout: { timeline: { version: 1, mode: "ai", plan: false } } } }).warning,
    );
    assert.ok(readTimelineLayout({ metadata: { layout: { timeline: { version: 99, mode: "ai" } } } }).warning);
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
    const doc = serializeDag(dag);
    writeTimelineLayout(doc, { version: 1, mode: "ai", plan });
    const loaded = normalizeDagInput(JSON.parse(JSON.stringify(doc)));
    assert.deepEqual(geometry(buildTimelineStage({ ...input, dag: loaded })!), geometry(preview.stage));
    writeTimelineLayout(doc, { ...readTimelineLayout(doc).data, mode: "algorithm" });
    assert.deepEqual(readTimelineLayout(doc).data.plan, plan);
    assert.deepEqual(geometry(buildTimelineStage({ ...input, dag: normalizeDagInput(doc) })!), geometry(algorithm));
    assert.deepEqual(doc.nodes, original.nodes);
    assert.deepEqual(doc.edges, original.edges);
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
    assert.equal(readTimelineLayout(state.dag).data.mode, "ai");
    state = graphReducer(state, { type: "undoRequested" });
    assert.equal(readTimelineLayout(state.dag).data.mode, "algorithm");
    assert.equal(graphReducer(state, action).dag, state.dag, "Undo must not revive a stale preview.");
    state = graphReducer(state, { type: "redoRequested" });
    assert.deepEqual(readTimelineLayout(state.dag).data.plan, plan);
    assert.equal(graphReducer(before, { ...action, generation: before.document.generation + 1 }).dag, before.dag);
    assert.deepEqual(state.dag!.nodes, before.dag!.nodes);
    assert.deepEqual(state.dag!.edges, before.dag!.edges);
  }),
  defineTest("rename, delete and conflicting imports keep saved event references valid", () => {
    const doc = serializeDag(graph());
    writeTimelineLayout(doc, { version: 1, mode: "ai", plan });
    let dag = applyGraphCommand(normalizeDagInput(doc), { type: "renameNode", oldKey: "b", newKey: "prototype" }).dag;
    assert.deepEqual(readTimelineLayout(dag).data.plan!.eventOrder, ["c", "prototype", "a"]);
    dag = applyGraphCommand(dag, { type: "deleteNode", key: "c" }).dag;
    assert.deepEqual(readTimelineLayout(dag).data.plan!.eventOrder, ["prototype", "a"]);
    const imports = [
      {
        name: "first.json",
        payload: { format: "graph-studio", version: 3, nodes: { a: { title: "Other" } }, edges: [] },
      },
      { name: "second.json", payload: doc },
    ];
    const conflict = analyzeGraphImport(imports).conflicts.find((item) => item.path === "/nodes/a")!;
    const merged = analyzeGraphImport(imports, { [conflict.id]: { strategy: "rename", name: "imported_a" } });
    assert.equal(merged.unresolved.length, 0);
    assert.deepEqual(readTimelineLayout(merged.dag).data.plan!.eventOrder, ["c", "b", "imported_a"]);
  }),
  defineTest("model context is bounded and only includes layout data", () => {
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
    assert.equal(context.sampledEvents, 160);
    assert.equal(context.truncated, true);
    assert.equal(context.events[0].id, "extra-199");
    assert.equal(context.events[0].title.length, 180);
    assert.ok(!JSON.stringify(context).includes("not-for-layout"));
    assert.equal(
      context.tracks.reduce((sum, track) => sum + track.events, 0),
      context.totalEvents,
    );
  }),
  defineTest(
    "provider requests use the configured model, repair invalid JSON once and never execute graph commands",
    async () => {
      const original = globalThis.fetch;
      const requests: Record<string, unknown>[] = [];
      globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
        requests.push(JSON.parse(init.body));
        const content =
          requests.length === 1
            ? '{"commands":["/rm a"]}'
            : JSON.stringify({ version: 1, explanation: "Group operations first.", plan });
        return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
      }) as unknown as typeof fetch;
      try {
        const response = await requestTimelineLayout(
          {
            provider: "openai-compatible",
            baseUrl: "http://localhost/mock",
            model: "configured-model",
            apiKey: "",
            temperature: 0,
            maxTokens: 1000,
            executionMode: "auto-edit",
          },
          {},
          "Group related tracks",
          new AbortController().signal,
        );
        assert.equal(requests.length, 2);
        assert.equal(requests[0].model, "configured-model");
        assert.deepEqual(response.plan, plan);
        assert.throws(() =>
          parseTimelineLayoutResponse(JSON.stringify({ version: 1, explanation: "Invalid", plan, commands: [] })),
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  ),
]);
