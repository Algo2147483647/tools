import assert from "node:assert/strict";
import {
  collapseCompoundScope,
  expandCompoundLevel,
  revealCompoundMember,
  toggleCompoundGroup,
} from "../graph/compoundNavigation";
import { projectCompoundGraph } from "../graph/compoundProjection";
import { normalizeDagInput } from "../graph/normalize";
import type { CompoundView } from "../graph/types";
import { defineSuite, defineTest } from "./harness";

const fixture = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: { a: {}, b: {}, c: {}, d: {} },
    edges: [],
    hierarchy: {
      id: "H",
      groups: {
        commerce: { title: "Commerce" },
        payments: { title: "Payments" },
        settlement: { title: "Settlement" },
        external: { title: "External" },
      },
      parentById: {
        a: "settlement",
        b: "payments",
        c: "commerce",
        d: "external",
        settlement: "payments",
        payments: "commerce",
      },
    },
  });
const view = (collapsedGroupIds: string[] = [], focusGroupId: string | null = null): CompoundView => ({
  collapsedGroupIds,
  focusGroupId,
});
const collapsed = (current: CompoundView) => [...current.collapsedGroupIds].sort();

export const compoundNavigationSuite = defineSuite("Nested graph navigation", [
  defineTest("opening a group reveals only one level and leaves unrelated branches intact", () => {
    const dag = fixture();
    const initial = view(["commerce", "external"]);
    const next = toggleCompoundGroup(dag, initial, "commerce");
    assert.deepEqual(collapsed(next), ["external", "payments", "settlement"]);
    assert.deepEqual(initial, view(["commerce", "external"]));
    assert.deepEqual(
      projectCompoundGraph(dag, next)
        .items.map((item) => item.id)
        .sort(),
      ["c", "commerce", "external", "payments"],
    );
    assert.deepEqual(collapsed(toggleCompoundGroup(dag, next, "commerce")), [
      "commerce",
      "external",
      "payments",
      "settlement",
    ]);
  }),
  defineTest("expand one level advances only the visible frontier and stops at leaf groups", () => {
    const dag = fixture();
    const first = expandCompoundLevel(dag, view(["commerce", "external"]));
    assert.deepEqual(collapsed(first), ["payments", "settlement"]);
    const second = expandCompoundLevel(dag, first);
    assert.deepEqual(collapsed(second), ["settlement"]);
    const third = expandCompoundLevel(dag, second);
    assert.deepEqual(collapsed(third), []);
    assert.deepEqual(expandCompoundLevel(dag, third), third);
  }),
  defineTest("scope expansion and collapse preserve groups outside the focused branch", () => {
    const dag = fixture();
    const initial = view(["commerce", "payments", "external"], "commerce");
    const next = expandCompoundLevel(dag, initial);
    assert.deepEqual(collapsed(next), ["commerce", "external", "settlement"]);
    assert.equal(next.focusGroupId, "commerce");
    const closed = collapseCompoundScope(dag, next);
    assert.deepEqual(collapsed(closed), ["commerce", "external", "payments", "settlement"]);
    assert.deepEqual(collapsed(collapseCompoundScope(dag, view([], "payments"))), ["settlement"]);
    assert.deepEqual(collapsed(collapseCompoundScope(dag, view())), ["commerce", "external", "payments", "settlement"]);
  }),
  defineTest("search reveal opens ancestry in scope and changes scope for outside members", () => {
    const dag = fixture();
    const initial = view(["commerce", "payments", "settlement", "external"], "commerce");
    const inside = revealCompoundMember(dag, initial, "a");
    assert.equal(inside.focusGroupId, "commerce");
    assert.deepEqual(collapsed(inside), ["commerce", "external"]);
    assert.ok(projectCompoundGraph(dag, inside).items.some((item) => item.id === "a"));
    const outside = revealCompoundMember(dag, initial, "d");
    assert.equal(outside.focusGroupId, "external");
    assert.ok(projectCompoundGraph(dag, outside).items.some((item) => item.id === "d"));
    const currentScope = revealCompoundMember(dag, initial, "commerce");
    assert.equal(currentScope.focusGroupId, null);
    assert.ok(projectCompoundGraph(dag, currentScope).items.some((item) => item.id === "commerce"));
  }),
  defineTest("invalid IDs and attempts to collapse the current scope do not alter view state", () => {
    const dag = fixture();
    const initial = view([], "payments");
    assert.equal(toggleCompoundGroup(dag, initial, "payments"), initial);
    assert.equal(toggleCompoundGroup(dag, initial, "missing"), initial);
    assert.equal(revealCompoundMember(dag, initial, "missing"), initial);
  }),
]);
