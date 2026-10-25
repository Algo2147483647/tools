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
  migrateLayoutGeometry,
  validateLayoutGeometryData,
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
  const geometry = captureLayoutGeometry(stage);
  visit(geometry.nodes, "layout.geometry.nodes");
  visit(geometry.edges, "layout.geometry.edges");
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
  defineTest("v3 persists pure tuple geometry and restores current graph content and Appearance", () => {
    const { stage, document, dag } = timelineFixture();
    const file = createChartLayoutDocument(document, "timeline");
    assert.equal(file.version, 3);
    const json = JSON.stringify(file);
    for (const content of [
      '"displayTitle"',
      '"detail"',
      '"detailLines"',
      '"colorTokens"',
      '"source"',
      '"target"',
      '"weight"',
      '"layoutQuality"',
      '"compoundGeometry"',
      '"pointMarker"',
      '"typeColors"',
    ])
      assert.ok(!json.includes(content), `Unexpected content: ${content}`);
    assert.ok(!json.includes('"Work"'));
    assert.deepEqual(file.layout.geometry!.nodes[0].position, [stage.nodes[0].x, stage.nodes[0].y]);
    const fresh = structuredClone(stage);
    fresh.nodes[0].title = "Current graph title";
    fresh.nodes[0].displayTitle = "Current graph title";
    fresh.nodes[0].timeline!.color = "#abcdef";
    fresh.nodeMap = Object.fromEntries(fresh.nodes.map((n) => [n.key, n]));
    fresh.edges[0].label = "Current relationship label";
    const restored = restoreLayoutGeometry(file.layout.geometry!, fresh);
    assert.equal(restored.nodes[0].displayTitle, "Current graph title");
    assert.equal(restored.nodes[0].timeline!.color, "#abcdef");
    assert.equal(restored.edges[0].label, "Current relationship label");
    const linkedStyle = getDefaultChartStyle("timeline");
    linkedStyle.timeline!.pointTextColor = "#123456";
    const state = graphReducer(createInitialGraphState(), {
      type: "graphLoaded",
      dag,
      documentId: "pure-layout",
      fileName: "graph.json",
      selection: { type: "full" },
      status: "",
      linkedStyle,
      linkedChartType: "timeline",
      linkedLayout: parseLayoutDocument(file),
    });
    assert.equal(state.timelineSettings.pointTextColor, "#123456", "Layout must not override linked Appearance");
    for (const invalid of [
      { ...file.layout.geometry!, nodes: [{ ...file.layout.geometry!.nodes[0], displayTitle: "stale text" }] },
      { ...file.layout.geometry!, nodes: [{ ...file.layout.geometry!.nodes[0], position: [1, 2, 3] }] },
      { ...file.layout.geometry!, nodes: [{ ...file.layout.geometry!.nodes[0], position: [1, Infinity] }] },
    ])
      assert.throws(() => validateLayoutGeometryData(invalid, "timeline"));
  }),
  defineTest("v2 renderer payloads upgrade to v3 without keeping content or losing geometry", () => {
    const { stage, document, dag, scope, settings } = timelineFixture("horizontal");
    function legacyGeometry(s: typeof stage): unknown {
      const {
        dag: _dag,
        nodeMap: _map,
        connectedKeysByNode: _connections,
        compoundLayout: _compound,
        timeline,
        ...rest
      } = s;
      const { canonicalStage, ...time } = timeline ?? {};
      return {
        ...rest,
        timeline: { ...time, ...(canonicalStage ? { canonicalStage: legacyGeometry(canonicalStage) } : {}) },
      };
    }
    const legacy = legacyGeometry(stage);
    assert.deepEqual(migrateLayoutGeometry(legacy), captureLayoutGeometry(stage));
    const old = { ...createChartLayoutDocument(document, "timeline"), version: 2 };
    const loaded = parseLayoutDocument({ ...old, layout: { ...old.layout, geometry: legacy } });
    const rendering = loaded.renderings!.timeline!;
    assert.ok(renderingMatches(rendering, dag, renderingSettings("timeline", loaded.charts, scope, settings), stage));
    assert.deepEqual(
      captureLayoutGeometry(restoreLayoutGeometry(rendering.geometry, stage)),
      captureLayoutGeometry(stage),
    );
    assert.equal(createChartLayoutDocument(loaded, "timeline").version, 3);
    assert.throws(() => parseLayoutDocument({ ...old, version: 3, layout: { ...old.layout, geometry: legacy } }));
  }),
  defineTest("saved timeline plans use tuple points while AI and solver keep their own protocol", () => {
    const { document } = timelineFixture();
    const plan = parseTimelineLayoutPlan({
      placements: [{ id: "b", cross: 760, label: { x: 790, y: 190 } }],
      routes: [
        {
          id: "ab",
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
          label: { x: 5, y: 6 },
        },
      ],
    });
    document.charts.timeline = { version: 1, mode: "ai", plan };
    const file = createChartLayoutDocument(document, "timeline");
    assert.deepEqual((file.layout.settings.plan as any).placements[0].label, [790, 190]);
    assert.deepEqual((file.layout.settings.plan as any).routes[0].points, [
      [1, 2],
      [3, 4],
    ]);
    assert.deepEqual(parseLayoutDocument(file).charts.timeline.plan, plan);
    assert.deepEqual(document.charts.timeline.plan, plan, "Saving does not mutate the AI/solver plan");
    (file.layout.settings.plan as any).routes[0].points[0] = [1];
    assert.throws(() => parseLayoutDocument(file));
  }),
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
        "nodes[].id",
        "nodes[].position",
        "nodes[].size",
        "nodes[].text.title",
        "nodes[].text.content",
        "edges[].points[]",
        "edges[].label",
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
      if (chart === "compound") assert.ok(markup.includes("groups[].position"));
      if (chart === "timeline") assert.ok(markup.includes("nodes[].timeline.ports[]"));
      if (chart === "spatial") assert.ok(markup.includes("nodes[].spatial.depth"));
      assert.equal(parseLayoutDocument(file).activeChart, chart);
    }
  }),
  defineTest("geometry Schema resolves array children, ID maps and missing optional fields", () => {
    const { document, stage } = timelineFixture();
    const file = createChartLayoutDocument(document, "timeline");
    assert.deepEqual(
      layoutFieldValues(file, "layout.geometry.nodes[].id"),
      stage.nodes.map((node) => node.key),
    );
    assert.deepEqual(
      layoutFieldValues(file, "layout.geometry.edges[].points[][0]"),
      stage.edges.flatMap((edge) => edge.points?.map((point) => point.x) ?? []),
    );
    assert.equal(layoutFieldSummary(file, "layout.geometry.nodes[]"), "3 items");
    assert.equal(layoutFieldSummary(file, "layout.geometry.nodes[].missing"), "—");
    assert.deepEqual(layoutFieldValues({ boxes: { a: { x: 12 }, b: { x: 24 } } }, "boxes[id].x"), [12, 24]);
    assert.ok(layoutFieldSummary(file, "layout.geometry.nodes[].position") !== "—");
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
      nodes: { a: { title: "A" }, b: { title: "B" }, group: { title: "Group" } },
      edges: [{ id: "ab", source: "a", target: "b", value: 3 }],
      hierarchy_edges: [{ id: "ga", source: "group", target: "a" }],
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
      if (stage!.compoundLayout) {
        const restored = restoreLayoutGeometry(captureLayoutGeometry(stage!), stage!);
        assert.deepEqual(restored.compoundLayout!.baseline, stage!.compoundLayout.baseline);
        assert.deepEqual(restored.nodeMap.group, stage!.nodeMap.group);
      }
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
      assert.deepEqual(
        createChartLayoutDocument(loaded.linkedLayout!, "timeline"),
        createChartLayoutDocument(document, "timeline"),
      );
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
      bad.renderings!.timeline!.geometry.nodes[0].position[0] = Infinity;
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
