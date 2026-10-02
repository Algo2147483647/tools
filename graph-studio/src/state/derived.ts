import type { CommandResult } from "../graph/commands";
import { getInitialSelection, isSelectionValid, remapSelectionKeys, removeSelectionKeys } from "../graph/selectors";
import type { GraphSelection, NormalizedDag } from "../graph/types";
import type { GraphAppState } from "./initialState";

export function repairSelectionAfterCommand(
  dag: NormalizedDag,
  currentSelection: GraphSelection | null,
  preferredSelection: GraphSelection | null,
  result: CommandResult,
): GraphSelection {
  let nextPreferred = preferredSelection;
  let nextCurrent = currentSelection;

  if (result.renamedKey) {
    const { from, to } = result.renamedKey;
    nextPreferred = remapSelectionKeys(nextPreferred, (key) => (key === from ? to : key));
    nextCurrent = remapSelectionKeys(nextCurrent, (key) => (key === from ? to : key));
  }

  if (result.deletedKeys?.length) {
    const deleteSet = new Set(result.deletedKeys);
    nextPreferred = removeSelectionKeys(nextPreferred, deleteSet);
    nextCurrent = removeSelectionKeys(nextCurrent, deleteSet);
  }

  if (isSelectionValid(nextPreferred, dag)) {
    return nextPreferred!;
  }
  if (isSelectionValid(nextCurrent, dag)) {
    return nextCurrent!;
  }
  return getInitialSelection(dag);
}

export function repairHistoryAfterCommand(
  state: GraphAppState,
  result: { dag: NonNullable<GraphAppState["dag"]>; renamedKey?: { from: string; to: string }; deletedKeys?: string[] },
): GraphAppState["history"] {
  let history = state.history;
  if (result.renamedKey) {
    history = history
      .map((item) => remapSelectionKeys(item, (key) => (key === result.renamedKey!.from ? result.renamedKey!.to : key)))
      .filter(Boolean) as GraphAppState["history"];
  }
  if (result.deletedKeys?.length) {
    const deleteSet = new Set(result.deletedKeys);
    history = history.map((item) => removeSelectionKeys(item, deleteSet)).filter(Boolean) as GraphAppState["history"];
  }
  return history.filter((item) => isSelectionValid(item, result.dag));
}
