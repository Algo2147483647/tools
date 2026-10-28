import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { GraphTransactionsController } from "../document/useGraphTransactions";

export function useStudioShortcuts(
  session: { closeModals(): void; requestSave(): void },
  transactions: Pick<GraphTransactionsController, "undo" | "redo">,
) {
  useKeyboardShortcuts({
    onEscape: () => {
      session.closeModals();
    },
    onUndo: transactions.undo,
    onRedo: transactions.redo,
    onSave: session.requestSave,
  });
}
