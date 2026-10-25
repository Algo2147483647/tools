import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import LayoutSchema from "../components/settings/LayoutSchema";
import { layoutGeometryFields, layoutFieldValues, layoutFieldSummary } from "../schema/layoutGeometryFields";
import assert from "node:assert/strict";
import { normalizeDagInput } from "../graph/normalize";
import { defaultSpaceView } from "../graph/space";
import {
  defaultLayoutDocument,
  parseLayoutDocument,
  repairLayoutDocument,
  createChartLayoutDocument,
} from "../schema/layoutProtocol";
import {
  captureLayoutGeometry,
  restoreLayoutGeometry,
  graphLayoutIdentity,
  layoutIdentity,
  renderingMatches,
  renderingSettings,
} from "../schema/layoutGeometry";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { buildTimelineStage } from "../layout/timeline/layout";
import { buildStageData } from "../layout/node-link/layout";
import { buildSpatialStage } from "../layout/spatial/layout";
import { buildCompoundStage } from "../layout/compound/layout";
import { serializeDag } from "../graph/serialize";
import { evaluateTimelineLayout, type TimelineLayoutInput } from "../layout/timeline/layout-candidate";
import { validateTimelineArrangement } from "../layout/timeline/layout-quality";
import { projectTimelineStage } from "../layout/timeline/project";
import { parseTimelineLayoutPlan } from "../graph/timeline/layoutData";
import { graphReducer } from "../app/document/graphReducer";
import { createInitialGraphState } from "../app/document/initialState";
import { readLinkedLayout } from "../workspace/linkedLayout";
import { runTimelineAiLayout } from "../layout/timeline/ai/workflow";
import { getStageAppearance } from "../layout/shared/appearance";
import { defineSuite, defineTest } from "./harness";

function assertNodeAndEdgeFields(
  stage: NonNullable<ReturnType<typeof buildTimelineStage>>,
  chart: Parameters<typeof layoutGeometryFields>[0],
) {
  const paths = new Set(layoutGeometryFields(chart).map((field) => field.path));
  function visit(value: unknown, path: string) {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      if (value.every((entry) => entry === null || typeof entry !== "object")) {
        assert.ok(paths.has(path) || paths.has(`${path}[]`), `Missing field ${path}`);
      } else value.forEach((entry) => visit(entry, `${path}[]`));
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
    } else assert.ok(paths.has(path), `Missing field ${path}`);
  }
  visit(stage.nodes, "layout.geometry.nodes");
  visit(stage.edges, "layout.geometry.edges");
}

export function timelineFixture(orientation: "vertical" | "horizontal" = "vertical") {
  const dag = normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: { clock: { mode: "relative", unit: "minute" } } },
    nodes: {
      a: { title: "Start", track: "A", time: { at: 0 } },
      b: { title: "Work", track: "B", time: { start: 2, end: 8 } },
      c: { title: "Finish", track: "A", time: { at: 10 } },
    },
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ],
  });
  const settings = { ...getDefaultChartStyle("timeline").timeline!, orientation };
  const input: TimelineLayoutInput = { dag, selection: { type: "full" }, timelineSettings: settings, now: 0 };
  const stage = buildTimelineStage(input)!;
  const document = defaultLayoutDocument();
  const scope = {
    selection: input.selection,
    compound: { focusGroupId: null, collapsedGroupIds: [] },
    activeType: "",
    activeTrack: "",
    timelineRange: null,
    spatial: defaultSpaceView(null),
  };
  document.activeChart = "timeline";
  document.renderings = {
    timeline: {
      graphFingerprint: graphLayoutIdentity(dag),
      settingsFingerprint: layoutIdentity(renderingSettings("timeline", document.charts, scope, settings)),
      scope,
      timelineSettings: settings,
      geometry: captureLayoutGeometry(stage),
    },
  };
  return { input, dag, settings, stage, document, scope };
}

