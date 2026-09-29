import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { GraphAppearance, GraphLayoutAppearance } from "../../graph/appearance";
import type { GraphAppearancePresetId } from "../../graph/appearanceCommands";
import type { GraphLayoutMode } from "../../graph/types";
import type { AiSettings } from "../../ai/types";
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
  files: WorkspaceControls;
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
  onInitializeCanvas: () => void;
  onExport: () => void;
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
  files,
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
  onInitializeCanvas,
  onExport,
  onAiSettingsChange,
  onAiConnectionTest,
}: SettingsModalProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeChapter, setActiveChapter] = useState<SettingsChapter>("general");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [aiConnectionStatus, setAiConnectionStatus] = useState<AiConnectionStatus>("idle");
  const [appearanceCssDraft, setAppearanceCssDraft] = useState(appearance.css);
  const [cssVarDrafts, setCssVarDrafts] = useState<Record<string, string>>(() => buildCssVarDrafts(appearance));
  const [titleSizeDraft, setTitleSizeDraft] = useState(() => String(parseCssPixelValue(appearance.cssVars["--dag-title-font-size"], 15)));
  const chapters = SETTINGS_CHAPTERS.filter(chapter => !query || query.toLowerCase().split(/\s+/).every(word => `${chapter.label} ${chapter.description} ${chapter.keywords}`.toLowerCase().includes(word)));
  const shownChapter = chapters.some(chapter => chapter.key === activeChapter) ? activeChapter : chapters[0]?.key;
  useEffect(() => { if (open) { setQuery(""); searchRef.current?.focus(); } }, [open]);
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
      <section id="settings-modal" className="settings-modal studio-settings" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key === "Tab") {
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="file"]), select, textarea, summary')].filter(el => el.offsetParent !== null);
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
          else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
        }
      }}>
        <div className="settings-modal-header">
          <div>
            <h2 id="settings-modal-title">Settings</h2><p>Make Graph Studio work for you.</p>
          </div>
          <button type="button" className="ghost-btn topbar-icon-btn" title="Close settings" aria-label="Close settings" onClick={onClose}>
            <span className="topbar-icon" aria-hidden="true"><CloseIcon /></span>
          </button>
        </div>

        <label className="settings-search"><WorkspaceIcon name="search" size={18}/><input ref={searchRef} aria-label="Search settings" placeholder="Search settings…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Clear settings search" onClick={() => setQuery("")}>×</button>}<kbd>Esc</kbd></label>
        <div className="settings-modal-body">
          <nav className="settings-tabs" aria-label="Settings sections">
            {chapters.map((chapter) => (
              <button
                key={chapter.key}
                type="button"
                className={`settings-tab${shownChapter === chapter.key ? " is-active" : ""}`}
                aria-pressed={shownChapter === chapter.key}
                onClick={() => setActiveChapter(chapter.key)}
              >
                <WorkspaceIcon name={chapter.icon}/><span><strong>{chapter.label}</strong><small>{chapter.description}</small></span>
              </button>
            ))}
          </nav>

          <div className="settings-page" key={shownChapter || "empty"}>
            {!shownChapter && <div className="settings-no-results"><WorkspaceIcon name="search" size={30}/><h3>No matching settings</h3><p>Try “colors”, “spacing”, “workspace” or “AI”.</p></div>}
            {shownChapter && <div className="settings-page-heading"><h2>{SETTINGS_CHAPTERS.find(chapter => chapter.key === shownChapter)?.label}</h2><p>{SETTINGS_CHAPTERS.find(chapter => chapter.key === shownChapter)?.description}</p></div>}
            {shownChapter === "general" ? (
              <GeneralSettings
                onClose={onClose}
                fileName={fileName}
                files={files}
                hasGraph={hasGraph}
                consoleSidebarOpen={consoleSidebarOpen}
                onConsoleSidebarToggle={onConsoleSidebarToggle}
                onInitializeCanvas={onInitializeCanvas}
                onExport={onExport}
              />
            ) : null}

            {(shownChapter === "appearance" || shownChapter === "layout") ? (
              <AppearanceSettings
                view={shownChapter as "appearance" | "layout"}
                query={query}
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

            {shownChapter === "ai" ? (
              <AiSettingsPanel
                aiSettings={aiSettings}
                aiBusy={aiBusy || aiConnectionStatus === "testing"}
                providerMenuOpen={providerMenuOpen}
                aiConnectionStatus={aiConnectionStatus}
                onProviderMenuOpenChange={setProviderMenuOpen}
                onAiConnectionTestClick={handleAiConnectionTestClick}
                onAiSettingsChange={onAiSettingsChange}
              />
            ) : null}
          </div>
        </div>
        <footer className="settings-footer"><span>Preferences are saved in this browser.</span><button className="studio-button primary" onClick={onClose}>Done</button></footer>
      </section>
    </div>,
    document.body,
  );
}

function buildCssVarDrafts(appearance: GraphAppearance): Record<string, string> {
  return Object.fromEntries(APPEARANCE_TOKEN_CONTROLS.map((token) => [token.key, appearance.cssVars[token.key] || ""]));
}
