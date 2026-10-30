import { LayoutUpdateButton } from "./LayoutUpdateButton";
import { useMemo } from "react";
import { serializeDag } from "../../graph/serialize";
import { getSankeyError } from "../../graph/sankey";
import { getTimelineClock } from "../../graph/timeline/clock";
import ChartLayoutControls from "./ChartLayoutControls";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import SettingsModal from "../settings/SettingsModal";

import { useGraphExport } from "../../app/document/useGraphExport";
import type { StudioViewProps } from "./types";
export function StudioSettings({
  session,
  transactions,
  preferences,
  ui,
  files,
  ai,
  viewport,
  compoundLayoutPlan,
  timelineLayoutPlan,
}: Pick<
  StudioViewProps,
  | "transactions"
  | "session"
  | "preferences"
  | "ui"
  | "files"
  | "ai"
  | "viewport"
  | "compoundLayoutPlan"
  | "timelineLayoutPlan"
>) {
  const { state, dispatch } = session;
  const graphDocument = useMemo(
    () => (state.ui.settingsOpen && state.dag ? serializeDag(state.dag) : null),
    [state.dag, state.ui.settingsOpen],
  );
  const { charts: appearanceHistory } = preferences;
  const { appearance } = appearanceHistory;
  const sankeyUnavailableReason = useMemo(
    () => (state.dag ? getSankeyError(state.dag.nodes, state.dag.edges) : null),
    [state.dag],
  );
  const { exportSvg, exportHtml } = useGraphExport(state, dispatch, viewport);
  return (
    <SettingsModal
      documentActions={
        <div className="settings-document-actions" role="group" aria-label="Document actions">
          <IconButton
            label="Go to home"
            icon={<Icon name="home" />}
            onClick={() => {
              ui.toggleSettings();
              files.setHomeVisible(true);
            }}
          />
          <IconButton
            id="undo-btn"
            label="Undo"
            disabled={!transactions.canUndo}
            onClick={transactions.undo}
            icon={<Icon name="undo" />}
          />
          <IconButton
            id="redo-btn"
            label="Redo"
            disabled={!transactions.canRedo}
            onClick={transactions.redo}
            icon={<Icon name="redo" />}
          />
          <IconButton
            id="save-json-btn"
            label="Save JSON"
            disabled={!state.dag}
            onClick={() => {
              ui.toggleSettings();
              session.requestSave();
            }}
            icon={<Icon name="save" />}
          />
        </div>
      }
      graphDocument={graphDocument}
      layoutAction={
        <LayoutUpdateButton
          files={files}
          viewport={viewport}
          busy={compoundLayoutPlan.busy || timelineLayoutPlan.busy}
        />
      }
      layoutControls={
        <ChartLayoutControls
          key={state.chartType + state.document.generation}
          session={session}
          preferences={preferences}
          ui={ui}
          viewport={viewport}
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
      aiSettings={preferences.aiSettings}
      aiBusy={ai.busy}
      onClose={ui.toggleSettings}

      onAppearanceCssChange={appearanceHistory.handleAppearanceCssChange}

      onAppearanceUndo={appearanceHistory.undo}
      onAppearanceRedo={appearanceHistory.redo}
      canUndoAppearance={appearanceHistory.canUndo}
      canRedoAppearance={appearanceHistory.canRedo}
      preferencesSaved={preferences.saved}
      onAppearanceBind={() =>
        void files.saveAndBindStyle(state.chartType, {
          ...appearanceHistory.chartStyles[state.chartType].style,
          ...(state.chartType === "timeline" ? { timeline: state.timelineSettings } : {}),
        })
      }
      canBindAppearance={Boolean(state.dag)}
      bindingAppearance={files.busy}
      onAppearanceSchemaChange={appearanceHistory.handleAppearanceSchemaChange}
      onAppearanceReset={appearanceHistory.handleAppearanceReset}

      onExport={exportSvg}
      onExportHtml={exportHtml}
      canExportCanvas={Boolean(viewport.stage && !files.homeVisible)}
      onAiSettingsChange={preferences.setAiSettings}
      onAiConnectionTest={ai.testConnection}
    />
  );
}
