import type { GraphAppearance } from "../graph/appearance";
import type { GraphChartType } from "../graph/types";
import { mapChartTypes, type ChartStyle, type ChartStyles } from "./chartStyles";

interface AppearanceTransaction {
  label: string;
  before: GraphAppearance;
  after: GraphAppearance;
}

interface AppearanceHistory extends ChartStyle {
  adjustment?: { before: GraphAppearance; label: string };
  undoStack: AppearanceTransaction[];
  redoStack: AppearanceTransaction[];
}

type AppearanceHistoryAction =
  | { type: "beginAdjustment" }
  | { type: "endAdjustment" }
  | { type: "commit"; appearance: GraphAppearance; label: string }
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
      if (JSON.stringify(state.appearance) === JSON.stringify(action.appearance)) return state;
      if (state.adjustment)
        return { ...state, appearance: action.appearance, adjustment: { ...state.adjustment, label: action.label } };
      const transaction = { label: action.label, before: state.appearance, after: action.appearance };
      return {
        ...state,
        appearance: action.appearance,
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
            undoStack: [...state.undoStack, transaction].slice(-100),
            redoStack: state.redoStack.slice(0, -1),
          }
        : state;
    }
  }
}
