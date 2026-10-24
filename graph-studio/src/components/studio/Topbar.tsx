import type { RefObject } from "react";
import type { WorkspaceControls } from "../../controllers/workspaceControls";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import ZoomInput from "../ui/ZoomInput";

interface TopbarProps {
  chartTools?: { open: boolean; toggle(): void };
  topbarRef: RefObject<HTMLElement>;
  files: WorkspaceControls;
  hasGraph: boolean;
  typeOptions: string[];
  selectedType: string;
  onTypeChange: (type: string) => void;
  timeline?: boolean;
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
  chartTools,
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
            {chartTools && (
              <IconButton
                id="chart-tools-toggle"
                label="Chart controls"
                icon={<Icon name="layout" className="topbar-icon-svg" />}
                ariaExpanded={chartTools.open}
                ariaControls="chart-tools-panel"
                onClick={chartTools.toggle}
              />
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
