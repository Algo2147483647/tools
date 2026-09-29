import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useOutsideDismiss } from "../hooks/useOutsideDismiss";
import type { DocumentSessionController } from "./useDocumentSession";
import type { GraphTransactionsController } from "./useGraphTransactions";

export function useStudioShortcuts(session: DocumentSessionController, transactions: GraphTransactionsController) {
  useOutsideDismiss(Boolean(session.state.ui.contextMenu), session.closeContextMenu);
  useKeyboardShortcuts({
    onEscape: () => {
      session.closeContextMenu();
      session.closeModals();
    },
    onUndo: transactions.undo,
    onRedo: transactions.redo,
    onSave: session.requestSave,
  });
}
