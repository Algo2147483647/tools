import { useEffect } from "react";
import type { AiSettings } from "../ai/types";
import type { GraphAppearance } from "../graph/appearance";
import type { GraphChartType } from "../graph/types";
import type { ChartDisplayOptions } from "../state/chartStyles";
import type { FieldMapping } from "../graph/fieldMapping";
import type { GraphAppState } from "../state/initialState";
import { saveGraphPagePreferences } from "../state/preferences";

export function useGraphPreferences({
  state,
  appearanceByChart,
  displayByChart,
  fieldMapping,
  aiSettings,
}: {
  state: GraphAppState;
  appearanceByChart: Record<GraphChartType, GraphAppearance>;
  displayByChart: Record<GraphChartType, ChartDisplayOptions>;
  fieldMapping: FieldMapping;
  aiSettings: AiSettings;
}) {
  useEffect(() => {
    saveGraphPagePreferences({
      mode: state.mode,
      chartType: state.chartType,
      layoutMode: state.layout.mode,
      chartStyles: {
        "node-link": { ...displayByChart["node-link"], appearance: appearanceByChart["node-link"] },
        sankey: { ...displayByChart.sankey, appearance: appearanceByChart.sankey },
      },
      consoleSidebarOpen: state.ui.consoleSidebarOpen,
      consoleSidebarWidth: state.ui.consoleSidebarWidth,
      fieldMapping,
      aiSettings,
    });
  }, [aiSettings, appearanceByChart, displayByChart, fieldMapping, state.chartType, state.layout.mode, state.mode, state.ui.consoleSidebarOpen, state.ui.consoleSidebarWidth]);
}
