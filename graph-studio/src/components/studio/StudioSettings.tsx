import { useMemo } from "react";
import { getSankeyError } from "../../graph/sankey";
import { getTimelineClock } from "../../graph/timeline/clock";
import ChartLayoutControls from "./ChartLayoutControls";
import SettingsModal from "../settings/SettingsModal";

import { useGraphExport } from "../../app/document/useGraphExport";
import type { StudioViewProps } from "./types";
export function StudioSettings({
  session,
  preferences,
  ui,
  files,
  ai,
  viewport,
  compoundLayoutPlan,
  timelineLayoutPlan,
}: Pick<
  StudioViewProps,
  "session" | "preferences" | "ui" | "files" | "ai" | "viewport" | "compoundLayoutPlan" | "timelineLayoutPlan"
>) {
  const { state, dispatch } = session;
  const { charts: appearanceHistory } = preferences;
  const { appearance } = appearanceHistory;
  const consoleSidebarVisible = state.ui.consoleSidebarOpen;
  const sankeyUnavailableReason = useMemo(
    () => (state.dag ? getSankeyError(state.dag.nodes, state.dag.edges) : null),
    [state.dag],
  );
  const { exportSvg, exportHtml } = useGraphExport(state, dispatch, viewport);
  return (
    <SettingsModal
      layoutControls={
        <ChartLayoutControls
          key={state.chartType + state.document.generation}
          session={session}
          preferences={preferences}
          ui={ui}
          viewport={viewport}
          ai={ai}
          compoundLayoutPlan={compoundLayoutPlan}
          timelineLayoutPlan={timelineLayoutPlan}
        />
      }
      open={state.ui.settingsOpen}
      chartType={state.chartType}
      sankeyUnavailableReason={sankeyUnavailableReason}
      onChartTypeChange={ui.changeChartType}
      timelineControls={{
        clock: getTimelineClock(state.dag?.metadata),
        settings: viewport.timelineSettings,
        onChange: viewport.changeTimelineSettings,
        onReadapt: viewport.readaptTimeline,
      }}
      layoutMode={state.layout.mode}
      appearance={appearance}
      showNodeDetail={appearanceHistory.showNodeDetail}
      hideNodeBorders={appearanceHistory.hideNodeBorders}
      alignNodeWidthsToMax={appearanceHistory.alignNodeWidthsToMax}
      fileName={state.source.fileName}
      files={files}
      hasGraph={Boolean(state.dag)}
      consoleSidebarOpen={consoleSidebarVisible}
      aiSettings={preferences.aiSettings}
      aiBusy={ai.busy}
      onClose={ui.toggleSettings}

      onAppearanceCssChange={appearanceHistory.handleAppearanceCssChange}

      onAppearanceAdjustmentStart={appearanceHistory.beginAdjustment}
      onAppearanceAdjustmentEnd={appearanceHistory.endAdjustment}

      onAppearanceUndo={appearanceHistory.undo}
      onAppearanceRedo={appearanceHistory.redo}
      canUndoAppearance={appearanceHistory.canUndo}
      canRedoAppearance={appearanceHistory.canRedo}
      preferencesSaved={preferences.saved}
      onAppearancePresetChange={appearanceHistory.handleAppearancePresetChange}
      onAppearanceSchemaChange={appearanceHistory.handleAppearanceSchemaChange}
      onAppearanceReset={appearanceHistory.handleAppearanceReset}
      onAppearanceExport={appearanceHistory.handleAppearanceExport}
      onAppearanceImportClick={appearanceHistory.handleAppearanceImportClick}
      onAppearanceImportChange={appearanceHistory.handleAppearanceImportChange}

      onConsoleSidebarToggle={ui.toggleConsole}
      onExport={exportSvg}
      onExportHtml={exportHtml}
      canExportCanvas={Boolean(viewport.stage && !files.homeVisible)}
      onAiSettingsChange={preferences.setAiSettings}
      onAiConnectionTest={ai.testConnection}
    />
  );
}
