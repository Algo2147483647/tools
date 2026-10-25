import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { projectCompoundGraph } from "../graph/compound/projection";
import { emptyRouting, validateRouting, type RoutingIntent } from "../layout/compound/routing/intent";
import { compileRoutingPlan, channelWidth } from "../layout/compound/routing/plan";
import { routeDesignedEdges } from "../layout/compound/routing/designed";
import { verifyRoutingIntent } from "../layout/compound/routing/verify";
import { diagnoseRoutes } from "../layout/compound/routing/diagnostics";
import { segmentCrossesBox } from "../layout/compound/layout-quality";
import { executeCompoundDecision } from "../layout/compound/ai/execute";
import { inspectLayout } from "../layout/compound/ai/observation";
import { geometryLayout } from "../layout/compound/ai/geometry";
import { createLayoutResult } from "../schema/layoutResult";
import { validateLayoutSchema } from "../schema/layoutResult";
import { designSchema } from "../layout/compound/ai/protocol";
import { defaultLayoutSession, parseLayoutSession, repairLayoutSession } from "../schema/layoutSession";
import { captureLayoutGeometry, graphLayoutIdentity } from "../schema/layoutGeometry";
import { createLayoutConfigFile } from "../schema/layoutConfig";
import { defaultSpaceView } from "../graph/space";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { layoutFixture } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";
import type { CompoundDesign } from "../layout/compound/ai/design";

const view = { collapsedGroupIds: [], focusGroupId: null };
const nested = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: { ga: {}, gb: {}, a: {}, b: {} },
    edges: [{ id: "ab", source: "a", target: "b" }],
    hierarchy_edges: [
      { id: "ha", source: "ga", target: "a" },
      { id: "hb", source: "gb", target: "b" },
    ],
  });
const nestedBoxes = () =>
  new Map([
    ["ga", { x: 50, y: 50, width: 240, height: 300 }],
    ["gb", { x: 450, y: 50, width: 240, height: 300 }],
    ["a", { x: 100, y: 140, width: 100, height: 60 }],
    ["b", { x: 500, y: 210, width: 100, height: 60 }],
  ]);
const bounds = { x: 0, y: 0, width: 800, height: 450 };
const gates = (id: string): RoutingIntent => ({
  channels: [],
  ports: [],
  gateways: [
    { id: "out", regionId: "ga", side: "east", edgeIds: [id], order: "opposite-end", strength: "required" },
    { id: "in", regionId: "gb", side: "west", edgeIds: [id], order: "opposite-end", strength: "required" },
  ],
});

