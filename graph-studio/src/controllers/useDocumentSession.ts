import { useCallback, useMemo, useReducer } from "react";
import { createInitialCanvasDag, INITIAL_CANVAS_FILE_NAME } from "../graph/initialCanvas";
import { createGraphDocument } from "../graph/normalize";
import { getInitialSelection } from "../graph/selectors";
import { useGraphSave } from "../hooks/useGraphSave";
import { serializeDagToJson } from "../state/documentSerialization";
import { graphReducer } from "../state/graphReducer";
import { createInitialGraphState } from "../state/initialState";
import type { GraphPagePreferences } from "../state/preferences";

export function useDocumentSession(preferences: GraphPagePreferences) {
  const [state, dispatch] = useReducer(graphReducer, preferences, createInitialGraphState);

  const currentJsonContent = useMemo(() => serializeDagToJson(state.dag || createGraphDocument()), [state.dag]);
  const savedJsonContent = useMemo(
    () => serializeDagToJson(state.document.savedDag || createGraphDocument()),
    [state.document.savedDag],
  );
  const save = useGraphSave({ state, currentJsonContent, dispatch });
  const requestSave = useCallback(() => {
    dispatch(
      state.dag
        ? { type: "saveDialogOpened" }
        : { type: "statusChanged", status: "Load or render a graph before saving JSON." },
    );
  }, [state.dag]);
  function initializeCanvas() {
    const dag = createInitialCanvasDag();
    dispatch({
      type: "canvasInitialized",
      documentId: crypto.randomUUID(),
      dag,
      fileName: INITIAL_CANVAS_FILE_NAME,
      selection: getInitialSelection(dag),
      status: "Initialized a new canvas with one starting node.",
    });
  }

  return { state, dispatch, ...save, currentJsonContent, savedJsonContent, requestSave, initializeCanvas };
}
export type DocumentSessionController = ReturnType<typeof useDocumentSession>;
