import type { GraphAppearance } from "../graph/appearance";
import type { GraphChartType } from "../graph/types";
import type { ChartStyles } from "./chartStyles";

interface AppearanceTransaction {
  label: string;
  before: GraphAppearance;
  after: GraphAppearance;
}

interface AppearanceHistory {
  appearance: GraphAppearance;
  undoStack: AppearanceTransaction[];
  redoStack: AppearanceTransaction[];
}

type AppearanceHistoryAction =
  | { type: "commit"; appearance: GraphAppearance; label: string }
  | { type: "undo" }
  | { type: "redo" };

function createAppearanceHistory(appearance: GraphAppearance): AppearanceHistory {
  return { appearance, undoStack: [], redoStack: [] };
}

type ChartAppearanceHistory = Record<GraphChartType, AppearanceHistory>;

export function createChartAppearanceHistory(styles: ChartStyles): ChartAppearanceHistory {
  return {
    "node-link": createAppearanceHistory(styles["node-link"].appearance),
    sankey: createAppearanceHistory(styles.sankey.appearance),
  };
}

export function chartAppearanceHistoryReducer(state: ChartAppearanceHistory, input: { chartType: GraphChartType; action: AppearanceHistoryAction }): ChartAppearanceHistory {
  const history = appearanceHistoryReducer(state[input.chartType], input.action);
  return history === state[input.chartType] ? state : { ...state, [input.chartType]: history };
}

function appearanceHistoryReducer(state: AppearanceHistory, action: AppearanceHistoryAction): AppearanceHistory {
  switch (action.type) {
    case "commit": {
      if (JSON.stringify(state.appearance) === JSON.stringify(action.appearance)) return state;
      const transaction = { label: action.label, before: state.appearance, after: action.appearance };
      return { appearance: action.appearance, undoStack: [...state.undoStack, transaction].slice(-100), redoStack: [] };
    }
    case "undo": {
      const transaction = state.undoStack.at(-1);
      return transaction ? {
        appearance: transaction.before,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, transaction],
      } : state;
    }
    case "redo": {
      const transaction = state.redoStack.at(-1);
      return transaction ? {
        appearance: transaction.after,
        undoStack: [...state.undoStack, transaction].slice(-100),
        redoStack: state.redoStack.slice(0, -1),
      } : state;
    }
  }
}
