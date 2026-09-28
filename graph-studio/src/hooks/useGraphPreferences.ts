import { useEffect } from "react";
import type { AiSettings } from "../ai/types";
import type { GraphAppearance } from "../graph/appearance";
import type { FieldMapping } from "../graph/fieldMapping";
import type { GraphAppState } from "../state/initialState";
import { saveGraphPagePreferences } from "../state/preferences";

export function useGraphPreferences({
  state,
  appearance,
  showNodeDetail,
  hideNodeBorders,
  alignNodeWidthsToMax,
  fieldMapping,
  aiSettings,
}: {
  state: GraphAppState;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  fieldMapping: FieldMapping;
  aiSettings: AiSettings;
}) {
  useEffect(() => {
    saveGraphPagePreferences({
      mode: state.mode,
      layoutMode: state.layout.mode,
      appearance,
      showNodeDetail,
      hideNodeBorders,
      alignNodeWidthsToMax,
      consoleSidebarOpen: state.ui.consoleSidebarOpen,
      consoleSidebarWidth: state.ui.consoleSidebarWidth,
      fieldMapping,
      aiSettings,
    });
  }, [aiSettings, alignNodeWidthsToMax, appearance, fieldMapping, hideNodeBorders, showNodeDetail, state.layout.mode, state.mode, state.ui.consoleSidebarOpen, state.ui.consoleSidebarWidth]);
}
