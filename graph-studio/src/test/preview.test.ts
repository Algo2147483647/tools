import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_GRAPH_APPEARANCE as appearance } from "../graph/appearance";
import { createChartStyles } from "../state/chartStyles";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "../state/chartPreferences";
import { buildCompoundStage } from "../layout/compound-layout";
import {
  buildFlatPreviewStage,
  compoundPreviewInput,
  INITIAL_PREVIEW_VIEW,
  PREVIEW_GRAPHS,
  previewGeometry,
} from "../components/settings/previewModel";
import { getLayoutControls } from "../components/settings/settingsConfig";
import GraphStage from "../rendering/GraphStage";
import type { GraphChartType } from "../graph/types";
import type { StageData } from "../layout/types";
import { assertCompoundGeometry } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

const input = (chartType: GraphChartType) =>
  previewGeometry({
    chartType,
    layoutMode: "sugiyama",
    appearance,
    showNodeDetail: true,
    alignNodeWidthsToMax: false,
    view: INITIAL_PREVIEW_VIEW,
  });
const noop = () => {};
const render = (stage: StageData, showEdgeLabels = true, showGroupStats = true) =>
  renderToStaticMarkup(
    createElement(GraphStage, {
      stage,
      appearance: { ...appearance, display: { ...appearance.display, showEdgeLabels, showGroupStats } },
      hideNodeBorders: false,
      focusedKey: null,
      svgRef: { current: null },
      onNodeClick: noop,
      onNodeDoubleClick: noop,
      onNodeContextMenu: noop,
      onBackgroundContextMenu: noop,
      onFocusChange: noop,
    }),
  );

