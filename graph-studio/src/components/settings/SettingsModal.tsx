import { type ChangeEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AiSettings } from "../../ai/types";
import type { WorkspaceControls } from "../../controllers/workspaceControls";
import type { GraphAppearance } from "../../graph/appearance";
import type { GraphChartType, GraphLayoutMode } from "../../graph/types";
import { getGraphChartLabel } from "../../graph/types";
import type { GraphAppearancePresetId } from "../../schema/appearanceCommands";
import type { ChartStyle } from "../../schema/chartStyles";
import type { TimelineControlsProps } from "../TimelineControls";
import Icon from "../ui/Icon";
import AiSettingsPanel, { type AiConnectionStatus } from "./AiSettingsPanel";
import AppearancePreview from "./AppearancePreview";
import AppearanceSettings from "./AppearanceSettings";
import FilesSettings from "./FilesSettings";
import { getSettingsCatalog, matchesSetting } from "./settingsCatalog";
import { type SettingsChapter, SETTINGS_CHAPTERS } from "./settingsConfig";

interface SettingsModalProps {
  open: boolean;
  chartType: GraphChartType;
  sankeyUnavailableReason: string | null;
  onChartTypeChange: (type: GraphChartType) => void;
  timelineControls?: TimelineControlsProps;
  layoutMode: GraphLayoutMode;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  fileName: string;
  files: WorkspaceControls;
  hasGraph: boolean;
  consoleSidebarOpen: boolean;
  aiSettings: AiSettings;
  aiBusy: boolean;
  onClose: () => void;
  onLayoutModeChange: (mode: GraphLayoutMode) => void;
  onAppearanceCssChange: (css: string) => void;
  onAppearanceAdjustmentStart: () => void;
  onAppearanceAdjustmentEnd: () => void;
  onAppearanceUndo: () => void;
  onAppearanceRedo: () => void;
  canUndoAppearance: boolean;
  canRedoAppearance: boolean;
  preferencesSaved: boolean;
  onAppearancePresetChange: (presetId: GraphAppearancePresetId) => void;
  onAppearanceSchemaChange: (style: ChartStyle) => void;
  onAppearanceReset: () => void;
  onAppearanceExport: () => void;
  onAppearanceImportClick: (event: MouseEvent<HTMLInputElement>) => void;
  onAppearanceImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onConsoleSidebarToggle: () => void;
  onInitializeCanvas: () => void;
  onExport: () => void;
  onExportHtml: () => void;
  canExportCanvas: boolean;
  onAiSettingsChange: (settings: AiSettings) => void;
  onAiConnectionTest: () => Promise<boolean>;
}

