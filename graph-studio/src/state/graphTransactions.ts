import { collectBatchEffects } from "../console/executor";
import type { CommandResult } from "../graph/commands";
import type { GraphSelection } from "../graph/types";
import { repairSelectionAfterCommand } from "./derived";
import type { GraphAction } from "./graphActions";
import { repairHistoryAfterCommand } from "./graphReducer";
import type { GraphAppState } from "./initialState";

export function prepareGraphTransaction(
  state: GraphAppState,
  results: CommandResult[],
  label: string,
  preferredSelection: GraphSelection | null = state.selection,
): Extract<GraphAction, { type: "graphCommandsCommitted" }> | null {
  const lastResult = results.at(-1);
  if (!state.dag || !lastResult) return null;
  let selection = state.selection;
  let history = state.history;
  for (const result of results) {
    selection = repairSelectionAfterCommand(result.dag, selection, preferredSelection, result);
    preferredSelection = selection;
    history = repairHistoryAfterCommand({ ...state, history }, result);
  }
  return {
    type: "graphCommandsCommitted",
    transaction: {
      label,
      beforeDag: state.dag,
      afterDag: lastResult.dag,
      beforeSelection: state.selection,
      afterSelection: selection,
      beforeNavigationHistory: state.history,
      afterNavigationHistory: history,
      revisionBefore: state.editHistory.revision,
      revisionAfter: state.editHistory.revision + 1,
    },
    ...collectBatchEffects(results),
    status: label,
  };
}
