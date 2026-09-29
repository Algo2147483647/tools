import { useCallback, type Dispatch } from "react";
import { applyGraphCommand, type CommandResult, type GraphCommand } from "../graph/commands";
import type { FieldMapping } from "../graph/fieldMapping";
import type { GraphSelection } from "../graph/types";
import type { GraphAction } from "../state/graphActions";
import { prepareGraphTransaction } from "../state/graphTransactions";
import type { GraphAppState } from "../state/initialState";

interface AppearanceUndo {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export function useGraphTransactions({ state, dispatch, fieldMapping, appearanceHistory }: {
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;
  fieldMapping: FieldMapping;
  appearanceHistory: AppearanceUndo;
}) {
  const commitBatch = useCallback((results: CommandResult[], label: string, selection?: GraphSelection | null): boolean => {
    const action = prepareGraphTransaction(state, results, label, selection);
    if (!action) return false;
    dispatch(action);
    return true;
  }, [dispatch, state]);

  const commitCommand = useCallback((command: GraphCommand, selection = state.selection): string | undefined => {
    if (!state.dag) return "No graph loaded.";
    try {
      const result = applyGraphCommand(state.dag, command, fieldMapping);
      commitBatch([result], result.message || "Updated graph.", selection);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The graph command failed.";
      dispatch({ type: "statusChanged", status: message });
      window.alert(message);
      return message;
    }
  }, [commitBatch, dispatch, fieldMapping, state.dag, state.selection]);

  const undo = useCallback(() => {
    if (state.editHistory.undoStack.length) dispatch({ type: "undoRequested" });
    else appearanceHistory.undo();
  }, [appearanceHistory.undo, dispatch, state.editHistory.undoStack.length]);

  const redo = useCallback(() => {
    if (state.editHistory.redoStack.length) dispatch({ type: "redoRequested" });
    else appearanceHistory.redo();
  }, [appearanceHistory.redo, dispatch, state.editHistory.redoStack.length]);

  return {
    commitCommand, commitBatch, undo, redo,
    canUndo: state.editHistory.undoStack.length > 0 || appearanceHistory.canUndo,
    canRedo: state.editHistory.redoStack.length > 0 || appearanceHistory.canRedo,
  };
}

export type GraphTransactionsController = ReturnType<typeof useGraphTransactions>;
