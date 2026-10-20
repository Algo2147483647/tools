import { type Dispatch, useEffect, useState } from "react";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import { type GraphPagePreferences, saveGraphPagePreferences } from "../state/preferences";
import { useChartPreferences } from "./useChartPreferences";
export function usePreferencesController(
  initial: GraphPagePreferences,
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
) {
  const charts = useChartPreferences(initial.chartStyles, state.chartType, dispatch);
  const [aiSettings, setAiSettings] = useState(initial.aiSettings);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(
      saveGraphPagePreferences({
        timelineSettings: { ...state.timelineSettings, typeColors: {}, pins: {}, locked: false },
        mode: state.mode,
        chartType: state.chartType,
        layoutMode: state.layout.mode,
        chartStyles: charts.chartStyles,
        consoleSidebarOpen: state.ui.consoleSidebarOpen,
        consoleSidebarWidth: state.ui.consoleSidebarWidth,
        aiSettings,
      }),
    );
  }, [
    charts.chartStyles,
    aiSettings,
    state.timelineSettings,
    state.mode,
    state.chartType,
    state.layout.mode,
    state.ui.consoleSidebarOpen,
    state.ui.consoleSidebarWidth,
  ]);
  return { charts, aiSettings, setAiSettings, saved };
}
export type PreferencesController = ReturnType<typeof usePreferencesController>;
