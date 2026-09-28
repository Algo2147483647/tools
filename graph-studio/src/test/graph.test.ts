import assert from "node:assert/strict";
import { applyGraphCommand, collectSubtreeNodeKeys } from "../graph/commands";
import { createInitialCanvasDag, INITIAL_CANVAS_NODE_KEY } from "../graph/initialCanvas";
import { getParentLevelSelection, getInitialSelection, remapSelectionKeys, removeSelectionKeys, sanitizeNodeLabel } from "../graph/selectors";
import { serializeDag } from "../graph/serialize";
import { getGraphTypeOptions, projectGraphByType, TYPE_FILTER_SHORTCUT_RELATION } from "../graph/typeFilter";
import { buildStageData } from "../layout/stage-layout";
import { estimateTextWidth, wrapDetailText } from "../layout/text";
import { defineSuite, defineTest } from "./harness";
import { createChildOnlyDag, createCustomFieldMapping, createForestDag, createMappedSampleDag, createSampleDag } from "./fixtures";

export const graphSuite = defineSuite("graph", [
  defineTest("type projection bridges hidden paths without changing saved data", () => {
    const source = createSampleDag();
    source.A.type = source.C.type = source.D.type = "visible";
    source.B.type = "hidden";
    const before = serializeDag(source);
    const projected = projectGraphByType(source, "visible");
    assert.deepEqual(Object.keys(projected).sort(), ["A", "C", "D"]);
    assert.deepEqual(projected.A.children, { C: "edge_ac", D: TYPE_FILTER_SHORTCUT_RELATION });
    assert.deepEqual(projected.D.parents, { A: TYPE_FILTER_SHORTCUT_RELATION });
    assert.deepEqual(projected.C.parents, { A: "edge_ac" });
    assert.deepEqual(serializeDag(source), before);
    assert.deepEqual(getGraphTypeOptions(source), ["hidden", "visible"]);
    for (const layoutMode of ["level", "sugiyama", "dagre"] as const) {
      const stage = buildStageData({ dag: projected, selection: { type: "full" }, layoutMode });
      assert.ok(stage);
      assert.deepEqual(stage.nodes.map((node) => node.key).sort(), ["A", "C", "D"]);
      assert.equal(stage.edges.length, 2);
    }
  }),

  defineTest("type projection uses custom field mappings and handles all or missing types", () => {
    const mapping = createCustomFieldMapping();
    const source = createMappedSampleDag();
    source.A.kind = source.D.kind = "visible";
    const projected = projectGraphByType(source, "visible", mapping);
    assert.deepEqual(Object.keys(projected).sort(), ["A", "D"]);
    assert.deepEqual(projected.A.next, { D: TYPE_FILTER_SHORTCUT_RELATION });
    assert.deepEqual(projected.D.prev, { A: TYPE_FILTER_SHORTCUT_RELATION });
    assert.deepEqual(getGraphTypeOptions(source, mapping), ["task", "visible"]);
    assert.equal(projectGraphByType(source, "", mapping), source);
    assert.deepEqual(projectGraphByType(source, "missing", mapping), {});
    assert.deepEqual(getGraphTypeOptions(createSampleDag()), []);
  }),

  defineTest("type projection preserves direct relations and terminates hidden cycles", () => {
    const source = createSampleDag();
    source.A.type = source.D.type = "visible";
    source.B.children = { C: "bc", D: "bd", A: "ba", Missing: "missing" };
    source.C.children = { B: "cb", D: "cd" };
    source.A.children = { B: "ab", D: "direct" };
    const projected = projectGraphByType(source, "visible");
    assert.deepEqual(projected.A.children, { D: "direct" });
    assert.deepEqual(projected.D.parents, { A: "direct" });
  }),

  defineTest("initial canvas node does not generate a default title field", () => {
    const dag = createInitialCanvasDag();
    const serialized = serializeDag(dag);

    assert.equal("title" in serialized[INITIAL_CANVAS_NODE_KEY], false);
    assert.equal(serialized[INITIAL_CANVAS_NODE_KEY].define, "Start building your graph from this root node.");
    assert.deepEqual(serialized[INITIAL_CANVAS_NODE_KEY].parents, {});
    assert.deepEqual(serialized[INITIAL_CANVAS_NODE_KEY].children, {});
  }),

  defineTest("detail text wrapping uses estimated visual width instead of raw character count", () => {
    assert.ok(estimateTextWidth("MMMM", 10) > estimateTextWidth("iiii", 10));

    const lines = wrapDetailText("This is a long subtitle used to test wrapping and truncation", 72, 2);

    assert.equal(lines.length, 2);
    assert.ok(lines[1].endsWith("..."));
    lines.forEach((line) => {
      assert.ok(estimateTextWidth(line, 10) <= 72);
    });
  }),

  defineTest("renameNode updates reciprocal relations without mutating the source dag", () => {
    const sourceDag = createSampleDag();
    const beforeSnapshot = serializeDag(sourceDag);

    const result = applyGraphCommand(sourceDag, { type: "renameNode", oldKey: "B", newKey: "B_Renamed" });

    assert.equal(sourceDag.B.key, "B");
    assert.deepEqual(serializeDag(sourceDag), beforeSnapshot);
    assert.equal(result.dag.B_Renamed.key, "B_Renamed");
    assert.ok(!("B" in result.dag));
    assert.deepEqual(result.dag.A.children, { B_Renamed: "edge_ab", C: "edge_ac" });
    assert.deepEqual(result.dag.D.parents, { B_Renamed: "edge_bd" });
  }),

  defineTest("deleteSubtree removes descendants and cleans dangling relations", () => {
    const sourceDag = createSampleDag();
    const result = applyGraphCommand(sourceDag, { type: "deleteSubtree", rootKey: "B" });

    assert.deepEqual(collectSubtreeNodeKeys(sourceDag, "B").sort(), ["B", "D"]);
    assert.ok(!("B" in result.dag));
    assert.ok(!("D" in result.dag));
    assert.deepEqual(result.dag.A.children, { C: "edge_ac" });
    assert.deepEqual(result.deletedKeys?.sort(), ["B", "D"]);
  }),

  defineTest("updateNodeFields resynchronizes bidirectional parent and child relations", () => {
    const sourceDag = createSampleDag();
    const result = applyGraphCommand(sourceDag, {
      type: "updateNodeFields",
      key: "C",
      fields: {
        title: "Gamma 2",
        define: "Moved",
        parents: { B: "linked_from_b" },
        children: { D: "edge_cd" },
      },
    });

    assert.deepEqual(result.dag.C.parents, { B: "linked_from_b" });
    assert.deepEqual(result.dag.B.children, { D: "edge_bd", C: "related_to" });
    assert.deepEqual(result.dag.A.children, { B: "edge_ab" });
    assert.deepEqual(result.dag.D.parents, { B: "edge_bd", C: "related_to" });
  }),

  defineTest("selectors derive initial and parent-level selections correctly", () => {
    assert.deepEqual(getInitialSelection(createForestDag()), { type: "full" });
    assert.deepEqual(getInitialSelection(createSampleDag()), { type: "node", key: "A" });
    assert.deepEqual(getInitialSelection(createChildOnlyDag()), { type: "node", key: "Root" });
    assert.deepEqual(getParentLevelSelection(createSampleDag(), ["D"]), { type: "node", key: "B" });
  }),

  defineTest("node labels preserve title hyphens", () => {
    assert.equal(sanitizeNodeLabel("Alpha-Beta_Title"), "Alpha-Beta Title");
  }),

  defineTest("commands preserve raw mapped field names while operating on semantic relations", () => {
    const mapping = createCustomFieldMapping();
    const sourceDag = createMappedSampleDag();
    const result = applyGraphCommand(sourceDag, {
      type: "updateNodeFields",
      key: "C",
      fields: {
        label: "Gamma 2",
        description: "Moved",
        kind: "task",
        prev: { B: "linked_from_b" },
        next: { D: "edge_cd" },
      },
    }, mapping);

    assert.equal(result.dag.C.label, "Gamma 2");
    assert.deepEqual(result.dag.C.prev, { B: "linked_from_b" });
    assert.deepEqual(result.dag.C.next, { D: "edge_cd" });
    assert.deepEqual(result.dag.B.next, { D: "edge_bd", C: "related_to" });
    assert.deepEqual(result.dag.A.next, { B: "edge_ab" });
    assert.deepEqual(result.dag.D.prev, { B: "edge_bd", C: "related_to" });
    assert.equal("children" in result.dag.C, false);
    assert.equal("parents" in result.dag.C, false);
    assert.deepEqual(getInitialSelection(sourceDag, mapping), { type: "node", key: "A" });
    assert.deepEqual(getParentLevelSelection(sourceDag, ["D"], mapping), { type: "node", key: "B" });
    assert.deepEqual(serializeDag(result.dag, mapping).C, {
      label: "Gamma 2",
      description: "Moved",
      kind: "task",
      prev: { B: "linked_from_b" },
      next: { D: "edge_cd" },
    });
  }),

  defineTest("selection remapping helpers preserve only valid keys", () => {
    const forestSelection = { type: "forest" as const, keys: ["A", "B", "C"], label: "Focus" };

    assert.deepEqual(remapSelectionKeys(forestSelection, (key) => (key === "B" ? "B2" : key)), {
      type: "forest",
      keys: ["A", "B2", "C"],
      label: "Focus",
    });
    assert.deepEqual(removeSelectionKeys(forestSelection, new Set(["A", "C"])), {
      type: "forest",
      keys: ["B"],
      label: "Focus",
    });
  }),
]);
