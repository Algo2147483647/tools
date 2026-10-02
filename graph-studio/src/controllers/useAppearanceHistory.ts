import { type Dispatch, useCallback, useMemo, useReducer } from "react";
import { buildTimestampFileName, downloadJsonFile } from "../adapters/download";
import { openJsonFileWithAccess, readJsonFile } from "../adapters/fileAccess";
import {
  type GraphAppearance,
  type GraphLayoutAppearance,
  DEFAULT_GRAPH_APPEARANCE,
  sanitizeGraphAppearance,
} from "../graph/appearance";
import { type GraphAppearancePresetId, applyAppearanceCommand } from "../graph/appearanceCommands";
import type { GraphChartType } from "../graph/types";
import { chartAppearanceHistoryReducer, createChartAppearanceHistory } from "../state/appearanceHistory";
import type { ChartStyles } from "../state/chartStyles";
import type { GraphAction } from "../state/graphActions";

export function useAppearanceHistory(styles: ChartStyles, chartType: GraphChartType, dispatch: Dispatch<GraphAction>) {
  const [histories, updateHistories] = useReducer(chartAppearanceHistoryReducer, styles, createChartAppearanceHistory);
  const history = histories[chartType];
  const appearanceByChart = useMemo(
    () => ({
      "node-link": histories["node-link"].appearance,
      sankey: histories.sankey.appearance,
      compound: histories.compound.appearance,
    }),
    [histories],
  );
  const { appearance } = history;
  const commitAppearance = useCallback(
    (nextAppearance: GraphAppearance, label: string) => {
      updateHistories({ chartType, action: { type: "commit", appearance: nextAppearance, label } });
    },
    [chartType],
  );
  const undo = useCallback(() => {
    const transaction = history.undoStack.at(-1);
    if (!transaction) return;
    updateHistories({ chartType, action: { type: "undo" } });
    dispatch({ type: "statusChanged", status: `Undid: ${transaction.label}` });
  }, [chartType, dispatch, history.undoStack]);
  const redo = useCallback(() => {
    const transaction = history.redoStack.at(-1);
    if (!transaction) return;
    updateHistories({ chartType, action: { type: "redo" } });
    dispatch({ type: "statusChanged", status: `Redid: ${transaction.label}` });
  }, [chartType, dispatch, history.redoStack]);
  function handleLayoutAppearanceChange<K extends keyof GraphLayoutAppearance>(
    key: K,
    value: GraphLayoutAppearance[K],
  ) {
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

  function handleAppearanceDisplayChange<K extends keyof GraphAppearance["display"]>(
    key: K,
    value: GraphAppearance["display"][K],
  ) {
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
    commitAppearance(
      applyAppearanceCommand(appearance, { type: "applyPreset", presetId }).appearance,
      `Applied ${presetId} appearance preset.`,
    );
  }

  function handleAppearanceReset() {
    commitAppearance(DEFAULT_GRAPH_APPEARANCE, "Reset graph appearance.");
  }

  function handleAppearanceExport() {
    const outputFileName = buildTimestampFileName(`${chartType}-appearance.json`);
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
    appearance,
    appearanceByChart,
    commitAppearance,
    undo,
    redo,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0,
    handleLayoutAppearanceChange,
    handleAppearanceCssVarChange,
    handleAppearanceDisplayChange,
    handleAppearanceCssChange,
    handleAppearancePresetChange,
    handleAppearanceReset,
    handleAppearanceExport,
    handleAppearanceImportClick,
    handleAppearanceImportChange,
  };
}

export type AppearanceHistoryController = ReturnType<typeof useAppearanceHistory>;
