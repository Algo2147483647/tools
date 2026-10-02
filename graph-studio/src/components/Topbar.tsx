import type { RefObject } from "react";
import type { WorkspaceControls } from "../hooks/useGraphImport";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  FitIcon,
  GraphRootsIcon,
  MinusIcon,
  PlusIcon,
  RedoIcon,
  SaveIcon,
  SlidersIcon,
  UndoIcon,
} from "./topbar/TopbarIcons";
import IconButton from "./ui/IconButton";
import ZoomInput from "./ui/ZoomInput";
import WorkspaceIcon from "./workspace/WorkspaceIcon";

interface TopbarProps {
  topbarRef: RefObject<HTMLElement>;
  files: WorkspaceControls;
  hasGraph: boolean;
  typeOptions: string[];
  selectedType: string;
  onTypeChange: (type: string) => void;
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
            <div className="topbar-group nav-controls" aria-label="Graph navigation controls">
              <IconButton id="back-btn" label="Back" disabled={!canBack} onClick={onBack} icon={<ArrowLeftIcon />} />
              <IconButton id="up-btn" label="Up" disabled={!canUp} onClick={onUp} icon={<ArrowUpIcon />} />
              <IconButton
                id="all-btn"
                label="Show all roots"
                disabled={!hasGraph}
                onClick={onAll}
                icon={<GraphRootsIcon />}
              />
            </div>
            <div className="topbar-group zoom-controls" aria-label="Graph zoom controls">
              <IconButton
                id="zoom-out-btn"
                label="Zoom out"
                disabled={!canZoomOut}
                onClick={onZoomOut}
                icon={<MinusIcon />}
              />
              <IconButton
                id="zoom-in-btn"
                label="Zoom in"
                disabled={!canZoomIn}
                onClick={onZoomIn}
                icon={<PlusIcon />}
              />
              <ZoomInput value={zoomPercent} disabled={!hasGraph} onCommit={onZoomPercentCommit} />
              <IconButton
                id="zoom-fit-btn"
                label="Fit graph to viewport"
                disabled={!hasGraph}
                onClick={onZoomFit}
                icon={<FitIcon />}
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
              <WorkspaceIcon name="panel" />
            </button>
          )}
          {!files.homeVisible && (
            <>
              <IconButton id="undo-btn" label="Undo" disabled={!canUndo} onClick={onUndo} icon={<UndoIcon />} />
              <IconButton id="redo-btn" label="Redo" disabled={!canRedo} onClick={onRedo} icon={<RedoIcon />} />
              <IconButton
                id="save-json-btn"
                label="Save JSON"
                disabled={!hasGraph}
                onClick={onSaveJson}
                icon={<SaveIcon />}
                className="ghost-btn topbar-icon-btn topbar-save-btn"
              />
            </>
          )}
          <div id="floating-controls" className="control-dock">
            <IconButton
              id="settings-btn"
              label="Settings"
              icon={<SlidersIcon />}
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