export default function SettingsModal({
  open,
  chartType,
  sankeyUnavailableReason,
  onChartTypeChange,
  layoutMode,
  timelineControls,
  appearance,
  showNodeDetail,
  hideNodeBorders,
  alignNodeWidthsToMax,
  fileName,
  files,
  hasGraph,
  consoleSidebarOpen,
  aiSettings,
  aiBusy,
  onClose,
  onLayoutModeChange,
  onAppearanceCssChange,
  onAppearanceAdjustmentStart,
  onAppearanceAdjustmentEnd,
  onAppearanceUndo,
  onAppearanceRedo,
  canUndoAppearance,
  canRedoAppearance,
  preferencesSaved,
  onAppearancePresetChange,
  onAppearanceSchemaChange,
  onAppearanceReset,
  onAppearanceExport,
  onAppearanceImportClick,
  onAppearanceImportChange,
  onConsoleSidebarToggle,
  onInitializeCanvas,
  onExport,
  onExportHtml,
  canExportCanvas,
  onAiSettingsChange,
  onAiConnectionTest,
}: SettingsModalProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeChapter, setActiveChapter] = useState<SettingsChapter>("appearance");
  const [previewMode, setPreviewMode] = useState<"overview" | "detail">("detail");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [aiConnectionStatus, setAiConnectionStatus] = useState<AiConnectionStatus>("idle");
  const [appearanceCssDraft, setAppearanceCssDraft] = useState(appearance.css);
  const results = getSettingsCatalog(chartType).filter((item) => matchesSetting(item, query));
  const chapterCount = (key: SettingsChapter) => results.filter((item) => item.chapter === key).length;
  const shownChapter = !query.trim() || chapterCount(activeChapter) ? activeChapter : results[0]?.chapter;
  const visualChapter = shownChapter === "appearance" || shownChapter === "layout";
  const cssPending = appearanceCssDraft !== appearance.css;
  useEffect(() => setPreviewMode(shownChapter === "layout" ? "overview" : "detail"), [shownChapter]);
  useEffect(() => {
    if (open) {
      setQuery("");
      searchRef.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const finish = () => onAppearanceAdjustmentEnd();
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      finish();
    };
  }, [open, onAppearanceAdjustmentEnd]);

  useEffect(() => {
    setAiConnectionStatus("idle");
  }, [aiSettings.provider, aiSettings.baseUrl, aiSettings.model, aiSettings.apiKey]);

  useEffect(() => {
    setAppearanceCssDraft(appearance.css);
  }, [appearance.css]);

  const handleAiConnectionTestClick = async () => {
    setAiConnectionStatus("testing");
    const ok = await onAiConnectionTest();
    setAiConnectionStatus(ok ? "success" : "error");
  };

  if (!open) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section
        id="settings-modal"
        className="settings-modal studio-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onPointerDownCapture={(event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === "range") onAppearanceAdjustmentStart();
        }}
        onBlurCapture={(event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === "range") onAppearanceAdjustmentEnd();
        }}
        onKeyUpCapture={(event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === "range") onAppearanceAdjustmentEnd();
        }}
        onKeyDownCapture={(event) => {
          if (
            event.target instanceof HTMLInputElement &&
            event.target.type === "range" &&
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)
          )
            onAppearanceAdjustmentStart();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            if (query.trim()) {
              setQuery("");
              searchRef.current?.focus();
            } else onClose();
          }
          if (event.key === "Tab") {
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not([type="file"]), select, textarea, summary, iframe',
              ),
            ].filter((el) => el.offsetParent !== null);
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="settings-modal-header">
          <h2 id="settings-modal-title">Settings</h2>
          <button
            type="button"
            className="ghost-btn topbar-icon-btn"
            title="Close settings"
            aria-label="Close settings"
            onClick={onClose}
          >
            <span className="topbar-icon" aria-hidden="true">
              <Icon name="close" className="topbar-icon-svg" />
            </span>
          </button>
        </div>

        <label className="settings-search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            aria-label="Search settings"
            placeholder="Search settings…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="Clear settings search" onClick={() => setQuery("")}>
              ×
            </button>
          )}
          <kbd>Esc</kbd>
        </label>
        <div className="settings-modal-body">
          <nav className="settings-tabs" aria-label="Settings sections">
            {SETTINGS_CHAPTERS.map((chapter) => (
              <button
                key={chapter.key}
                type="button"
                className={`settings-tab${shownChapter === chapter.key ? " is-active" : ""}`}
                aria-pressed={shownChapter === chapter.key}
                onClick={() => {
                  setActiveChapter(chapter.key);
                  if (query && !chapterCount(chapter.key)) setQuery("");
                }}
              >
                <Icon name={chapter.icon} />
                <span>
                  <strong>{chapter.label}</strong>
                </span>
                {query.trim() && <span className="settings-result-count">{chapterCount(chapter.key)}</span>}
              </button>
            ))}
          </nav>

          <div className="settings-content">
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
          </div>
        </div>
        <footer className="settings-footer">
          <div className="settings-status-stack" role="status">
            {cssPending && (
              <span className="settings-pending-status">
                CSS draft not applied · Use Apply CSS in Appearance → Advanced
              </span>
            )}
            {!preferencesSaved ? (
              <span className="setting-error">Applied settings could not be saved in this browser.</span>
            ) : !cssPending ? (
              <span className="settings-save-status">Saved automatically in this browser</span>
            ) : null}
          </div>
          <div className="settings-footer-actions">
            {visualChapter && (
              <>
                <button
                  type="button"
                  className="studio-button"
                  disabled={!canUndoAppearance}
                  onClick={onAppearanceUndo}
                >
                  Undo style
                </button>
                <button
                  type="button"
                  className="studio-button"
                  disabled={!canRedoAppearance}
                  onClick={onAppearanceRedo}
                >
                  Redo
                </button>
              </>
            )}
            <button className="studio-button primary" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
