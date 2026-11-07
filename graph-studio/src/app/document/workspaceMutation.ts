import { analyzeReferences } from "../../workspace/referenceAdapters";
import { serializeDagToJson } from "../../graph/serialize";
import { normalizeDagInput } from "../../graph/normalize";
import { createInitialGraphState, type GraphAppState, type EditTransaction } from "./initialState";
import type { NormalizedDag } from "../../graph/types";

/** Rebase both live edits and edit history so undo cannot resurrect old paths. */
export function rebaseWorkspaceDocument(
  state: GraphAppState,
  path: string,
  newPath: string | undefined,
  revision: string,
  fileName: string,
  caseInsensitive = false,
): GraphAppState {
  if (!state.dag) return state;
  const rewrite = (dag: NormalizedDag) =>
    normalizeDagInput(
      JSON.parse(
        analyzeReferences(state.source.fileName, serializeDagToJson(dag)).rewrite(path, newPath, caseInsensitive),
      ),
    );
  const history = (entry: EditTransaction): EditTransaction => ({
    ...entry,
    beforeDag: rewrite(entry.beforeDag),
    afterDag: rewrite(entry.afterDag),
  });
  const dag = rewrite(state.dag);
  const removedStyle = Boolean(state.dag.metadata?.style && !dag.metadata?.style);
  const removedLayout = Boolean(state.dag.metadata?.layout && !dag.metadata?.layout);
  const defaults = removedStyle || removedLayout ? createInitialGraphState() : null;
  const documentStyles = { ...state.documentStyles };
  if (removedStyle && state.document.linkedChartType) delete documentStyles[state.document.linkedChartType];
  return {
    ...state,
    documentStyles,
    ...(removedLayout ? { layoutSession: defaults!.layoutSession } : {}),
    ...(removedStyle && state.document.linkedChartType === "timeline"
      ? { timelineSettings: defaults!.timelineSettings }
      : {}),
    dag,
    source: {
      ...state.source,
      fileName,
      localFile: state.source.localFile ? { ...state.source.localFile, path: fileName, revision } : undefined,
    },
    document: {
      ...state.document,
      generation: state.document.generation + 1,
      ...(removedStyle ? { linkedStyle: undefined, linkedChartType: undefined } : {}),
      id: state.document.id.replace(state.source.fileName, fileName),
      savedDag: state.document.savedDag ? rewrite(state.document.savedDag) : null,
    },
    editHistory: {
      ...state.editHistory,
      undoStack: state.editHistory.undoStack.map(history),
      redoStack: state.editHistory.redoStack.map(history),
    },
  };
}
