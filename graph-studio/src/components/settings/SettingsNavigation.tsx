
import type { RefObject } from "react";
import Icon from "../ui/Icon";
import { SETTINGS_CHAPTERS,type SettingsChapter } from "./settingsConfig";
export function SettingsSearch({query, setQuery, searchRef}: {query: string; setQuery: (query: string) => void; searchRef: RefObject<HTMLInputElement>}) { return (<label className="settings-search">
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
        </label>); }
export function SettingsNavigation({query, setQuery, shownChapter, setActiveChapter, chapterCount}: {
 query: string; setQuery: (query: string) => void; shownChapter: SettingsChapter | undefined;
 setActiveChapter: (chapter: SettingsChapter) => void; chapterCount: (chapter: SettingsChapter) => number;
}) { return (<nav className="settings-tabs" aria-label="Settings sections">
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
          </nav>); }
