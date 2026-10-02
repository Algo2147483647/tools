import { findRootsFromDag } from "../graph/selectors";
import type { DagNode, GraphSelection, NodeKey, NormalizedDag } from "../graph/types";
import type { ResolvedStageSelection } from "./types";

const GRAPH_ROOT_KEY = "__graph_root__";
const SELECTION_ROOT_KEY = "__selection_root__";

export function resolveStageSelection(
  dag: NormalizedDag,
  requestedSelection: GraphSelection | null,
): ResolvedStageSelection {
  const roots = findRootsFromDag(dag);
  const syntheticKey = (base: string) => {
    let key = base;
    while (Object.prototype.hasOwnProperty.call(dag.nodes, key)) key += "_";
    return key;
  };

  if (requestedSelection?.type === "forest") {
    const topLevelKeys = Array.from(new Set(requestedSelection.keys.filter((key) => dag.nodes[key])));
    if (topLevelKeys.length) {
      return {
        rootKey: syntheticKey(SELECTION_ROOT_KEY),
        topLevelKeys,
        isForest: true,
        label: requestedSelection.label || "Parent level",
        appSelection: { ...requestedSelection, keys: topLevelKeys },
      };
    }
  }

  if (requestedSelection?.type === "node" && dag.nodes[requestedSelection.key]) {
    return {
      rootKey: requestedSelection.key,
      topLevelKeys: [requestedSelection.key],
      isForest: false,
      label: requestedSelection.key,
      appSelection: requestedSelection,
    };
  }

  if (requestedSelection?.type === "full" || roots.length !== 1) {
    const topLevelKeys = roots.length ? roots : Object.keys(dag.nodes);
    return {
      rootKey: syntheticKey(GRAPH_ROOT_KEY),
      topLevelKeys,
      isForest: true,
      label: "All roots",
      appSelection: { type: "full" },
    };
  }

  return {
    rootKey: roots[0],
    topLevelKeys: [roots[0]],
    isForest: false,
    label: roots[0],
    appSelection: { type: "node", key: roots[0] },
  };
}

export function withSyntheticSelectionRoot(
  dag: NormalizedDag,
  selection: ResolvedStageSelection,
): Record<NodeKey, DagNode & { synthetic?: boolean }> {
  const nextDag: Record<NodeKey, DagNode & { synthetic?: boolean }> = Object.assign(Object.create(null), dag.nodes);
  if (selection.isForest) {
    nextDag[selection.rootKey] = {
      key: selection.rootKey,
      title: selection.label,
      children: selection.topLevelKeys,
      parents: {},
      synthetic: true,
    };
  }
  return nextDag;
}
