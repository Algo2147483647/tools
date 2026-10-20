import type { TimelineClock } from "../graph/timelineClock";
import Icon from "./ui/Icon";
import type { RefObject } from "react";
import type { WorkspaceControls } from "../controllers/workspaceControls";
import type { TimelineTimeRange } from "../graph/timelineRange";
import TimelineRangeFilter from "./TimelineRangeFilter";
import IconButton from "./ui/IconButton";
import ZoomInput from "./ui/ZoomInput";

interface TopbarProps {
  topbarRef: RefObject<HTMLElement>;
  files: WorkspaceControls;
  hasGraph: boolean;
  typeOptions: string[];
  selectedType: string;
  onTypeChange: (type: string) => void;
  timeline?: {
    clock?: TimelineClock;
    tracks: string[];
    selectedTrack: string;
    onTrackChange: (track: string) => void;
    range: TimelineTimeRange | null;
    onRangeChange: (range: TimelineTimeRange | null) => void;
    canLocate: boolean;
    onLocate: () => void;
  };
  canBack: boolean;
  canUp: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoomPercent: number;
  canZoomOut: boolean;
  canZoomIn: boolean;
  settingsOpen: boolean;
  onBack: () => void;
  onUp: () => void;
  onAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomFit: () => void;
  onZoomPercentCommit: (percent: number) => void;
  onSettingsToggle: () => void;
  onSaveJson: () => void;
}

export default function Topbar({
  topbarRef,
  files,
  hasGraph,
  typeOptions,
  selectedType,
  onTypeChange,
  timeline,
  canBack,
  canUp,
  canUndo,
  canRedo,
  zoomPercent,
  canZoomOut,
  canZoomIn,
  settingsOpen,
  onBack,
  onUp,
  onAll,
  onUndo,
  onRedo,
  onZoomOut,
  onZoomIn,
  onZoomFit,
  onZoomPercentCommit,
  onSettingsToggle,
  onSaveJson,
}: TopbarProps) {
  return (
    <header ref={topbarRef} className={`topbar${files.homeVisible ? " topbar--home" : ""}`}>
      <div className="topbar-brand">
        <button className="brand-home" aria-label="Go to home" onClick={() => files.setHomeVisible(true)}>
          <strong>Graph Studio</strong>
        </button>
      </div>
      <div className="topbar-actions">
        {!files.homeVisible && (
          <>
            <label className="topbar-group type-filter-control">
              <span>Type</span>
              <select
                aria-label="Filter graph by type"
                value={selectedType}
                disabled={!hasGraph || typeOptions.length === 0}
                onChange={(event) => onTypeChange(event.currentTarget.value)}
              >
                <option value="">All types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            {timeline && (
              <>
                <label className="topbar-group type-filter-control">
                  <span>Track</span>
                  <select
                    aria-label="Filter timeline by track"
                    value={timeline.selectedTrack}
                    onChange={(event) => timeline.onTrackChange(event.currentTarget.value)}
                  >
                    <option value="">All tracks</option>
                    {timeline.tracks.map((track) => (
                      <option key={track} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
                </label>
                <TimelineRangeFilter clock={timeline.clock} range={timeline.range} onChange={timeline.onRangeChange} />
                <IconButton
                  id="timeline-locate-btn"
                  label="Locate selected event"
                  disabled={!timeline.canLocate}
                  onClick={timeline.onLocate}
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      className="topbar-icon-svg"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                    </svg>
                  }
                />
              </>
            )}
            <div className="topbar-group nav-controls" aria-label="Graph navigation controls">
              <IconButton
                id="back-btn"
                label="Back"
                disabled={!canBack}
                onClick={onBack}
                icon={<Icon name="arrow-left" className="topbar-icon-svg" />}
              />
              <IconButton
                id="up-btn"
                label="Up"
                disabled={!canUp}
                onClick={onUp}
                icon={<Icon name="arrow-up" className="topbar-icon-svg" />}
              />
              <IconButton
                id="all-btn"
                label={timeline ? "Show all events" : "Show all roots"}
                disabled={!hasGraph}
                onClick={onAll}
                icon={<Icon name="roots" className="topbar-icon-svg" />}
              />
            </div>
            <div className="topbar-group zoom-controls" aria-label="Graph zoom controls">
              <IconButton
                id="zoom-out-btn"
                label="Zoom out"
                disabled={!canZoomOut}
                onClick={onZoomOut}
                icon={<Icon name="minus" className="topbar-icon-svg" />}
              />
              <IconButton
                id="zoom-in-btn"
                label="Zoom in"
                disabled={!canZoomIn}
                onClick={onZoomIn}
                icon={<Icon name="plus" className="topbar-icon-svg" />}
              />
              <ZoomInput value={zoomPercent} disabled={!hasGraph} onCommit={onZoomPercentCommit} />
              <IconButton
                id="zoom-fit-btn"
                label="Fit graph to viewport"
                disabled={!hasGraph}
                onClick={onZoomFit}
                icon={<Icon name="fit" className="topbar-icon-svg" />}
              />
            </div>
          </>
        )}
        <div className="topbar-group file-controls" aria-label="Graph file controls">
          {files.workspace && !files.homeVisible && (
            <button
              className="studio-icon-button"
              aria-label="Toggle workspace explorer"
              title="Explorer"
              aria-pressed={files.explorerOpen}
              onClick={() => files.setExplorerOpen((value) => !value)}
            >
              <Icon name="panel" />
            </button>
          )}
          {!files.homeVisible && (
            <>
              <IconButton
                id="undo-btn"
                label="Undo"
                disabled={!canUndo}
                onClick={onUndo}
                icon={<Icon name="undo" className="topbar-icon-svg" />}
              />
              <IconButton
                id="redo-btn"
                label="Redo"
                disabled={!canRedo}
                onClick={onRedo}
                icon={<Icon name="redo" className="topbar-icon-svg" />}
              />
              <IconButton
                id="save-json-btn"
                label="Save JSON"
                disabled={!hasGraph}
                onClick={onSaveJson}
                icon={<Icon name="save" className="topbar-icon-svg" />}
                className="ghost-btn topbar-icon-btn topbar-save-btn"
              />
            </>
          )}
          <div id="floating-controls" className="control-dock">
            <IconButton
              id="settings-btn"
              label="Settings"
              icon={<Icon name="sliders" className="topbar-icon-svg" />}
              ariaExpanded={settingsOpen}
              ariaControls="settings-modal"
              onClick={onSettingsToggle}
              className="settings-toggle-btn topbar-icon-btn"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
