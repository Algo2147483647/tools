import { type Dispatch, useCallback, useMemo, useReducer } from "react";
import { buildTimestampFileName, downloadJsonFile } from "../adapters/download";
import { openJsonFileWithAccess, readJsonFile } from "../adapters/fileAccess";
import { type GraphAppearance, type GraphLayoutAppearance, sanitizeGraphAppearance } from "../graph/appearance";
import { type GraphAppearancePresetId, applyAppearanceCommand } from "../graph/appearanceCommands";
import type { GraphChartType } from "../graph/types";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "../state/chartPreferences";
import { parseChartStyleFile, serializeChartStyle } from "../state/chartStyleFile";
import { getDefaultChartStyle, type ChartStyles } from "../state/chartStyles";
import type { GraphAction } from "../state/graphActions";
import { resetAppearanceSection } from "../components/settings/appearanceSections";
import type { AppearanceGroup } from "../components/settings/settingsCatalog";

export function useChartPreferences(styles: ChartStyles, chartType: GraphChartType, dispatch: Dispatch<GraphAction>) {
  const [histories, updateHistories] = useReducer(chartPreferencesReducer, styles, createChartPreferences);
  const history = histories[chartType];
  const chartStyles = useMemo(() => getChartStyles(histories), [histories]);
  const toggleDisplay = (key: "showNodeDetail" | "hideNodeBorders" | "alignNodeWidthsToMax") =>
    updateHistories({ chartType, action: { type: "toggleDisplay", key } });
  const { appearance } = history;
  const beginAdjustment = useCallback(
    () => updateHistories({ chartType, action: { type: "beginAdjustment" } }),
    [chartType],
  );
  const endAdjustment = useCallback(
    () => updateHistories({ chartType, action: { type: "endAdjustment" } }),
    [chartType],
  );
  const commitAppearance = useCallback(
    (nextAppearance: GraphAppearance, label: string, resetDisplay = false) => {
      const { appearance: _appearance, ...display } = getDefaultChartStyle(chartType);
      updateHistories({
        chartType,
        action: { type: "commit", appearance: nextAppearance, label, ...(resetDisplay ? { display } : {}) },
      });
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
      applyAppearanceCommand(appearance, { type: "applyPreset", presetId }, chartType).appearance,
      `Applied ${presetId} appearance preset.`,
      presetId === "default",
    );
  }

  function handleAppearanceReset() {
    commitAppearance(getDefaultChartStyle(chartType).appearance, "Reset graph appearance.", true);
  }

  function handleAppearanceExport() {
    const outputFileName = buildTimestampFileName(`${chartType}-appearance.json`);
    downloadJsonFile(serializeChartStyle(chartType, chartStyles[chartType]), outputFileName);
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
      const { appearance: importedAppearance, ...display } = parseChartStyleFile(payload, chartType);
      updateHistories({
        chartType,
        action: {
          type: "commit",
          appearance: importedAppearance,
          display,
          label: `Imported graph appearance from ${file.name}.`,
        },
      });
      dispatch({ type: "statusChanged", status: `Imported UI appearance from ${file.name}.` });
    } catch (error) {
      console.error(error);
      dispatch({
        type: "statusChanged",
        status: `Unable to import ${file.name}: ${error instanceof Error ? error.message : "Invalid style file."}`,
      });
    }
  }

  return {
    beginAdjustment,
    endAdjustment,
    appearance,
    chartStyles,
    showNodeDetail: history.showNodeDetail,
    hideNodeBorders: history.hideNodeBorders,
    alignNodeWidthsToMax: history.alignNodeWidthsToMax,
    toggleNodeDetail: () => toggleDisplay("showNodeDetail"),
    toggleNodeBorders: () => toggleDisplay("hideNodeBorders"),
    toggleNodeWidthAlign: () => toggleDisplay("alignNodeWidthsToMax"),
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
    resetSection: (group: AppearanceGroup | "layout") =>
      commitAppearance(
        resetAppearanceSection(appearance, group, getDefaultChartStyle(chartType).appearance),
        `Reset ${group} style.`,
        group === "nodes",
      ),
    handleAppearanceExport,
    handleAppearanceImportClick,
    handleAppearanceImportChange,
  };
}

export type ChartPreferencesController = ReturnType<typeof useChartPreferences>;
