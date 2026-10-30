import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon";
import { type AiConnectionStatus } from "./AiSettingsPanel";
import { getSettingsCatalog, matchesSetting } from "./settingsCatalog";
import { type SettingsChapter } from "./settingsConfig";
import { SettingsContent } from "./SettingsContent";
import { SettingsNavigation, SettingsSearch } from "./SettingsNavigation";

import type { SettingsModalProps } from "./types";

export default function SettingsModal(props: SettingsModalProps) {
  const {
    open,
    chartType,
    appearance,
    aiSettings,
    onClose,
    onAppearanceUndo,
    onAppearanceRedo,
    canUndoAppearance,
    canRedoAppearance,
    preferencesSaved,
    onAiConnectionTest,
  } = props;
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
        onKeyDown={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
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
          <div className="settings-header-actions">
            {props.documentActions}
            <button
              type="button"
              className="ghost-btn icon-button--toolbar"
              title="Close settings"
              aria-label="Close settings"
              onClick={onClose}
            >
              <span className="icon-button-content" aria-hidden="true">
                <Icon name="close" className="icon-glyph" />
              </span>
            </button>
          </div>
        </div>

        <SettingsSearch query={query} setQuery={setQuery} searchRef={searchRef} />
        <div className="settings-modal-body">
          <SettingsNavigation
            query={query}
            setQuery={setQuery}
            shownChapter={shownChapter}
            setActiveChapter={setActiveChapter}
            chapterCount={chapterCount}
          />

          <SettingsContent
            settings={props}

            query={query}
            shownChapter={shownChapter}
            activeChapter={activeChapter}
            visualChapter={visualChapter}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
            appearanceCssDraft={appearanceCssDraft}
            setAppearanceCssDraft={setAppearanceCssDraft}
            providerMenuOpen={providerMenuOpen}
            setProviderMenuOpen={setProviderMenuOpen}
            aiConnectionStatus={aiConnectionStatus}
            handleAiConnectionTestClick={handleAiConnectionTestClick}
            results={results}
            chapterCount={chapterCount}
          />
        </div>
        <footer className="settings-footer">
          <div className="settings-status-stack" role="status">
            {cssPending && (
              <span className="settings-pending-status">
                CSS draft not applied · Use Apply CSS in Appearance → Advanced
              </span>
            )}
            {!preferencesSaved ? (
              <span className="setting-error">Interface and AI preferences could not be saved in this browser.</span>
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
