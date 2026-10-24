import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { buildTimestampFileName, downloadJsonFile } from "../adapters/download";
import { openJsonFileWithAccess, readJsonFile } from "../adapters/fileAccess";
import { type GraphAppearance, type GraphLayoutAppearance, sanitizeGraphAppearance } from "../graph/appearance";
import { type GraphAppearancePresetId, applyAppearanceCommand, getGraphPresetStyle } from "../graph/appearanceCommands";
import type { GraphChartType } from "../graph/types";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "../state/chartPreferences";
import { parseChartStyleFile, serializeChartStyle } from "../state/chartStyleFile";
import { getDefaultChartStyle, type ChartStyles, type ChartStyle } from "../state/chartStyles";
import type { GraphAction } from "../state/graphActions";
import { resetChartStyleSection } from "../components/settings/appearanceSections";
import type { AppearanceGroup } from "../components/settings/settingsCatalog";
import type { GraphAppState } from "../state/initialState";
import type { TimelineViewSettings } from "../graph/timelineSettings";

export function useChartPreferences(
  styles: ChartStyles,
  chartType: GraphChartType,
  dispatch: Dispatch<GraphAction>,
  state: GraphAppState,
) {
  const [histories, updateHistories] = useReducer(chartPreferencesReducer, styles, createChartPreferences);
  const previousDocument = useRef(-1);
  const linkedChart = useRef<GraphChartType | null>(null);
  useEffect(() => {
    if (previousDocument.current === state.document.generation) return;
    previousDocument.current = state.document.generation;
    // Restore the user's chart preference when leaving a document with its own style.
    if (linkedChart.current) {
      updateHistories({
        chartType: linkedChart.current,
        action: { type: "replace", style: styles[linkedChart.current] },
      });
    }
    linkedChart.current = state.document.linkedStyle ? chartType : null;
    if (state.document.linkedStyle) {
      updateHistories({ chartType, action: { type: "replace", style: state.document.linkedStyle } });
    }
  }, [state.document.generation, state.document.linkedStyle, chartType, styles]);
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
    (nextAppearance: GraphAppearance, label: string, resetDisplay = false, timeline?: TimelineViewSettings) => {
      const { appearance: _appearance, timeline: _timeline, ...display } = getDefaultChartStyle(chartType);
      updateHistories({
        chartType,
        action: {
          type: "commit",
          appearance: nextAppearance,
          label,
          ...(resetDisplay ? { display } : {}),
          ...(timeline ? { timeline: { before: state.timelineSettings, after: timeline } } : {}),
        },
      });
      if (timeline) dispatch({ type: "timelineSettingsChanged", patch: timeline });
    },
    [chartType, state.timelineSettings, dispatch],
  );
  const undo = useCallback(() => {
    const transaction = history.undoStack.at(-1);
    if (!transaction) return;
    updateHistories({ chartType, action: { type: "undo" } });
    if (chartType === "timeline" && transaction.beforeTimeline)
      dispatch({ type: "timelineSettingsChanged", patch: transaction.beforeTimeline });
    dispatch({ type: "statusChanged", status: `Undid: ${transaction.label}` });
  }, [chartType, dispatch, history.undoStack]);
  const redo = useCallback(() => {
    const transaction = history.redoStack.at(-1);
    if (!transaction) return;
    updateHistories({ chartType, action: { type: "redo" } });
    if (chartType === "timeline" && transaction.afterTimeline)
      dispatch({ type: "timelineSettingsChanged", patch: transaction.afterTimeline });
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
    commitStyle(getGraphPresetStyle(chartType, presetId), `Applied ${presetId} appearance preset.`);
  }

  function handleAppearanceReset() {
    commitStyle(getDefaultChartStyle(chartType), "Reset graph appearance.");
  }

  function commitStyle(style: ChartStyle, label: string) {
    const { appearance, timeline, ...display } = style;
    const nextTimeline = chartType === "timeline" ? timeline : undefined;
    updateHistories({
      chartType,
      action: {
        type: "commit",
        appearance,
        display,
        label,
        ...(nextTimeline ? { timeline: { before: state.timelineSettings, after: nextTimeline } } : {}),
      },
    });
    if (nextTimeline) dispatch({ type: "timelineSettingsChanged", patch: nextTimeline });
  }
  function handleAppearanceExport() {
    const outputFileName = buildTimestampFileName(`${chartType}-appearance.json`);
    const style = {
      ...chartStyles[chartType],
      ...(chartType === "timeline" ? { timeline: state.timelineSettings } : {}),
    };
    downloadJsonFile(serializeChartStyle(chartType, style), outputFileName);
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
      commitStyle(parseChartStyleFile(payload, chartType), `Imported graph appearance from ${file.name}.`);
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
    linkedChartType: linkedChart.current,
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
    handleAppearanceSchemaChange: (style: ChartStyle) => commitStyle(style, "Edited appearance schema."),
    handleAppearanceReset,
    resetSection: (group: AppearanceGroup | "layout") =>
      commitStyle(
        resetChartStyleSection(
          {
            ...chartStyles[chartType],
            ...(chartType === "timeline" ? { timeline: state.timelineSettings } : {}),
          },
          chartType,
          group,
        ),
        `Reset ${group} style.`,
      ),
    handleAppearanceExport,
    handleAppearanceImportClick,
    handleAppearanceImportChange,
  };
}
