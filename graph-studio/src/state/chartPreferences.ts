import type { GraphAppearance } from "../graph/appearance";
import type { GraphChartType } from "../graph/types";
import type { TimelineViewSettings } from "../graph/timelineSettings";
import {
  mapChartTypes,
  chartStylesEqual,
  type ChartStyle,
  type ChartStyles,
  type ChartDisplayOptions,
} from "./chartStyles";

interface AppearanceTransaction {
  label: string;
  before: GraphAppearance;
  after: GraphAppearance;
  beforeDisplay?: ChartDisplayOptions;
  afterDisplay?: ChartDisplayOptions;
  beforeTimeline?: TimelineViewSettings;
  afterTimeline?: TimelineViewSettings;
}

interface AppearanceHistory extends ChartStyle {
  adjustment?: { before: GraphAppearance; label: string };
  undoStack: AppearanceTransaction[];
  redoStack: AppearanceTransaction[];
}

type AppearanceHistoryAction =
  | { type: "replace"; style: ChartStyle }
  | { type: "beginAdjustment" }
  | { type: "endAdjustment" }
  | {
      type: "commit";
      appearance: GraphAppearance;
      label: string;
      display?: ChartDisplayOptions;
      timeline?: { before: TimelineViewSettings; after: TimelineViewSettings };
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "toggleDisplay"; key: "showNodeDetail" | "hideNodeBorders" | "alignNodeWidthsToMax" };

function createAppearanceHistory(style: ChartStyle): AppearanceHistory {
  return { ...style, undoStack: [], redoStack: [] };
}

type ChartPreferencesState = Record<GraphChartType, AppearanceHistory>;

export function createChartPreferences(styles: ChartStyles): ChartPreferencesState {
  return mapChartTypes((type) => createAppearanceHistory(styles[type]));
}

export function getChartStyles(state: ChartPreferencesState): ChartStyles {
  return mapChartTypes((type) => {
    const { undoStack: _undo, redoStack: _redo, adjustment: _adjustment, ...style } = state[type];
    return style;
  });
}

export function chartPreferencesReducer(
  state: ChartPreferencesState,
  input: { chartType: GraphChartType; action: AppearanceHistoryAction },
): ChartPreferencesState {
  const history = appearanceHistoryReducer(state[input.chartType], input.action);
  return history === state[input.chartType] ? state : { ...state, [input.chartType]: history };
}

function appearanceHistoryReducer(state: AppearanceHistory, action: AppearanceHistoryAction): AppearanceHistory {
  switch (action.type) {
    case "replace":
      return createAppearanceHistory(action.style);
    case "beginAdjustment":
      return state.adjustment
        ? state
        : { ...state, adjustment: { before: state.appearance, label: "Adjust appearance." } };
    case "endAdjustment": {
      if (!state.adjustment) return state;
      const { adjustment, ...settled } = state;
      if (JSON.stringify(adjustment.before) === JSON.stringify(state.appearance)) return settled;
      return {
        ...settled,
        undoStack: [...state.undoStack, { ...adjustment, after: state.appearance }].slice(-100),
        redoStack: [],
      };
    }
    case "toggleDisplay":
      return { ...state, [action.key]: !state[action.key] };
    case "commit": {
      if ((action.display || action.timeline) && state.adjustment)
        return appearanceHistoryReducer(appearanceHistoryReducer(state, { type: "endAdjustment" }), action);
      const beforeDisplay = {
        showNodeDetail: state.showNodeDetail,
        hideNodeBorders: state.hideNodeBorders,
        alignNodeWidthsToMax: state.alignNodeWidthsToMax,
      };
      if (
        chartStylesEqual(
          { appearance: state.appearance, ...beforeDisplay, timeline: action.timeline?.before ?? state.timeline },
          {
            appearance: action.appearance,
            ...(action.display ?? beforeDisplay),
            timeline: action.timeline?.after ?? state.timeline,
          },
        )
      )
        return state;
      if (state.adjustment)
        return { ...state, appearance: action.appearance, adjustment: { ...state.adjustment, label: action.label } };
      const transaction = {
        label: action.label,
        before: state.appearance,
        after: action.appearance,
        ...(action.display ? { beforeDisplay, afterDisplay: action.display } : {}),
        ...(action.timeline
          ? {
              beforeTimeline: structuredClone(action.timeline.before),
              afterTimeline: structuredClone(action.timeline.after),
            }
          : {}),
      };
      return {
        ...state,
        ...action.display,
        appearance: action.appearance,
        ...(action.timeline ? { timeline: action.timeline.after } : {}),
        undoStack: [...state.undoStack, transaction].slice(-100),
        redoStack: [],
      };
    }
    case "undo": {
      const transaction = state.undoStack.at(-1);
      return transaction
        ? {
            ...state,
            appearance: transaction.before,
            ...transaction.beforeDisplay,
            ...(transaction.beforeTimeline ? { timeline: transaction.beforeTimeline } : {}),
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, transaction],
          }
        : state;
    }
    case "redo": {
      const transaction = state.redoStack.at(-1);
      return transaction
        ? {
            ...state,
            appearance: transaction.after,
            ...transaction.afterDisplay,
            ...(transaction.afterTimeline ? { timeline: transaction.afterTimeline } : {}),
            undoStack: [...state.undoStack, transaction].slice(-100),
            redoStack: state.redoStack.slice(0, -1),
          }
        : state;
    }
  }
}
