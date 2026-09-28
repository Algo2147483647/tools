import type { Dispatch } from "react";
import { buildTimestampFileName, downloadJsonFile, ensureJsonExtension } from "../adapters/download";
import { canOverwrite, requestWritablePermission, writeJsonToHandle } from "../adapters/fileAccess";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";

export function useGraphSave({
  source,
  currentJsonContent,
  dispatch,
}: {
  source: GraphAppState["source"];
  currentJsonContent: string;
  dispatch: Dispatch<GraphAction>;
}) {
  async function handleOverwriteJson() {
    if (!source.fileHandle || !canOverwrite(source.fileHandle)) {
      dispatch({ type: "statusChanged", status: "Direct overwrite is unavailable. Reopen the JSON with file access, or save a new copy." });
      return;
    }
    const sourceFileName = ensureJsonExtension(source.fileName || source.fileHandle.name || "graph.json");
    try {
      const granted = await requestWritablePermission(source.fileHandle);
      if (!granted) {
        dispatch({ type: "statusChanged", status: "Write permission was not granted for the source JSON file." });
        return;
      }
      await writeJsonToHandle(source.fileHandle, currentJsonContent);
      dispatch({ type: "saved", status: `Saved JSON to ${sourceFileName}.` });
    } catch (error) {
      console.error(error);
      dispatch({ type: "statusChanged", status: `Unable to overwrite ${sourceFileName}.` });
    }
  }

  function handleSaveJsonAsNew() {
    const outputFileName = buildTimestampFileName(source.fileName || "graph.json");
    downloadJsonFile(currentJsonContent, outputFileName);
    dispatch({ type: "savedAsCopy", status: `Saved JSON as ${outputFileName}. Original file still has unsaved changes.` });
  }

  return {
    handleOverwriteJson,
    handleSaveJsonAsNew,
  };
}
