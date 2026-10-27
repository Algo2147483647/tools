import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineSuite, defineTest } from "./harness";
import { compoundFixture } from "./compound.test";
import { getGroupNodes } from "../graph/compound/hierarchy";
import { normalizeDagInput } from "../graph/normalize";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { getStageAppearance } from "../layout/shared/appearance";
import { buildCompoundStage, measureCompoundStage } from "../layout/compound/layout";
import { emptyLayoutData, changeCompoundLayout, parseCompoundLayout } from "../graph/compound/layoutData";
import { solveFcose } from "../layout/compound/fcose/solver";
import { compoundOrthogonalRouter } from "../layout/compound/routing/orthogonal-router";
import { validateLayoutGeometry } from "../layout/compound/layout-quality";
import { createFcoseModel } from "../layout/compound/fcose/adapter";
import { routingPreferences } from "../layout/compound/routing/preferences";
import { createLayoutConfigFile } from "../schema/layoutConfig";
import { defaultLayoutSession, layoutSessionFromConfig } from "../schema/layoutSession";
import {
  captureLayoutGeometry,
  restoreLayoutGeometry,
  renderingMatches,
  graphLayoutIdentity,
  layoutIdentity,
} from "../schema/layoutGeometry";
import { defaultSpaceView } from "../graph/space";

export const fcoseInput = (dag = compoundFixture()) => ({
  dag,
  view: { collapsedGroupIds: [] as string[], focusGroupId: null as string | null },
  appearance: getStageAppearance(getDefaultChartStyle("compound").appearance, "compound"),
  showNodeDetail: true,
  alignNodeWidthsToMax: false,
  showEdgeLabels: true,
  layout: { ...emptyLayoutData(), method: "fcose" as const },
});

