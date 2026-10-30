import assert from "node:assert/strict";
import { defineSuite, defineTest } from "./harness";
import { LayoutCache } from "../layout/runtime/cache";
import { LayoutJobChannel } from "../layout/runtime/job";
import {
  axisRotation,
  composeOrientation,
  normalizeOrientation,
  rotatePoint,
  trackballRotation,
  type Quaternion,
} from "../viewport/camera/quaternion";
import { prepareCompound } from "../layout/compound/prepare";
import { solveCompound } from "../layout/compound/solve";
import { normalizeDagInput } from "../graph/normalize";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { getStageAppearance } from "../layout/shared/appearance";
import { prepareNodeLinkInput } from "../layout/node-link/input";
import { solveFlatLayout } from "../layout/node-link/layout";

export const layoutRuntimeSuite = defineSuite("Layout runtime and camera isolation", [
  defineTest("replacement and cancellation reject late results even when keys repeat", () => {
    const channel = new LayoutJobChannel();
    const a = channel.begin("document:one"),
      b = channel.begin("document:two"),
      a2 = channel.begin("document:one");
    assert.equal(a.signal.aborted, true);
    assert.equal(a.current(), false);
    assert.equal(b.signal.aborted, true);
    assert.equal(a2.current(), true);
    a.finish();
    assert.equal(a2.current(), true);
    channel.cancel();
    assert.equal(a2.current(), false);
    assert.equal(a2.signal.aborted, true);
  }),
  defineTest("session cache is bounded and recently reused scopes survive eviction", () => {
    const cache = new LayoutCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.get("a"), 1);
    cache.set("c", 3);
    assert.equal(cache.get("b"), undefined);
    assert.equal(cache.get("a"), 1);
    cache.clear();
    assert.equal(cache.get("a"), undefined);
  }),
  defineTest("camera crosses both poles, supports roll and preserves distances under long gesture sequences", () => {
    let q: Quaternion = [0, 0, 0, 1];
    for (let i = 0; i < 10000; i++) q = composeOrientation(axisRotation([1, 2, 3], 0.1), q);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-12);
    const a = [0.2, 0.5, 1],
      b = [-0.1, 2, 0.7];
    const ar = rotatePoint(a, q),
      br = rotatePoint(b, q);
    assert.ok(Math.abs(Math.hypot(...a.map((v, i) => v - b[i])) - Math.hypot(...ar.map((v, i) => v - br[i]))) < 1e-10);
    assert.ok(rotatePoint([0, 0, 1], axisRotation([1, 0, 0], 120))[2] < 0);
    assert.ok(rotatePoint([0, 0, 1], axisRotation([1, 0, 0], -120))[2] < 0);
    assert.ok(Math.abs(rotatePoint([1, 0, 0], axisRotation([0, 0, 1], 90))[1] - 1) < 1e-12);
    assert.deepEqual(trackballRotation([0.2, 0.3], [0.2, 0.3]), [0, 0, 0, 1]);
    assert.throws(() => normalizeOrientation([0, 0, 0, 0]));
    assert.throws(() => normalizeOrientation([1, 2, 3, NaN]));
  }),
  defineTest(
    "prepared compound models contain no baseline solve and explicit AI seeds remain uncommitted drafts",
    () => {
      const dag = normalizeDagInput({
        format: "graph-studio",
        version: 3,
        nodes: { g: {}, a: {}, b: {} },
        edges: [{ id: "ab", source: "a", target: "b" }],
        hierarchy_edges: [{ id: "ga", source: "g", target: "a" }],
      });
      const style = getDefaultChartStyle("compound");
      const input = {
        dag,
        view: { focusGroupId: null, collapsedGroupIds: [] },
        appearance: getStageAppearance(style.appearance, "compound"),
        showNodeDetail: false,
        alignNodeWidthsToMax: true,
      };
      const prepared = prepareCompound(input);
      assert.ok(!("baseline" in prepared.problem));
      style.appearance.palette.categories = [[20, 50, 60]];
      assert.equal(
        prepareCompound({ ...input, appearance: getStageAppearance(style.appearance, "compound") }).problem.fingerprint,
        prepared.problem.fingerprint,
      );
      const wire = structuredClone({ problem: prepared.problem, sizes: prepared.sizes, theme: prepared.theme });
      const seed = solveCompound(wire, true);
      assert.equal(Object.keys(seed.result.geometry.routes).length, 0);
      assert.equal(seed.result.quality.validation.valid, false);
      assert.ok(seed.result.geometry.boxes.g.width >= prepared.sizes.get("g")!.width);
    },
  ),
  defineTest("node measurement and solving never mutate shared appearance settings", () => {
    const appearance = getStageAppearance(getDefaultChartStyle("node-link").appearance);
    const before = structuredClone(appearance);
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "Title", define: "A long description" } },
      edges: [],
    });
    const prepared = prepareNodeLinkInput({ dag, selection: { type: "full" }, appearance })!;
    solveFlatLayout(prepared);
    assert.deepEqual(appearance, before);
  }),
]);