export const previewSuite = defineSuite("Shared live preview", [
  defineTest("node-link previews use all three engines and respond to geometry, not paint", () => {
    const initial = input("node-link");
    for (const layoutMode of ["sugiyama", "level", "dagre"] as const) {
      const stage = buildFlatPreviewStage({ ...initial, layoutMode })!;
      assert.equal(stage.layoutMode, layoutMode);
      assert.equal(stage.nodes.length, 4);
      assert.equal(stage.edges.length, 5);
      const changed = buildFlatPreviewStage({
        ...initial,
        layoutMode,
        appearance: {
          ...initial.appearance,
          layout: { ...initial.appearance.layout, nodeHeight: 140, columnGap: 240 },
        },
      })!;
      assert.ok(changed.nodes.every((node) => node.height === 140));
      assert.notDeepEqual(
        changed.edges.map((edge) => edge.path),
        stage.edges.map((edge) => edge.path),
      );
      assert.match(render(stage), /marker-end="url\(#arrowhead\)"/);
      assert.match(render(stage), /class="dag-edge__label-bg"/);
      assert.doesNotMatch(render(stage, false), /class="dag-edge__label-bg"/);
    }
    const recolored = previewGeometry({
      chartType: "node-link",
      layoutMode: "sugiyama",
      appearance: {
        ...appearance,
        css: "body { background: red; }",
        display: { ...appearance.display, nodeCornerRadius: 0, showGroupStats: false },
      },
      showNodeDetail: true,
      alignNodeWidthsToMax: false,
      view: INITIAL_PREVIEW_VIEW,
    });
    assert.deepEqual(recolored, initial, "paint changes must not restart layout");
  }),
  defineTest("nested preview contains real expanded and folded groups and supports focus", async () => {
    const initial = input("compound");
    const stage = await buildCompoundStage(compoundPreviewInput(initial));
    assertCompoundGeometry(PREVIEW_GRAPHS.compound, stage, initial.view);
    assert.ok(stage.groups?.some((group) => group.id === "app"));
    assert.equal(stage.nodeMap.storage.kind, "group");
    assert.equal(stage.edges.find((edge) => edge.source === "api" && edge.target === "storage")!.label, "2 edges");
    assert.match(render(stage), /class="dag-group-count"/);
    assert.doesNotMatch(render(stage, true, false), /class="dag-group-count"/);
    for (const view of [
      { collapsedGroupIds: [], focusGroupId: null },
      { collapsedGroupIds: [], focusGroupId: "storage" },
    ]) {
      const expanded = await buildCompoundStage(compoundPreviewInput({ ...initial, view }));
      assert.ok(expanded.nodeMap.database);
      assertCompoundGeometry(PREVIEW_GRAPHS.compound, expanded, view);
    }
  }),
  defineTest("Sankey preview uses flow-derived geometry and includes return flows", () => {
    const initial = input("sankey");
    const stage = buildFlatPreviewStage(initial)!;
    assert.ok(stage.edges.some((edge) => edge.flow?.feedback));
    assert.ok(stage.edges.every((edge) => edge.flow));
    const wide = buildFlatPreviewStage({
      ...initial,
      appearance: { ...initial.appearance, display: { sankeyNodeWidth: 48 } },
    })!;
    assert.ok(wide.nodes.every((node) => node.width === 48));
    assert.notDeepEqual(
      stage.edges.map((edge) => edge.path),
      wide.edges.map((edge) => edge.path),
    );
    assert.match(render(wide), /class="dag-edge__flow"/);
  }),
  defineTest("timeline preview retains dates without descriptions and responds to track/flow settings", () => {
    const initial = input("timeline");
    const stage = buildFlatPreviewStage({ ...initial, showNodeDetail: false })!;
    assert.ok(stage.timeline);
    assert.ok(stage.timeline.tracks.length >= 2);
    const html = render(stage);
    assert.match(html, /class="timeline-node__duration"/);
    assert.match(html, /class="timeline-node__date"/);
    assert.doesNotMatch(html, /class="timeline-node__detail"/);
    assert.match(html, /class="dag-edge__label-bg"/);
    const detailed = buildFlatPreviewStage(initial)!;
    assert.match(render(detailed), /class="timeline-node__detail"/);
    const flow = buildFlatPreviewStage({
      ...initial,
      timelineSettings: { ...initial.timelineSettings, layout: "flow", horizontalSpread: 2 },
    })!;
    assert.notDeepEqual(
      stage.nodes.map((node) => node.x),
      flow.nodes.map((node) => node.x),
    );
  }),
  defineTest("settings omit controls unused by the selected layout", () => {
    assert.ok(getLayoutControls("node-link").some((control) => control.key === "edgeLaneGap"));
    assert.ok(!getLayoutControls("compound").some((control) => control.key === "edgeLaneGap"));
    for (const chart of ["timeline", "sankey"] as const)
      assert.deepEqual(
        getLayoutControls(chart).map((control) => control.key),
        ["rowGap", "nodeHeight", "maxNodeWidth"],
      );
  }),
  defineTest("a slider gesture becomes one undo step and transient state never enters preferences", () => {
    let state = createChartPreferences(createChartStyles());
    const before = state.compound.appearance;
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "beginAdjustment" } });
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "beginAdjustment" } });
    for (const nodeHeight of [80, 90, 100, 110]) {
      state = chartPreferencesReducer(state, {
        chartType: "compound",
        action: {
          type: "commit",
          appearance: { ...before, layout: { ...before.layout, nodeHeight } },
          label: "Resize nodes",
        },
      });
      assert.equal(state.compound.undoStack.length, 0);
      assert.ok(!("adjustment" in getChartStyles(state).compound));
    }
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "endAdjustment" } });
    assert.equal(state.compound.undoStack.length, 1);
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "undo" } });
    assert.deepEqual(state.compound.appearance, before);
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "redo" } });
    assert.equal(state.compound.appearance.layout.nodeHeight, 110);
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "beginAdjustment" } });
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "endAdjustment" } });
    assert.equal(state.compound.undoStack.length, 1, "a click without a change creates no transaction");
  }),
]);
