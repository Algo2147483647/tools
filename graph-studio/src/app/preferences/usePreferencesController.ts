import { type Dispatch, useEffect, useState } from "react";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import { type GraphPagePreferences, saveGraphPagePreferences } from "./preferences";
import { useChartPreferences } from "./useChartPreferences";
export function usePreferencesController(
  initial: GraphPagePreferences,
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
) {
  const charts = useChartPreferences(initial.chartStyles, state.chartType, dispatch, state);
  const [aiSettings, setAiSettings] = useState(initial.aiSettings);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(
      saveGraphPagePreferences({
        ...initial,
        mode: state.mode,
        chartType: state.chartType,
        layoutMode: state.layout.mode,
        consoleSidebarOpen: state.ui.consoleSidebarOpen,
        consoleSidebarWidth: state.ui.consoleSidebarWidth,
        aiSettings,
      }),
    );
  }, [
    initial,
    aiSettings,
    state.mode,
    state.chartType,
    state.layout.mode,
    state.ui.consoleSidebarOpen,
    state.ui.consoleSidebarWidth,
  ]);
  return { charts, aiSettings, setAiSettings, saved };
}
export type PreferencesController = ReturnType<typeof usePreferencesController>;
