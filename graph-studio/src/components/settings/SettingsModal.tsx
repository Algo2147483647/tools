import { useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { GraphAppearance, GraphLayoutAppearance } from "../../graph/appearance";
import type { GraphAppearancePresetId } from "../../graph/appearanceCommands";
import type { GraphLayoutMode } from "../../graph/types";
import type { AiSettings } from "../../ai/types";
import type { ImportFileButtonState } from "../../hooks/useGraphImport";
import { CloseIcon } from "../topbar/TopbarIcons";
import AiSettingsPanel, { type AiConnectionStatus } from "./AiSettingsPanel";
import AppearanceSettings from "./AppearanceSettings";
import GeneralSettings from "./GeneralSettings";
import { APPEARANCE_TOKEN_CONTROLS, SETTINGS_CHAPTERS, type SettingsChapter } from "./settingsConfig";
import { parseCssPixelValue } from "./settingsUtils";

interface SettingsModalProps {
  open: boolean;
  layoutMode: GraphLayoutMode;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  status: string;
  fileName: string;
  importFileButtonState: ImportFileButtonState;
  relativeLinkRootName: string;
  hasGraph: boolean;
  consoleSidebarOpen: boolean;
  aiSettings: AiSettings;
  aiBusy: boolean;
  onClose: () => void;
  onLayoutModeChange: (mode: GraphLayoutMode) => void;
  onLayoutAppearanceChange: <K extends keyof GraphLayoutAppearance>(key: K, value: GraphLayoutAppearance[K]) => void;
  onAppearanceCssVarChange: (key: string, value: string) => void;
  onAppearanceCssChange: (css: string) => void;
  onAppearanceDisplayChange: <K extends keyof GraphAppearance["display"]>(key: K, value: GraphAppearance["display"][K]) => void;
  onAppearancePresetChange: (presetId: GraphAppearancePresetId) => void;
  onAppearanceReset: () => void;
  onAppearanceExport: () => void;
  onAppearanceImportClick: (event: MouseEvent<HTMLInputElement>) => void;
  onAppearanceImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onNodeDetailToggle: () => void;
  onNodeBordersToggle: () => void;
  onNodeWidthAlignToggle: () => void;
  onConsoleSidebarToggle: () => void;
  onFileInputClick: (event: MouseEvent<HTMLInputElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFolderInputClick: (event: MouseEvent<HTMLInputElement>) => void;
  onFolderInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRelativeLinkRootSelect: () => void;
  onInitializeCanvas: () => void;
  onExport: () => void;
  onFieldMappingOpen: () => void;
  onAiSettingsChange: (settings: AiSettings) => void;
  onAiConnectionTest: () => Promise<boolean>;
}

export default function SettingsModal({
  open,
  layoutMode,
  appearance,
  showNodeDetail,
  hideNodeBorders,
  alignNodeWidthsToMax,
  status,
  fileName,
  importFileButtonState,
  relativeLinkRootName,
  hasGraph,
  consoleSidebarOpen,
  aiSettings,
  aiBusy,
  onClose,
  onLayoutModeChange,
  onLayoutAppearanceChange,
  onAppearanceCssVarChange,
  onAppearanceCssChange,
  onAppearanceDisplayChange,
  onAppearancePresetChange,
  onAppearanceReset,
  onAppearanceExport,
  onAppearanceImportClick,
  onAppearanceImportChange,
  onNodeDetailToggle,
  onNodeBordersToggle,
  onNodeWidthAlignToggle,
  onConsoleSidebarToggle,
  onFileInputClick,
  onFileInputChange,
  onFolderInputClick,
  onFolderInputChange,
  onRelativeLinkRootSelect,
  onInitializeCanvas,
  onExport,
  onFieldMappingOpen,
  onAiSettingsChange,
  onAiConnectionTest,
}: SettingsModalProps) {
  const [activeChapter, setActiveChapter] = useState<SettingsChapter>("general");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [aiConnectionStatus, setAiConnectionStatus] = useState<AiConnectionStatus>("idle");
  const [appearanceCssDraft, setAppearanceCssDraft] = useState(appearance.css);
  const [cssVarDrafts, setCssVarDrafts] = useState<Record<string, string>>(() => buildCssVarDrafts(appearance));
  const [titleSizeDraft, setTitleSizeDraft] = useState(() => String(parseCssPixelValue(appearance.cssVars["--dag-title-font-size"], 15)));
  const titleFontSize = parseCssPixelValue(appearance.cssVars["--dag-title-font-size"], 15);

  useEffect(() => {
    setAiConnectionStatus("idle");
  }, [aiSettings.provider, aiSettings.baseUrl, aiSettings.model, aiSettings.apiKey]);

  useEffect(() => {
    setAppearanceCssDraft(appearance.css);
    setCssVarDrafts(buildCssVarDrafts(appearance));
    setTitleSizeDraft(String(titleFontSize));
  }, [appearance, titleFontSize]);

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
      <section id="settings-modal" className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
        <div className="settings-modal-header">
          <div>
            <p id="settings-modal-title" className="control-label">Settings</p>
          </div>
          <button type="button" className="ghost-btn topbar-icon-btn" title="Close settings" aria-label="Close settings" onClick={onClose}>
            <span className="topbar-icon" aria-hidden="true"><CloseIcon /></span>
          </button>
        </div>

        <div className="settings-modal-body">
          <nav className="settings-tabs" aria-label="Settings sections">
            {SETTINGS_CHAPTERS.map((chapter) => (
              <button
                key={chapter.key}
                type="button"
                className={`settings-tab${activeChapter === chapter.key ? " is-active" : ""}`}
                aria-pressed={activeChapter === chapter.key}
                onClick={() => setActiveChapter(chapter.key)}
              >
                {chapter.label}
              </button>
            ))}
          </nav>

          <div className="settings-page">
            {activeChapter === "general" ? (
              <GeneralSettings
                status={status}
                fileName={fileName}
                importFileButtonState={importFileButtonState}
                relativeLinkRootName={relativeLinkRootName}
                hasGraph={hasGraph}
                consoleSidebarOpen={consoleSidebarOpen}
                onClose={onClose}
                onConsoleSidebarToggle={onConsoleSidebarToggle}
                onFileInputClick={onFileInputClick}
                onFileInputChange={onFileInputChange}
                onFolderInputClick={onFolderInputClick}
                onFolderInputChange={onFolderInputChange}
                onRelativeLinkRootSelect={onRelativeLinkRootSelect}
                onInitializeCanvas={onInitializeCanvas}
                onExport={onExport}
                onFieldMappingOpen={onFieldMappingOpen}
              />
            ) : null}

            {activeChapter === "appearance" ? (
              <AppearanceSettings
                layoutMode={layoutMode}
                appearance={appearance}
                showNodeDetail={showNodeDetail}
                hideNodeBorders={hideNodeBorders}
                alignNodeWidthsToMax={alignNodeWidthsToMax}
                appearanceCssDraft={appearanceCssDraft}
                cssVarDrafts={cssVarDrafts}
                titleSizeDraft={titleSizeDraft}
                titleFontSize={titleFontSize}
                onAppearanceCssDraftChange={setAppearanceCssDraft}
                onCssVarDraftsChange={setCssVarDrafts}
                onTitleSizeDraftChange={setTitleSizeDraft}
                onLayoutModeChange={onLayoutModeChange}
                onLayoutAppearanceChange={onLayoutAppearanceChange}
                onAppearanceCssVarChange={onAppearanceCssVarChange}
                onAppearanceCssChange={onAppearanceCssChange}
                onAppearanceDisplayChange={onAppearanceDisplayChange}
                onAppearancePresetChange={onAppearancePresetChange}
                onAppearanceReset={onAppearanceReset}
                onAppearanceExport={onAppearanceExport}
                onAppearanceImportClick={onAppearanceImportClick}
                onAppearanceImportChange={onAppearanceImportChange}
                onNodeDetailToggle={onNodeDetailToggle}
                onNodeBordersToggle={onNodeBordersToggle}
                onNodeWidthAlignToggle={onNodeWidthAlignToggle}
              />
            ) : null}

            {activeChapter === "ai" ? (
              <AiSettingsPanel
                aiSettings={aiSettings}
                aiBusy={aiBusy}
                providerMenuOpen={providerMenuOpen}
                aiConnectionStatus={aiConnectionStatus}
                onProviderMenuOpenChange={setProviderMenuOpen}
                onAiConnectionTestClick={handleAiConnectionTestClick}
                onAiSettingsChange={onAiSettingsChange}
              />
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function buildCssVarDrafts(appearance: GraphAppearance): Record<string, string> {
  return Object.fromEntries(APPEARANCE_TOKEN_CONTROLS.map((token) => [token.key, appearance.cssVars[token.key] || ""]));
}
