import { collectBatchEffects } from "../graph/commandEffects";
import { applyGraphCommand, type CommandResult, type GraphCommand } from "../graph/commands";
import type { GraphSelection } from "../graph/types";
import { repairHistoryAfterCommand, repairSelectionAfterCommand } from "./derived";
import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";

/** Validate the entire edit before publishing one undoable transaction. */
export function prepareCommandTransaction(
  state: GraphAppState,
  commands: GraphCommand[],
  label: string,
  selection = state.selection,
) {
  if (!state.dag) throw new Error("No graph loaded.");
  let dag = state.dag;
  const results = commands.map((command) => {
    const result = applyGraphCommand(dag, command);
    dag = result.dag;
    return result;
  });
  return prepareGraphTransaction(state, results, label, selection);
}

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
      revisionAfter: state.nextRevision,
    },
    ...collectBatchEffects(results),
    status: label,
  };
}