export const compoundRoutingIntentSuite = defineSuite("Compound routing intent", [
  defineTest("required gateways and channels are traversed in order without entering cards", () => {
    const projection = projectCompoundGraph(nested(), view),
      id = projection.edges[0].id,
      boxes = nestedBoxes(),
      intent = gates(id);
    intent.channels.push({
      id: "middle",
      scopeId: null,
      location: { type: "between", regions: ["ga", "gb"] },
      edgeIds: [id],
      strength: "required",
    });
    const before = structuredClone(boxes);
    const result = routeDesignedEdges(projection, boxes, bounds, false, { intent });
    assert.equal(result.routes.size, 1);
    assert.deepEqual(verifyRoutingIntent(projection, boxes, result.routes, bounds, intent, "distributed"), []);
    for (const route of result.routes.values())
      for (let i = 1; i < route.points.length; i++)
        for (const id of ["a", "b"])
          assert.ok(!segmentCrossesBox(route.points[i - 1], route.points[i], boxes.get(id)!));
    assert.deepEqual(boxes, before);
  }),
  defineTest("north gateways provide a controlled crossing of the group title band", () => {
    const projection = projectCompoundGraph(nested(), view),
      id = projection.edges[0].id,
      boxes = nestedBoxes(),
      intent = gates(id);
    intent.gateways[0].side = "north";
    const result = routeDesignedEdges(projection, boxes, bounds, false, { intent });
    assert.deepEqual(verifyRoutingIntent(projection, boxes, result.routes, bounds, intent, "distributed"), []);
  }),
  defineTest("insufficient required channel capacity and unrelated gateway references fail explicitly", () => {
    const projection = projectCompoundGraph(nested(), view),
      id = projection.edges[0].id,
      boxes = nestedBoxes(),
      intent = gates(id);
    boxes.get("gb")!.x = 300;
    intent.channels.push({
      id: "tight",
      scopeId: null,
      location: { type: "between", regions: ["ga", "gb"] },
      edgeIds: [id],
      strength: "required",
    });
    assert.throws(() => compileRoutingPlan(projection, boxes, bounds, intent), /channel-capacity/);
    intent.channels[0].strength = "preferred";
    assert.ok(compileRoutingPlan(projection, boxes, bounds, intent).issues.some((i) => i.kind === "channel-capacity"));
    intent.gateways[0].edgeIds = ["missing"];
    assert.throws(() => validateRouting(projection, intent), /boundary/);
  }),
  defineTest("joint port allocation is spatially ordered and independent of edge input order", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { s: {}, a: {}, b: {}, c: {} },
      edges: ["a", "b", "c"].map((target) => ({ id: target, source: "s", target })),
    });
    const projection = projectCompoundGraph(dag, view),
      boxes = new Map([
        ["s", { x: 80, y: 200, width: 160, height: 100 }],
        ...["a", "b", "c"].map((id, i) => [id, { x: 500, y: 80 + i * 150, width: 160, height: 100 }] as const),
      ]);
    const plan = compileRoutingPlan(projection, boxes, { ...bounds, height: 600 });
    const reversed = compileRoutingPlan({ ...projection, edges: [...projection.edges].reverse() }, boxes, {
      ...bounds,
      height: 600,
    });
    const ys = projection.edges.map((e) => plan.endpoints.get(e.id)!.source.point.y);
    assert.equal(new Set(ys).size, 3);
    assert.deepEqual(
      ys,
      [...ys].sort((a, b) => a - b),
    );
    for (const e of projection.edges) assert.deepEqual(plan.endpoints.get(e.id), reversed.endpoints.get(e.id));
    const routes = routeDesignedEdges(projection, boxes, { ...bounds, height: 600 }, false, { intent: emptyRouting() });
    assert.equal(new Set([...routes.routes.values()].map((r) => JSON.stringify(r.points[0]))).size, 3);
  }),
  defineTest("composition reserves channel capacity and aligns descendant anchors", async () => {
    const stage = await layoutFixture(nested()),
      problem = stage.compoundLayout!,
      id = problem.projection.edges[0].id;
    const design: CompoundDesign = {
      purpose: "Interfaces",
      readingPath: ["a", "b"],
      regions: [],
      connections: [],
      routing: gates(id),
      scopes: [
        {
          groupId: null,
          direction: "RIGHT",
          rows: [["ga", "gb"]],
          spacing: [12, 12],
          reason: "Peer regions",
          anchorAlignment: [
            {
              axis: "y",
              anchors: [
                { nodeId: "a", kind: "center" },
                { nodeId: "b", kind: "center" },
              ],
              strength: "required",
            },
          ],
        },
        { groupId: "ga", direction: "RIGHT", rows: [["a"]], reason: "Entry" },
        { groupId: "gb", direction: "RIGHT", rows: [["b"]], reason: "Exit" },
      ],
    };
    design.routing!.channels.push({
      id: "middle",
      scopeId: null,
      location: { type: "between", regions: ["ga", "gb"] },
      edgeIds: [id],
      strength: "required",
    });
    validateLayoutSchema(design, designSchema, "/design");
    const result = executeCompoundDecision({
      problem,
      baseLayout: createLayoutResult(stage, "compound"),
      decision: { action: "compose", design },
    });
    assert.equal(result.error, undefined);
    const [a, b] = ["a", "b"].map((id) => result.layout.geometry.nodes.find((n) => n.id === id)!);
    assert.equal(a.position[1], b.position[1]);
    const [ga, gb] = ["ga", "gb"].map((id) => result.layout.geometry.groups!.find((n) => n.id === id)!);
    assert.ok(gb.position[0] - ga.position[0] - ga.size[0] >= channelWidth(1));
    const edited = executeCompoundDecision({
      problem,
      baseLayout: result.layout,
      baseDesign: result.design,
      decision: { action: "edit", changes: [{ type: "reroute-together", edgeIds: [id] }] },
    });
    assert.equal(edited.error, undefined);
    assert.deepEqual(edited.design, design);
    assert.deepEqual(edited.layout.geometry.nodes, result.layout.geometry.nodes);
  }),
  defineTest("a manual replacement cannot silently violate a required port", async () => {
    const stage = await layoutFixture(nested()),
      problem = stage.compoundLayout!,
      base = createLayoutResult(stage, "compound"),
      id = problem.projection.edges[0].id;
    const points = base.geometry.edges[0].points!,
      box = problem.baseline.boxes.a;
    const actual =
      points[0][0] === box.x
        ? "west"
        : points[0][0] === box.x + box.width
          ? "east"
          : points[0][1] === box.y
            ? "north"
            : "south";
    const design: CompoundDesign = {
      purpose: "Port",
      readingPath: ["a", "b"],
      regions: [],
      scopes: [],
      connections: [],
      routing: {
        ...emptyRouting(),
        ports: [
          {
            nodeId: "a",
            side: actual === "east" ? "west" : "east",
            ends: [{ edgeId: id, end: "source" }],
            order: "opposite-end",
            strength: "required",
          },
        ],
      },
    };
    const result = executeCompoundDecision({
      problem,
      baseLayout: base,
      baseDesign: design,
      decision: {
        action: "edit",
        changes: [{ type: "replace-route", id, points, label: base.geometry.edges[0].label }],
      },
    });
    assert.match(result.error ?? "", /Required routing intent/);
    assert.deepEqual(result.layout.geometry.edges[0].points, points);
  }),
  defineTest("congestion diagnostics carry evidence and detail queries return only affected edges", async () => {
    const stage = await layoutFixture(nested()),
      problem = stage.compoundLayout!,
      g = structuredClone(problem.baseline),
      id = problem.projection.edges[0].id;
    const a = g.boxes.a,
      b = g.boxes.b;
    // Deliberately crowd two distinct routes to exercise evidence-based diagnostics.
    const p = [
      { x: a.x + a.width, y: a.y + a.height / 2 },
      { x: b.x, y: a.y + a.height / 2 },
      { x: b.x, y: b.y + b.height / 2 },
    ];
    const duplicate = { ...problem.projection.edges[0], id: "duplicate" };
    const projection = { ...problem.projection, edges: [...problem.projection.edges, duplicate] };
    const routes = new Map([
      [id, { points: p, labelPosition: p[0] }],
      [duplicate.id, { points: p, labelPosition: p[0] }],
    ]);
    const issues = diagnoseRoutes(projection, new Map(Object.entries(g.boxes)), routes, { detours: false });
    assert.ok(issues.some((i) => i.kind === "port-congestion" && i.edgeIds.length === 2));
    const layout = geometryLayout(createLayoutResult(stage, "compound"), g);
    const observation = inspectLayout(problem, layout, undefined, null, [], false, {
      executionIssues: issues,
      limit: 1,
    });
    assert.equal(observation.issues.length, 1);
    const detail = inspectLayout(problem, layout, undefined, null, [], true, { edgeIds: [id] });
    assert.equal(detail.routes.length, 1);
    assert.ok(detail.routes[0].points!.length >= 2);
    assert.throws(
      () => inspectLayout(problem, layout, undefined, null, [], true, { issueIds: ["stale"] }),
      /Unknown routing issue/,
    );
  }),
  defineTest("detour diagnostics require a legal shorter alternative and do not guess label clearance", () => {
    const dag = normalizeDagInput({
        format: "graph-studio",
        version: 3,
        nodes: { a: {}, b: {} },
        edges: [{ id: "ab", source: "a", target: "b" }],
      }),
      projection = projectCompoundGraph(dag, view),
      id = projection.edges[0].id;
    const boxes = new Map([
      ["a", { x: 100, y: 100, width: 100, height: 60 }],
      ["b", { x: 500, y: 100, width: 100, height: 60 }],
    ]);
    const route = {
      points: [
        { x: 200, y: 130 },
        { x: 220, y: 130 },
        { x: 220, y: 400 },
        { x: 480, y: 400 },
        { x: 480, y: 130 },
        { x: 500, y: 130 },
      ],
      labelPosition: { x: 350, y: 400 },
    };
    const issues = diagnoseRoutes(projection, boxes, new Map([[id, route]]));
    const issue = issues.find((i) => i.kind === "avoidable-detour")!;
    assert.ok(issue);
    assert.deepEqual(issue.evidence.alternativePoints, [
      { x: 200, y: 130 },
      { x: 500, y: 130 },
    ]);
    assert.ok(
      !diagnoseRoutes(projection, boxes, new Map([[id, route]]), { showLabels: true }).some(
        (i) => i.kind === "avoidable-detour",
      ),
    );
  }),
  defineTest("session restore retains design while configuration exports omit graph-specific intent", async () => {
    const dag = nested(),
      stage = await layoutFixture(dag),
      session = defaultLayoutSession(),
      design: CompoundDesign = {
        purpose: "Preserve interfaces",
        readingPath: ["a", "b"],
        regions: [],
        scopes: [],
        connections: [],
        routing: gates(stage.compoundLayout!.projection.edges[0].id),
      };
    session.renderings = {
      compound: {
        graphFingerprint: graphLayoutIdentity(dag),
        settingsFingerprint: "settings",
        scope: {
          selection: { type: "full" },
          compound: view,
          activeType: "",
          activeTrack: "",
          timelineRange: null,
          spatial: defaultSpaceView(null),
        },
        timelineSettings: getDefaultChartStyle("timeline").timeline!,
        geometry: captureLayoutGeometry(stage),
        compoundDesign: design,
      },
    };
    const parsed = parseLayoutSession(JSON.parse(JSON.stringify(session)));
    assert.deepEqual(parsed.renderings?.compound?.compoundDesign, design);
    const config = createLayoutConfigFile(parsed, "compound");
    assert.ok(!JSON.stringify(config).includes("gateways"));
    const changed = structuredClone(dag);
    changed.nodes.a.title = "New graph text";
    assert.equal(repairLayoutSession(parsed, changed).renderings?.compound, undefined);
  }),
  defineTest("local moves cannot silently break a required descendant alignment", async () => {
    const stage = await layoutFixture(nested()),
      problem = stage.compoundLayout!,
      design: CompoundDesign = {
        purpose: "Aligned peers",
        readingPath: ["a", "b"],
        regions: [],
        connections: [],
        scopes: [
          {
            groupId: null,
            direction: "RIGHT",
            rows: [["ga", "gb"]],
            reason: "Aligned",
            anchorAlignment: [
              {
                axis: "y",
                anchors: [
                  { nodeId: "a", kind: "center" },
                  { nodeId: "b", kind: "center" },
                ],
                strength: "required",
              },
            ],
          },
        ],
      };
    const result = executeCompoundDecision({
      problem,
      baseLayout: createLayoutResult(stage, "compound"),
      decision: { action: "compose", design },
    });
    assert.equal(result.error, undefined);
    const group = result.layout.geometry.groups!.find((g) => g.id === "gb")!;
    const edit = executeCompoundDecision({
      problem,
      baseLayout: result.layout,
      baseDesign: design,
      decision: {
        action: "edit",
        changes: [{ type: "move-group", id: "gb", position: [group.position[0], group.position[1] + 80] }],
      },
    });
    assert.match(edit.error ?? "", /Required anchor alignment/);
  }),
  defineTest("Commerce composition remains legal with hierarchical route planning", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8"))),
      stage = await layoutFixture(dag),
      problem = stage.compoundLayout!;
    const design: CompoundDesign = {
      purpose: "Commerce interfaces",
      readingPath: ["gateway", "orders"],
      regions: [],
      connections: [],
      scopes: [
        {
          groupId: null,
          direction: "RIGHT",
          rows: [
            ["experience", "commerce", "partners"],
            [null, "platform", null],
          ],
          reason: "Domain regions",
        },
      ],
    };
    const result = executeCompoundDecision({
      problem,
      baseLayout: createLayoutResult(stage, "compound"),
      decision: { action: "compose", design },
    });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.issues, []);
    assert.equal(result.layout.geometry.edges.length, 45);
  }),
]);
