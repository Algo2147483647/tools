import { prepareGraphTransaction } from "../document/graphTransactions";
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
  const history = { ...histories[chartType], ...state.documentStyles[chartType] };
  const chartStyles = useMemo(() => {
    const current = getChartStyles(histories);
    return mapChartTypes((type) => createStyleDocument(type, state.documentStyles[type] ?? current[type]));
  }, [histories, state.documentStyles]);
  const { appearance } = history;
  const commitAppearance = useCallback(
    (nextAppearance: GraphAppearance, label: string, resetDisplay = false, timeline?: TimelineViewSettings) => {
      const { appearance: _appearance, timeline: _timeline, ...display } = getDefaultChartStyle(chartType);
      if (state.dag) {
        commitDocumentStyle(
          {
            ...getChartStyles(histories)[chartType],
            ...state.documentStyles[chartType],
            appearance: nextAppearance,
            ...(resetDisplay ? display : {}),
            ...(chartType === "timeline" ? { timeline: timeline ?? state.timelineSettings } : {}),
          },
          label,
        );
        return;
      }
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
    [chartType, state, histories, dispatch],
  );
  const undo = useCallback(() => {
    if (state.dag) {
      if (state.editHistory.undoStack.at(-1)?.beforeStyles) dispatch({ type: "undoRequested" });
      return;
    }
    const transaction = history.undoStack.at(-1);
    if (!transaction) return;
    updateHistories({ chartType, action: { type: "undo" } });
    if (chartType === "timeline" && transaction.beforeTimeline)
      dispatch({ type: "timelineSettingsChanged", patch: transaction.beforeTimeline });
    dispatch({ type: "statusChanged", status: `Undid: ${transaction.label}` });
  }, [chartType, dispatch, history.undoStack, state.dag, state.editHistory.undoStack]);
  const redo = useCallback(() => {
    if (state.dag) {
      if (state.editHistory.redoStack.at(-1)?.afterStyles) dispatch({ type: "redoRequested" });
      return;
    }
    const transaction = history.redoStack.at(-1);
    if (!transaction) return;
    updateHistories({ chartType, action: { type: "redo" } });
    if (chartType === "timeline" && transaction.afterTimeline)
      dispatch({ type: "timelineSettingsChanged", patch: transaction.afterTimeline });
    dispatch({ type: "statusChanged", status: `Redid: ${transaction.label}` });
  }, [chartType, dispatch, history.redoStack, state.dag, state.editHistory.redoStack]);
  function handleAppearanceCssChange(css: string) {
    commitAppearance(applyAppearanceCommand(appearance, { type: "replaceCss", css }).appearance, "Replaced graph CSS.");
  }

  function handleAppearanceReset() {
    commitStyle(getDefaultChartStyle(chartType), "Reset graph appearance.");
  }

  function commitDocumentStyle(style: ChartStyle, label: string) {
    if (!state.dag) return;
    const action = prepareGraphTransaction(state, [{ dag: state.dag, changedKeys: [] }], label)!;
    Object.assign(action.transaction, {
      beforeStyles: state.documentStyles,
      afterStyles: { ...state.documentStyles, [chartType]: style },
      beforeTimeline: state.timelineSettings,
      afterTimeline: style.timeline ?? state.timelineSettings,
    });
    dispatch(action);
  }

  function commitStyle(style: ChartStyle, label: string) {
    if (state.dag) {
      commitDocumentStyle(style, label);
      return;
    }
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
    appearance,
    chartStyles,
    showNodeDetail: history.showNodeDetail,
    hideNodeBorders: history.hideNodeBorders,
    alignNodeWidthsToMax: history.alignNodeWidthsToMax,
    commitAppearance,
    undo,
    redo,
    canUndo: state.dag ? !!state.editHistory.undoStack.at(-1)?.beforeStyles : history.undoStack.length > 0,
    canRedo: state.dag ? !!state.editHistory.redoStack.at(-1)?.afterStyles : history.redoStack.length > 0,
    handleAppearanceCssChange,
    handleAppearanceSchemaChange: (style: ChartStyle) => commitStyle(style, "Edited appearance schema."),
    handleAppearanceReset,
  };
}
