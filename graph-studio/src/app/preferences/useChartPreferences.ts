import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type GraphAppearance } from "../../schema/appearance/defaults";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { GraphChartType } from "../../graph/types";
import { applyAppearanceCommand } from "../../schema/appearance/commands";
import type { ChartStyleDocuments } from "../../schema/appearance/types";
import { type ChartStyle, getDefaultChartStyle, mapChartTypes } from "../../schema/appearance/styles";
import { createStyleDocument } from "../../schema/styleProtocol";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "./chartPreferences";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";

export function useChartPreferences(
  styles: ChartStyleDocuments,
  chartType: GraphChartType,
  dispatch: Dispatch<GraphAction>,
  state: GraphAppState,
) {
  const [histories, updateHistories] = useReducer(chartPreferencesReducer, styles, (documents) =>
    createChartPreferences(mapChartTypes((type) => documents[type].style)),
  );
  const previousDocument = useRef(-1);
  useEffect(() => {
    if (previousDocument.current === state.document.generation) return;
    previousDocument.current = state.document.generation;
    for (const type of Object.keys(styles) as GraphChartType[]) {
      updateHistories({
        chartType: type,
        action: {
          type: "replace",
          style:
            type === (state.document.linkedChartType ?? chartType) && state.document.linkedStyle
              ? state.document.linkedStyle
              : getDefaultChartStyle(type),
        },
      });
    }
  }, [state.document.generation, state.document.linkedStyle, chartType, styles]);
  const history = histories[chartType];
  const chartStyles = useMemo(() => {
    const current = getChartStyles(histories);
    return mapChartTypes((type) => createStyleDocument(type, current[type]));
  }, [histories]);
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
  function handleAppearanceCssChange(css: string) {
    commitAppearance(applyAppearanceCommand(appearance, { type: "replaceCss", css }).appearance, "Replaced graph CSS.");
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

  return {
    beginAdjustment,
    endAdjustment,
    appearance,
    chartStyles,
    showNodeDetail: history.showNodeDetail,
    hideNodeBorders: history.hideNodeBorders,
    alignNodeWidthsToMax: history.alignNodeWidthsToMax,
    commitAppearance,
    undo,
    redo,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0,
    handleAppearanceCssChange,
    handleAppearanceSchemaChange: (style: ChartStyle) => commitStyle(style, "Edited appearance schema."),
    handleAppearanceReset,
  };
}