export const layoutPersistenceSuite = defineSuite("Layout rendering persistence and timeline AI", [
  defineTest("each Layout file and Schema contains only its chart type", () => {
    const { document } = timelineFixture();
    for (const chart of ["compound", "timeline", "node-link", "sankey", "spatial"] as const) {
      const file = createChartLayoutDocument(document, chart);
      assert.equal(file.chartType, chart);
      assert.ok(!("charts" in file) && !("renderings" in file));
      const markup = renderToStaticMarkup(createElement(LayoutSchema, { value: document, chartType: chart }));
      const fields = layoutGeometryFields(chart);
      assert.equal(new Set(fields.map((field) => field.path)).size, fields.length, "No duplicate geometry fields");
      for (const path of [
        "nodes[].key",
        "nodes[].x",
        "nodes[].y",
        "nodes[].width",
        "nodes[].height",
        "nodes[].titleLayout.lines",
        "nodes[].contentLayout.titleY",
        "edges[].points[].x",
        "edges[].labelPosition.y",
      ])
        assert.ok(markup.includes(`layout.geometry.${path}`), `Missing ${chart} field ${path}`);
      if (chart !== "timeline") {
        assert.ok(!markup.includes("geometry.timeline"));
        assert.ok(!markup.includes("nodes[].timeline"));
        assert.ok(!markup.includes("plan.placements"));
        assert.ok(!("view" in file.layout.settings));
      }
      if (chart !== "compound") assert.ok(!markup.includes("compoundGeometry"));
      if (chart !== "spatial") assert.ok(!markup.includes("geometry.spatial"));
      if (chart !== "sankey") assert.ok(!markup.includes("nodes[].flow"));
      if (chart === "compound") assert.ok(markup.includes("compoundGeometry.routes[id].points[].y"));
      if (chart === "timeline") assert.ok(markup.includes("nodes[].timeline.ports[].time"));
      if (chart === "spatial") assert.ok(markup.includes("nodes[].spatial.coordinates"));
      assert.equal(parseLayoutDocument(file).activeChart, chart);
    }
  }),
  defineTest("geometry Schema resolves array children, ID maps and missing optional fields", () => {
    const { document, stage } = timelineFixture();
    const file = createChartLayoutDocument(document, "timeline");
    assert.deepEqual(
      layoutFieldValues(file, "layout.geometry.nodes[].key"),
      stage.nodes.map((node) => node.key),
    );
    assert.deepEqual(
      layoutFieldValues(file, "layout.geometry.edges[].points[].x"),
      stage.edges.flatMap((edge) => edge.points?.map((point) => point.x) ?? []),
    );
    assert.equal(layoutFieldSummary(file, "layout.geometry.nodes[]"), "3 items");
    assert.equal(layoutFieldSummary(file, "layout.geometry.nodes[].missing"), "—");
    assert.deepEqual(layoutFieldValues({ boxes: { a: { x: 12 }, b: { x: 24 } } }, "boxes[id].x"), [12, 24]);
    assert.ok(layoutFieldSummary(file, "layout.geometry.nodes[].x") !== "—");
    assert.equal(layoutFieldSummary({ a: null }, "a"), "null");
    assertNodeAndEdgeFields(stage, "timeline");
  }),
  defineTest("exact event/label coordinates and routes survive evaluation, both orientations and JSON reload", () => {
    for (const orientation of ["vertical", "horizontal"] as const) {
      const { input, stage } = timelineFixture(orientation);
      const axis = orientation === "vertical" ? "x" : "y";
      const plan = { placements: [{ id: "b", cross: stage.nodeMap.b[axis] + 151, label: { x: 510, y: 620 } }] };
      const moved = evaluateTimelineLayout(input, stage, plan);
      assert.equal(moved.stage.nodeMap.b[axis], plan.placements[0].cross);
      assert.equal(moved.stage.nodeMap.b.timeline!.labelX, 510);
      assert.equal(moved.stage.nodeMap.b.timeline!.labelY, 620);
      assert.deepEqual(validateTimelineArrangement(stage, moved.stage), []);
      const edge = moved.stage.edges[0];
      const route = { id: edge.id, points: edge.points!.map(({ x, y }) => ({ x, y })), label: { x: 401, y: 402 } };
      route.points.splice(1, 0, { x: 700, y: 700 });
      const routed = evaluateTimelineLayout(input, stage, { ...plan, routes: [route] }).stage;
      assert.deepEqual(
        routed.edges[0].points!.map(({ x, y }) => ({ x, y })),
        route.points,
      );
      assert.deepEqual(routed.edges[0].labelPosition, route.label);
      const restored = restoreLayoutGeometry(JSON.parse(JSON.stringify(captureLayoutGeometry(routed))), stage);
      assert.deepEqual(captureLayoutGeometry(restored), captureLayoutGeometry(routed));
      assert.equal(projectTimelineStage(restored, new Set(["a", "b", "c"])), restored);
      assert.throws(
        () =>
          evaluateTimelineLayout(input, stage, {
            routes: [
              {
                ...route,
                points: [
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ],
              },
            ],
          }),
        /attach/,
      );
      assert.throws(
        () =>
          evaluateTimelineLayout(
            { ...input, timelineSettings: { ...input.timelineSettings, pins: { b: stage.nodeMap.b[axis] } } },
            stage,
            plan,
          ),
        /pinned/,
      );
    }
  }),
  defineTest("full geometry round-trips for nested, node-link, Sankey and spatial charts", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "A" }, b: { title: "B" } },
      edges: [{ id: "ab", source: "a", target: "b", value: 3 }],
    });
    const compound = await buildCompoundStage({
      dag,
      view: { focusGroupId: null, collapsedGroupIds: [] },
      layout: defaultLayoutDocument().charts.compound,
      appearance: getStageAppearance(getDefaultChartStyle("compound").appearance),
      showEdgeLabels: true,
      selectedType: "",
      showNodeDetail: true,
      alignNodeWidthsToMax: false,
    });
    const spatialDag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      metadata: { space: { dimensions: 2, coordinateSystem: "cartesian" } },
      nodes: { a: { coordinates: [0, 0] }, b: { coordinates: [1, 2] } },
      edges: [],
    });
    const stages = [
      compound,
      buildStageData({ dag, selection: { type: "full" }, layoutMode: "sugiyama" }),
      buildStageData({ dag, selection: { type: "full" }, layoutMode: "sankey" }),
      buildSpatialStage({ dag: spatialDag, spaceView: defaultSpaceView(null) }),
    ];
    for (const stage of stages) {
      assert.ok(stage);
      const fixture = timelineFixture();
      const chart = ["compound", "sankey", "spatial"].includes(stage!.layoutMode)
        ? (stage!.layoutMode as "compound" | "sankey" | "spatial")
        : "node-link";
      assertNodeAndEdgeFields(stage!, chart);
      fixture.document.renderings = {
        [chart]: { ...fixture.document.renderings!.timeline!, geometry: captureLayoutGeometry(stage!) },
      };
      const document = parseLayoutDocument(JSON.parse(JSON.stringify(fixture.document)));
      assert.deepEqual(
        captureLayoutGeometry(restoreLayoutGeometry(document.renderings![chart]!.geometry, stage!)),
        captureLayoutGeometry(stage!),
      );
    }
  }),
  defineTest(
    "linked rendering restores settings and exact geometry, and graph/settings changes invalidate it",
    async () => {
      const { document, dag, stage, scope, settings } = timelineFixture("horizontal");
      const linkedDag = normalizeDagInput({
        ...serializeDag(dag),
        metadata: { ...dag.metadata, layout: "graph.layout.json" },
      });
      const loaded = await readLinkedLayout(linkedDag, "graph.json", {
        name: "test",
        handle: null,
        files: new Map([
          [
            "graph.layout.json",
            {
              path: "graph.layout.json",
              handle: null,
              file: new File([JSON.stringify(createChartLayoutDocument(document, "timeline"))], "graph.layout.json"),
            },
          ],
        ]),
      });
      assert.equal(loaded.layoutNotice, undefined);
      assert.deepEqual(loaded.linkedLayout, document);
      const state = graphReducer(createInitialGraphState(), {
        type: "graphLoaded",
        dag: linkedDag,
        documentId: "test",
        fileName: "graph.json",
        selection: { type: "full" },
        status: "",
        linkedLayout: loaded.linkedLayout,
      });
      assert.equal(state.chartType, "timeline");
      assert.equal(state.timelineSettings.orientation, "horizontal");
      const rendering = document.renderings!.timeline!;
      assert.ok(
        renderingMatches(rendering, linkedDag, renderingSettings("timeline", document.charts, scope, settings), stage),
      );
      assert.ok(
        !renderingMatches(
          rendering,
          linkedDag,
          renderingSettings("timeline", document.charts, scope, { ...settings, orientation: "vertical" }),
          stage,
        ),
      );
      const raw = serializeDag(dag);
      raw.nodes.a.title = "Changed";
      const changed = normalizeDagInput(raw);
      assert.equal(repairLayoutDocument(document, changed).renderings!.timeline, undefined);
      assert.equal(parseLayoutDocument({ format: "graph-studio-layout", version: 1, charts: {} }).version, 2);
      const bad = structuredClone(document);
      bad.renderings!.timeline!.geometry.nodes[0].x = Infinity;
      assert.throws(() => parseLayoutDocument(bad), /geometry/);
      const bound = graphReducer(state, {
        type: "layoutReferenceBound",
        generation: state.document.generation,
        reference: "updated.layout.json",
      });
      assert.equal(bound.dag!.metadata!.layout, "updated.layout.json");
      assert.equal(graphReducer(bound, { type: "undoRequested" }).dag!.metadata!.layout, "graph.layout.json");
    },
  ),
  defineTest("timeline AI observes quality, revises, explicitly selects and enables DeepSeek thinking", async () => {
    const { input, stage } = timelineFixture();
    const previous = globalThis.fetch;
    const requests: any[] = [];
    const decisions = [
      {
        version: 1,
        action: "evaluate",
        hypothesis: "Separate the branch",
        plan: { placements: [{ id: "b", cross: 820 }] },
      },
      {
        version: 1,
        action: "evaluate",
        hypothesis: "Reduce wasted width",
        plan: { placements: [{ id: "b", cross: 650 }] },
      },
      {
        version: 1,
        action: "finish",
        candidateId: "trial-2",
        summary: "Moved the branch closer while preserving chronology.",
      },
    ];
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      if (!init?.body) return new Response(JSON.stringify({ data: [] }));
      requests.push(JSON.parse(init.body));
      assert.ok(requests.length <= decisions.length);
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(decisions[requests.length - 1]) } }],
        }),
      );
    }) as typeof fetch;
    try {
      const result = await runTimelineAiLayout({
        settings: { provider: "deepseek", baseUrl: "http://localhost/mock", model: "test", apiKey: "" },
        input,
        baseline: stage,
        message: "Arrange",
        signal: new AbortController().signal,
        compute: async (plan) => evaluateTimelineLayout(input, stage, plan),
      });
      assert.equal(result.stage.nodeMap.b.x, 650);
      assert.equal(result.evaluations, 2);
      assert.equal(result.changed, true);
      assert.deepEqual(requests[0].thinking, { type: "enabled" });
      assert.ok(requests[1].messages.at(-1).content.includes('"crossings"'));
      assert.ok(requests[2].messages.at(-1).content.includes("trial-2"));
      assert.ok(!("max_tokens" in requests[0]), "No application output cap");
    } finally {
      globalThis.fetch = previous;
    }
  }),
  defineTest("large plans are not clipped and cancellation never commits a partial candidate", async () => {
    assert.equal(
      parseTimelineLayoutPlan({ eventOrder: Array.from({ length: 2501 }, (_, i) => `event-${i}`) }).eventOrder.length,
      2501,
    );
    const { input, stage } = timelineFixture();
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      runTimelineAiLayout({
        settings: { provider: "openai-compatible", baseUrl: "http://localhost", model: "test", apiKey: "" },
        input,
        baseline: stage,
        message: "Arrange",
        signal: abort.signal,
        compute: async () => {
          throw new Error("Should not compute");
        },
      }),
      /cancelled/,
    );
  }),
]);
