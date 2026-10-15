import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useOutsideDismiss } from "../hooks/useOutsideDismiss";
import type { GraphTransactionsController } from "./useGraphTransactions";

export function useStudioShortcuts(session: { contextMenuOpen: boolean; closeContextMenu(): void; closeModals(): void; requestSave(): void }, transactions: Pick<GraphTransactionsController, "undo" | "redo">) {
  useOutsideDismiss(session.contextMenuOpen, session.closeContextMenu);
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
