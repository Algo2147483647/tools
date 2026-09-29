import { useCallback, useReducer, type Dispatch } from "react";
import { DEFAULT_GRAPH_APPEARANCE, sanitizeGraphAppearance, type GraphAppearance, type GraphLayoutAppearance } from "../graph/appearance";
import { applyAppearanceCommand, type GraphAppearancePresetId } from "../graph/appearanceCommands";
import { buildTimestampFileName, downloadJsonFile } from "../adapters/download";
import { openJsonFileWithAccess, readJsonFile } from "../adapters/fileAccess";
import type { GraphAction } from "../state/graphActions";
import { appearanceHistoryReducer, createAppearanceHistory } from "../state/appearanceHistory";

export function useAppearanceHistory(initialAppearance: GraphAppearance, dispatch: Dispatch<GraphAction>) {
  const [history, updateHistory] = useReducer(appearanceHistoryReducer, initialAppearance, createAppearanceHistory);
  const { appearance } = history;
  const commitAppearance = useCallback((nextAppearance: GraphAppearance, label: string) => {
    updateHistory({ type: "commit", appearance: nextAppearance, label });
  }, []);
  const undo = useCallback(() => {
    const transaction = history.undoStack.at(-1);
    if (!transaction) return;
    updateHistory({ type: "undo" });
    dispatch({ type: "statusChanged", status: `Undid: ${transaction.label}` });
  }, [dispatch, history.undoStack]);
  const redo = useCallback(() => {
    const transaction = history.redoStack.at(-1);
    if (!transaction) return;
    updateHistory({ type: "redo" });
    dispatch({ type: "statusChanged", status: `Redid: ${transaction.label}` });
  }, [dispatch, history.redoStack]);
  function handleLayoutAppearanceChange<K extends keyof GraphLayoutAppearance>(key: K, value: GraphLayoutAppearance[K]) {
    const nextAppearance = sanitizeGraphAppearance({
      ...appearance,
      layout: {
        ...appearance.layout,
        [key]: value,
      },
    });
    commitAppearance(nextAppearance, `Set layout ${String(key)}.`);
  }

  function handleAppearanceCssVarChange(key: string, value: string) {
    const nextAppearance = sanitizeGraphAppearance({
      ...appearance,
      cssVars: {
        ...appearance.cssVars,
        [key]: value,
      },
    });
    commitAppearance(nextAppearance, `Set ${key}.`);
  }

  function handleAppearanceDisplayChange<K extends keyof GraphAppearance["display"]>(key: K, value: GraphAppearance["display"][K]) {
    const nextAppearance = sanitizeGraphAppearance({
      ...appearance,
      display: {
        ...appearance.display,
        [key]: value,
      },
    });
    commitAppearance(nextAppearance, `Set display ${String(key)}.`);
  }

  function handleAppearanceCssChange(css: string) {
    commitAppearance(applyAppearanceCommand(appearance, { type: "replaceCss", css }).appearance, "Replaced graph CSS.");
  }

  function handleAppearancePresetChange(presetId: GraphAppearancePresetId) {
    commitAppearance(applyAppearanceCommand(appearance, { type: "applyPreset", presetId }).appearance, `Applied ${presetId} appearance preset.`);
  }

  function handleAppearanceReset() {
    commitAppearance(DEFAULT_GRAPH_APPEARANCE, "Reset graph appearance.");
  }

  function handleAppearanceExport() {
    const outputFileName = buildTimestampFileName("dag-appearance.json");
    downloadJsonFile(JSON.stringify(appearance, null, 2), outputFileName);
    dispatch({ type: "statusChanged", status: `Exported current UI appearance as ${outputFileName}.` });
  }

  async function handleAppearanceImportClick(event: React.MouseEvent<HTMLInputElement>) {
    if (typeof window.showOpenFilePicker !== "function") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      const pickedFile = await openJsonFileWithAccess();
      if (pickedFile) {
        await importAppearanceFile(pickedFile.file);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error(error);
      dispatch({ type: "statusChanged", status: "The selected UI appearance file could not be opened." });
    }
  }

  async function handleAppearanceImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await importAppearanceFile(file);
    event.target.value = "";
  }

  async function importAppearanceFile(file: File) {
    try {
      const payload = await readJsonFile(file);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Appearance JSON must be an object.");
      }
      commitAppearance(sanitizeGraphAppearance(payload), `Imported graph appearance from ${file.name}.`);
      dispatch({ type: "statusChanged", status: `Imported UI appearance from ${file.name}.` });
    } catch (error) {
      console.error(error);
      dispatch({ type: "statusChanged", status: `Unable to import UI appearance from ${file.name}.` });
    }
  }

  return {
    appearance, commitAppearance, undo, redo,
    canUndo: history.undoStack.length > 0, canRedo: history.redoStack.length > 0,
    handleLayoutAppearanceChange, handleAppearanceCssVarChange,
    handleAppearanceDisplayChange, handleAppearanceCssChange,
    handleAppearancePresetChange, handleAppearanceReset, handleAppearanceExport,
    handleAppearanceImportClick, handleAppearanceImportChange,
  };
}

export type AppearanceHistoryController = ReturnType<typeof useAppearanceHistory>;
