import { createGraphDocument } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import type { NormalizedDag } from "../graph/types";
import type { EditTransaction } from "./initialState";

export function serializeDagToJson(dag: NormalizedDag): string {
  return JSON.stringify(serializeDag(dag), null, 2);
}

export function getSavedRevisionDag(
  editHistory: {
    undoStack: EditTransaction[];
    revision: number;
    savedRevision: number;
  },
  currentDag: NormalizedDag | null,
): NormalizedDag | null {
  if (!currentDag) {
    return null;
  }
  if (editHistory.savedRevision < 0) {
    return createGraphDocument();
  }
  if (editHistory.savedRevision === editHistory.revision) {
    return currentDag;
  }

  const savedTransaction = editHistory.undoStack.find((transaction) => transaction.revisionAfter === editHistory.savedRevision);
  if (savedTransaction) {
    return savedTransaction.afterDag;
  }

  const nextTransaction = editHistory.undoStack.find((transaction) => transaction.revisionBefore === editHistory.savedRevision);
  return nextTransaction?.beforeDag || currentDag;
}