export const fcoseSuite = defineSuite("fCoSE independent layout", [
  defineTest("commerce whole-graph layouts validate expanded, folded and focused views", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const groups = Object.keys(getGroupNodes(dag));
    for (const view of [
      { collapsedGroupIds: [], focusGroupId: null },
      { collapsedGroupIds: groups, focusGroupId: null },
      ...groups.slice(0, 4).map((focusGroupId) => ({ collapsedGroupIds: [], focusGroupId })),
    ]) {
      const stage = await buildCompoundStage({ ...fcoseInput(dag), view });
      assert.equal(stage.layoutQuality?.validation.valid, true);
      console.log(
        `    fCoSE ${view.focusGroupId ?? (view.collapsedGroupIds.length ? "folded" : "expanded")}: ${JSON.stringify(stage.layoutQuality?.timings)}`,
      );
    }
  }),
  defineTest(
    "measurement performs no old placement; one final router call produces legal nested geometry",
    async () => {
      let routes = 0;
      const stage = await buildCompoundStage({
        ...fcoseInput(),
        place: async () => {
          throw new Error("Old initialization must not run");
        },
        solve: (p) =>
          Promise.resolve(
            solveFcose(p, {
              route(input) {
                routes++;
                return compoundOrthogonalRouter.route(input);
              },
            }),
          ),
      });
      assert.equal(routes, 1);
      assert.equal(stage.layoutProvenance?.method, "fcose");
      assert.equal(stage.groups?.length, 2);
      assert.equal(stage.edges.length, 4);
      assert.deepEqual(validateLayoutGeometry(stage.compoundLayout!, stage.compoundLayout!.baseline).errors, []);
      assert.equal(stage.layoutQuality?.timings?.routingMs! >= 0, true);
    },
  ),
  defineTest("deep nested measured titles and minimums remain within solver reservations", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        g: { title: "Wide container heading\nSecond line\nThird line" },
        h: { title: "Inner group" },
        a: { title: "A" },
        b: { title: "B" },
        x: { title: "Outside" },
      },
      hierarchy_edges: [
        { id: "gh", source: "g", target: "h" },
        { id: "ha", source: "h", target: "a" },
        { id: "gb", source: "g", target: "b" },
      ],
      edges: [
        { id: "ax", source: "a", target: "x" },
        { id: "bx", source: "b", target: "x" },
      ],
    });
    const measured = measureCompoundStage(fcoseInput(dag));
    measured.problem.minimumSizes.h.width = 900;
    measured.problem.minimumSizes.g.height = 600;
    const result = solveFcose(measured.problem);
    assert.ok(result.geometry.boxes.h.width >= 900);
    assert.ok(result.geometry.boxes.g.height >= 600);
    assert.equal(result.quality.validation.valid, true);
  }),
  defineTest("collapsed, focused, filtered, isolated and empty projections use the same model", async () => {
    for (const view of [
      { collapsedGroupIds: ["c"], focusGroupId: null },
      { collapsedGroupIds: ["b"], focusGroupId: null },
      { collapsedGroupIds: [], focusGroupId: "c" },
    ]) {
      const stage = await buildCompoundStage({ ...fcoseInput(), view });
      assert.equal(stage.layoutQuality?.validation.valid, true);
    }
    const filtered = await buildCompoundStage({ ...fcoseInput(), selectedType: "service" });
    assert.equal(filtered.layoutQuality?.validation.valid, true);
    const empty = normalizeDagInput({ format: "graph-studio", version: 3, nodes: {}, edges: [] });
    assert.equal((await buildCompoundStage(fcoseInput(empty))).nodes.length, 0);
  }),
  defineTest("container endpoints and duplicate relationships survive conversion and full routing", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { g: {}, a: {}, b: {}, x: {} },
      hierarchy_edges: [
        { id: "ha", source: "g", target: "a" },
        { id: "hb", source: "g", target: "b" },
      ],
      edges: [
        { id: "ga", source: "g", target: "a" },
        { id: "gx", source: "g", target: "x" },
        { id: "ax1", source: "a", target: "x" },
        { id: "bx", source: "b", target: "x" },
      ],
    });
    const stage = await buildCompoundStage(fcoseInput(dag));
    assert.equal(stage.edges.length, 4);
    const folded = await buildCompoundStage({
      ...fcoseInput(dag),
      view: { focusGroupId: null, collapsedGroupIds: ["g"] },
    });
    assert.equal(folded.edges.length, 1);
    assert.equal(folded.edges[0].originalEdgeIds?.length, 3);
    assert.ok(stage.warnings.some((w) => w.includes("ancestor/descendant")));
  }),
  defineTest("invalid routing is rejected without fallback to placement or straight lines", () => {
    const { problem } = measureCompoundStage(fcoseInput());
    assert.throws(
      () =>
        solveFcose(problem, {
          route({ geometry }) {
            return { geometry, diagnostics: [] };
          },
        }),
      /Invalid route/,
    );
  }),
  defineTest("mode switching preserves independent settings and save/reopen provenance", async () => {
    let data = { ...emptyLayoutData(), direction: "RIGHT" as const };
    let changed = changeCompoundLayout(data, { method: "ai" });
    changed = changeCompoundLayout(changed, {
      direction: "DOWN",
      constraints: [{ type: "direction", scopeId: null, value: "DOWN", strength: "soft" }],
    });
    changed = changeCompoundLayout(changed, { method: "fcose", objective: "compact" });
    assert.equal(changed.direction, "AUTO");
    assert.deepEqual(changed.constraints, []);
    assert.equal(changeCompoundLayout(changed, { method: "automatic" }).direction, "RIGHT");
    assert.equal(changeCompoundLayout(changed, { method: "ai" }).constraints.length, 1);
    const session = defaultLayoutSession();
    session.charts.compound = changed;
    const file = createLayoutConfigFile(session, "compound");
    assert.ok(!("direction" in file.settings));
    const reopened = layoutSessionFromConfig(file).charts.compound;
    assert.equal(reopened.method, "fcose");
    assert.equal(changeCompoundLayout(reopened, { method: "ai" }).direction, "DOWN");
    assert.equal(parseCompoundLayout({ method: "automatic" }).direction, "AUTO");
    const stage = await buildCompoundStage(fcoseInput());
    const saved = captureLayoutGeometry(stage);
    assert.equal(saved.generator?.method, "fcose");
    assert.equal(restoreLayoutGeometry(saved, stage).layoutProvenance?.method, "fcose");
    const rendering = {
      graphFingerprint: graphLayoutIdentity(fcoseInput().dag),
      settingsFingerprint: layoutIdentity({}),
      geometry: saved,
      scope: {
        selection: null,
        compound: { focusGroupId: null, collapsedGroupIds: [] },
        activeType: "",
        activeTrack: "",
        timelineRange: null,
        spatial: defaultSpaceView(null),
      },
      timelineSettings: getDefaultChartStyle("timeline").timeline!,
    };
    assert.equal(renderingMatches(rendering, fcoseInput().dag, {}, stage), true);
    saved.generator = { method: "automatic", engine: "compound-plan-3" };
    assert.equal(renderingMatches(rendering, fcoseInput().dag, {}, stage), false);
    saved.generator = { ...stage.layoutProvenance!, parameters: { randomSeed: 999 } };
    assert.equal(renderingMatches(rendering, fcoseInput().dag, {}, stage), false);
  }),
  defineTest("fixed external rectangles, deterministic seeds and random cleanup survive repeated solves", () => {
    const input = { ...fcoseInput(), view: { collapsedGroupIds: [], focusGroupId: "c" } };
    const { problem } = measureCompoundStage(input);
    const random = Math.random;
    const first = solveFcose(problem);
    assert.equal(Math.random, random);
    assert.deepEqual(solveFcose(problem).geometry, first.geometry);
    const external = problem.projection.items.filter((i) => i.external);
    assert.ok(external.length > 0);
    for (const item of external) problem.baseline.boxes[item.id] = first.geometry.boxes[item.id];
    const next = solveFcose(problem);
    for (const item of external) {
      const old = first.geometry.boxes[item.id],
        current = next.geometry.boxes[item.id];
      assert.ok(Math.abs(old.x - current.x) < 0.01 && Math.abs(old.y - current.y) < 0.01);
    }
    assert.throws(
      () =>
        solveFcose(problem, {
          route() {
            throw new Error("failed routing");
          },
        }),
      /failed routing/,
    );
    assert.equal(Math.random, random);
  }),
  defineTest("folded conflicting port preferences retain the original first-preference rule", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { g: {}, a: {}, b: {}, x: {} },
      hierarchy_edges: [
        { id: "ga", source: "g", target: "a" },
        { id: "gb", source: "g", target: "b" },
      ],
      edges: [
        { id: "ax", source: "a", target: "x" },
        { id: "bx", source: "b", target: "x" },
      ],
    });
    const { problem } = measureCompoundStage({
      ...fcoseInput(dag),
      view: { collapsedGroupIds: ["g"], focusGroupId: null },
    });
    problem.stored.constraints = [
      { type: "port-side", edgeId: "ax", end: "source", side: "east", strength: "soft" },
      { type: "port-side", edgeId: "bx", end: "source", side: "west", strength: "soft" },
    ];
    const result = solveFcose(problem);
    assert.ok(result.diagnostics.some((d) => d.includes("conflicting source port preferences")));
    const preferences = routingPreferences(problem, problem.stored);
    assert.equal(preferences.portSides.get(problem.projection.edges[0].id)?.source, 0);
  }),
  defineTest("adapter uses collision-free internal IDs and reports unsupported self-loops", async () => {
    const unusual = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { n0: {}, e0: {}, "a:# b": {} },
      edges: [
        { id: "n0", source: "n0", target: "e0" },
        { id: "e0", source: "e0", target: "a:# b" },
      ],
    });
    assert.equal((await buildCompoundStage(fcoseInput(unusual))).edges.length, 2);
    const { problem } = measureCompoundStage(fcoseInput());
    problem.projection.edges.push({ id: "self", source: "a", target: "a", originalEdgeIds: ["self"], label: "" });
    assert.throws(() => createFcoseModel(problem), /self-loop.*self/);
  }),
]);
