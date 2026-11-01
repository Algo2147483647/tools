import { chooseLocalPath, openLocalFile, readLocalFile, writeLocalFile, LocalApiError } from "../../workspace/localApi";
import { type Dispatch, useRef } from "react";
import { buildTimestampFileName } from "../../shared/browser/download";
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
  const saving = useRef(false);
  async function handleOverwriteJson() {
    if (state.source.localFile && state.dag) {
      if (saving.current) return;
      saving.current = true;
      const generation = state.document.generation;
      try {
        await writeLocalFile(state.source.localFile, currentJsonContent);
        if (current.current.document.generation === generation)
          dispatch({
            type: "saved",
            generation,
            revision: state.editHistory.revision,
            dag: state.dag,
            status: "Saved " + state.source.fileName + ".",
          });
      } catch (error) {
        if (current.current.document.generation === generation)
          dispatch({ type: "statusChanged", status: error instanceof Error ? error.message : "Unable to save." });
      } finally {
        saving.current = false;
      }
      return;
    }
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
  async function handleSaveJsonAsNew() {
    if (saving.current) return;
    saving.current = true;
    const generation = state.document.generation;
    try {
      const path = await chooseLocalPath("save", buildTimestampFileName(state.source.fileName || "graph.json"));
      if (!path) return;
      const { entry } = await openLocalFile(path, undefined, true);
      try {
        await readLocalFile(entry.local!);
      } catch (error) {
        if (!(error instanceof LocalApiError) || error.code !== "ENOENT") throw error;
        entry.local!.revision = null;
      }
      await writeLocalFile(entry.local!, currentJsonContent);
      if (current.current.document.generation === generation)
        dispatch({
          type: "savedAsCopy",
          status: "Saved JSON as " + path + ". Original file still has unsaved changes.",
        });
    } catch (error) {
      if (current.current.document.generation === generation)
        dispatch({ type: "statusChanged", status: error instanceof Error ? error.message : "Unable to save copy." });
    } finally {
      saving.current = false;
    }
  }
  return { handleOverwriteJson, handleSaveJsonAsNew };
}
