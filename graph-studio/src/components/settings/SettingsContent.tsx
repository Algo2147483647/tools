import { getGraphChartLabel } from "../../graph/types";
import Icon from "../ui/Icon";
import AiSettingsPanel,{ type AiConnectionStatus } from "./AiSettingsPanel";
import AppearancePreview from "./AppearancePreview";
import AppearanceSettings from "./AppearanceSettings";
import FilesSettings from "./FilesSettings";
import { type SettingsChapter,SETTINGS_CHAPTERS } from "./settingsConfig";


import type { SettingItem } from "./settingsCatalog";
import type { SettingsModalProps } from "./types";
type SettingsContentProps = Pick<SettingsModalProps, "chartType" | "sankeyUnavailableReason" | "onChartTypeChange" | "timelineControls" | "layoutMode" | "appearance" | "showNodeDetail" | "hideNodeBorders" | "alignNodeWidthsToMax" | "fileName" | "files" | "hasGraph" | "consoleSidebarOpen" | "aiSettings" | "aiBusy" | "onClose" | "onLayoutModeChange" | "onAppearanceCssChange" | "onAppearancePresetChange" | "onAppearanceSchemaChange" | "onAppearanceReset" | "onAppearanceExport" | "onAppearanceImportClick" | "onAppearanceImportChange" | "onConsoleSidebarToggle" | "onInitializeCanvas" | "onExport" | "onExportHtml" | "canExportCanvas" | "onAiSettingsChange"> & {
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
export function SettingsContent({chartType, sankeyUnavailableReason, onChartTypeChange, timelineControls, layoutMode, appearance, showNodeDetail, hideNodeBorders, alignNodeWidthsToMax, fileName, files, hasGraph, consoleSidebarOpen, aiSettings, aiBusy, onClose, onLayoutModeChange, onAppearanceCssChange, onAppearancePresetChange, onAppearanceSchemaChange, onAppearanceReset, onAppearanceExport, onAppearanceImportClick, onAppearanceImportChange, onConsoleSidebarToggle, onInitializeCanvas, onExport, onExportHtml, canExportCanvas, onAiSettingsChange, query, shownChapter, activeChapter, visualChapter, previewMode, setPreviewMode, appearanceCssDraft, setAppearanceCssDraft, providerMenuOpen, setProviderMenuOpen, aiConnectionStatus, handleAiConnectionTestClick, results, chapterCount}: SettingsContentProps) {
 return (<div className="settings-content">
            {(shownChapter === "appearance" ||
              shownChapter === "layout" ||
              (!shownChapter && (activeChapter === "appearance" || activeChapter === "layout"))) && (
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
              {shownChapter === "general" && (
                <section className="settings-section">
                  <h3>Interface</h3>
                  <label className="settings-toggle-row">
                    <span>
                      <strong>Graph console</strong>
                      <small>Show the sidebar to run commands and work with the AI assistant.</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={consoleSidebarOpen}
                      onChange={onConsoleSidebarToggle}
                    />
                  </label>
                </section>
              )}
              {shownChapter === "files" ? (
                <FilesSettings
                  onClose={onClose}
                  fileName={fileName}
                  files={files}
                  hasGraph={hasGraph}
                  onInitializeCanvas={onInitializeCanvas}
                  onExport={onExport}
                  onExportHtml={onExportHtml}
                  canExportCanvas={canExportCanvas}
                  showFiles={results.some((item) => item.id === "files")}
                  showSession={results.some((item) => item.id === "session")}
                />
              ) : null}

              {shownChapter === "chart" || shownChapter === "appearance" || shownChapter === "layout" ? (
                <AppearanceSettings
                  key={chartType}
                  view={shownChapter}
                  query={query}
                  chartType={chartType}
                  sankeyUnavailableReason={sankeyUnavailableReason}
                  onChartTypeChange={onChartTypeChange}
                  layoutMode={layoutMode}
                  appearance={appearance}
                  showNodeDetail={showNodeDetail}
                  hideNodeBorders={hideNodeBorders}
                  alignNodeWidthsToMax={alignNodeWidthsToMax}
                  appearanceCssDraft={appearanceCssDraft}

                  onAppearanceCssDraftChange={setAppearanceCssDraft}
                  timelineControls={timelineControls}
                  onLayoutModeChange={onLayoutModeChange}

                  onAppearanceCssChange={onAppearanceCssChange}

                  onAppearancePresetChange={onAppearancePresetChange}
                  onAppearanceSchemaChange={onAppearanceSchemaChange}
                  onAppearanceReset={onAppearanceReset}
                  onAppearanceExport={onAppearanceExport}
                  onAppearanceImportClick={onAppearanceImportClick}
                  onAppearanceImportChange={onAppearanceImportChange}

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
                  showAdvanced={results.some((item) => item.id === "ai-advanced")}
                  expandAdvanced={Boolean(query.trim())}
                />
              ) : null}
            </div>
          </div>);
}
