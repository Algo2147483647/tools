import { getGraphChartLabel } from "../../graph/types";
import Icon from "../ui/Icon";
import AiSettingsPanel, { type AiConnectionStatus } from "./AiSettingsPanel";
import AppearancePreview from "./AppearancePreview";
import AppearanceSettings from "./AppearanceSettings";
import GeneralSessionSettings from "./GeneralSessionSettings";
import { type SettingsChapter, SETTINGS_CHAPTERS } from "./settingsConfig";

import type { SettingItem } from "./settingsCatalog";
import type { SettingsModalProps } from "./types";
type SettingsContentProps = {
  settings: SettingsModalProps;
  query: string;
  shownChapter: SettingsChapter | undefined;
  activeChapter: SettingsChapter;
  visualChapter: boolean;
  previewMode: "overview" | "detail";
  setPreviewMode: (mode: "overview" | "detail") => void;
  appearanceCssDraft: string;
  setAppearanceCssDraft: (css: string) => void;
  providerMenuOpen: boolean;
  setProviderMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  aiConnectionStatus: AiConnectionStatus;
  handleAiConnectionTestClick: () => Promise<void>;
  results: SettingItem[];
  chapterCount: (chapter: SettingsChapter) => number;
};
export function SettingsContent({
  settings,
  query,
  shownChapter,
  activeChapter,
  visualChapter,
  previewMode,
  setPreviewMode,
  appearanceCssDraft,
  setAppearanceCssDraft,
  providerMenuOpen,
  setProviderMenuOpen,
  aiConnectionStatus,
  handleAiConnectionTestClick,
  results,
  chapterCount,
}: SettingsContentProps) {
  const {
    chartType,
    sankeyUnavailableReason,
    onChartTypeChange,
    timelineControls,
    layoutMode,
    appearance,
    showNodeDetail,
    hideNodeBorders,
    alignNodeWidthsToMax,
    fileName,
    files,
    hasGraph,
    aiSettings,
    aiBusy,
    onClose,
    onAppearanceCssChange,
    onAppearanceSchemaChange,
    onAppearanceReset,
    onExport,
    onExportHtml,
    canExportCanvas,
    onAiSettingsChange,
  } = settings;
  return (
    <div className="settings-content">
      {(shownChapter === "appearance" || (!shownChapter && activeChapter === "appearance")) && (
        <AppearancePreview
          appearance={appearance}
          chartType={chartType}
          layoutMode={layoutMode}
          showNodeDetail={showNodeDetail}
          hideNodeBorders={hideNodeBorders}
          alignNodeWidthsToMax={alignNodeWidthsToMax}
          timelineSettings={timelineControls?.settings}
          timelineClock={timelineControls?.clock}
          mode={previewMode}
          onModeChange={setPreviewMode}
        />
      )}
      <div className="settings-page" key={shownChapter || "empty"}>
        {!shownChapter && (
          <div className="settings-no-results">
            <Icon name="search" size={30} />
            <h3>No matching settings</h3>
            <p>Try “colors”, “spacing”, “workspace” or “AI”.</p>
          </div>
        )}
        {shownChapter && (
          <div className="settings-page-heading">
            <div className="settings-title-line">
              <h2>{SETTINGS_CHAPTERS.find((chapter) => chapter.key === shownChapter)?.label}</h2>
              {shownChapter === "layout" && settings.layoutAction}
              {shownChapter === "appearance" && (
                <button
                  type="button"
                  className="studio-button"
                  disabled={!settings.canBindAppearance || settings.bindingAppearance}
                  onClick={settings.onAppearanceBind}
                >
                  {settings.bindingAppearance ? "Updating…" : "Update current appearance"}
                </button>
              )}
              {(visualChapter || shownChapter === "chart") && (
                <span className="settings-chart-badge">{getGraphChartLabel(chartType)}</span>
              )}
            </div>
            {query.trim() && (
              <p role="status">
                {chapterCount(shownChapter)} matching settings · {results.length} across all sections
              </p>
            )}
          </div>
        )}
        {shownChapter === "general" ? (
          <GeneralSessionSettings
            onClose={onClose}
            fileName={fileName}
            files={files}
            hasGraph={hasGraph}
            onExport={onExport}
            onExportHtml={onExportHtml}
            canExportCanvas={canExportCanvas}
            showExport={results.some((item) => item.id === "export")}
            showSession={results.some((item) => item.id === "session")}
          />
        ) : null}

        {shownChapter === "layout" && settings.layoutControls}

        {shownChapter === "chart" || shownChapter === "appearance" ? (
          <AppearanceSettings
            graphDocument={settings.graphDocument}
            key={chartType}
            view={shownChapter}
            query={query}
            chartType={chartType}
            sankeyUnavailableReason={sankeyUnavailableReason}
            onChartTypeChange={onChartTypeChange}
            appearance={appearance}
            showNodeDetail={showNodeDetail}
            hideNodeBorders={hideNodeBorders}
            alignNodeWidthsToMax={alignNodeWidthsToMax}
            appearanceCssDraft={appearanceCssDraft}

            onAppearanceCssDraftChange={setAppearanceCssDraft}
            timelineControls={timelineControls}

            onAppearanceCssChange={onAppearanceCssChange}

            onAppearanceSchemaChange={onAppearanceSchemaChange}
            onAppearanceReset={onAppearanceReset}

            onPreviewModeChange={setPreviewMode}
          />
        ) : null}

        {shownChapter === "ai" ? (
          <AiSettingsPanel
            aiSettings={aiSettings}
            aiBusy={aiBusy || aiConnectionStatus === "testing"}
            providerMenuOpen={providerMenuOpen}
            aiConnectionStatus={aiConnectionStatus}
            onProviderMenuOpenChange={setProviderMenuOpen}
            onAiConnectionTestClick={handleAiConnectionTestClick}
            onAiSettingsChange={onAiSettingsChange}
            showConnection={results.some((item) => item.id === "ai-connection")}
          />
        ) : null}
      </div>
    </div>
  );
}
