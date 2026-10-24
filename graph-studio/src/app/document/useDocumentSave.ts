import { type Dispatch, useRef } from "react";
import { buildTimestampFileName, downloadJsonFile } from "../../shared/browser/download";
import { canOverwrite, requestWritablePermission, writeJsonToHandle } from "../../shared/browser/fileAccess";
import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";
import { createDocumentSaver } from "./saveDocument";
export function useDocumentSave({
  state,
  currentJsonContent,
  dispatch,
}: {
  state: GraphAppState;
  currentJsonContent: string;
  dispatch: Dispatch<GraphAction>;
}) {
  const current = useRef(state);
  current.current = state;
  const saver = useRef(createDocumentSaver({ requestPermission: requestWritablePermission, write: writeJsonToHandle }));
  async function handleOverwriteJson() {
    if (!canOverwrite(state.source.fileHandle)) {
      dispatch({
        type: "statusChanged",
        status: "Direct overwrite is unavailable. Reopen the JSON with file access, or save a new copy.",
      });
      return;
    }
    const action = await saver.current(
      state,
      currentJsonContent,
      () => current.current.document.generation === state.document.generation,
    );
    if (action) dispatch(action);
  }
  function handleSaveJsonAsNew() {
    const outputFileName = buildTimestampFileName(state.source.fileName || "graph.json");
    downloadJsonFile(currentJsonContent, outputFileName);
    dispatch({
      type: "savedAsCopy",
      status: "Saved JSON as " + outputFileName + ". Original file still has unsaved changes.",
    });
  }
  return { handleOverwriteJson, handleSaveJsonAsNew };
}
