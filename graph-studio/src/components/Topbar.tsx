import type { WorkspaceControls } from "../hooks/useGraphImport";
import WorkspaceIcon from "./workspace/WorkspaceIcon";
import type { ChangeEvent, MouseEvent, RefObject } from "react";
import type { GraphAppearance, GraphLayoutAppearance } from "../graph/appearance";
import type { GraphAppearancePresetId } from "../graph/appearanceCommands";
import type { GraphLayoutMode } from "../graph/types";
import type { AiSettings } from "../ai/types";
import SettingsModal from "./settings/SettingsModal";
import { ArrowLeftIcon, ArrowUpIcon, FitIcon, GraphRootsIcon, MinusIcon, PlusIcon, RedoIcon, SaveIcon, SlidersIcon, UndoIcon } from "./topbar/TopbarIcons";
import IconButton from "./ui/IconButton";
import ZoomInput from "./ui/ZoomInput";

interface TopbarProps {
  topbarRef: RefObject<HTMLElement>;
  layoutMode: GraphLayoutMode;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  status: string;
  fileName: string;
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
  consoleSidebarOpen: boolean;
  aiSettings: AiSettings;
  aiBusy: boolean;
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
  onConsoleSidebarToggle: () => void;
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
  onInitializeCanvas: () => void;
  onExport: () => void;
  onSaveJson: () => void;
  onAiSettingsChange: (settings: AiSettings) => void;
  onAiConnectionTest: () => Promise<boolean>;
}

export default function Topbar({
  topbarRef,
  layoutMode,
  appearance,
  showNodeDetail,
  hideNodeBorders,
  alignNodeWidthsToMax,
  status,
  fileName,
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
  consoleSidebarOpen,
  aiSettings,
  aiBusy,
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
  onConsoleSidebarToggle,
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
  onInitializeCanvas,
  onExport,
  onSaveJson,
  onAiSettingsChange,
  onAiConnectionTest,
}: TopbarProps) {
  return (
    <header ref={topbarRef} className={`topbar${files.homeVisible ? " topbar--home" : ""}`}>
      <div className="topbar-brand">
        <button className="brand-home" aria-label="Go to home" onClick={() => files.setHomeVisible(true)}><strong>Graph Studio</strong></button>
      </div>
      <div className="topbar-actions">
        {!files.homeVisible && <><label className="topbar-group type-filter-control">
          <span>Type</span>
          <select
            aria-label="Filter graph by type"
            value={selectedType}
            disabled={!hasGraph || typeOptions.length === 0}
            onChange={(event) => onTypeChange(event.currentTarget.value)}
          >
            <option value="">All types</option>
            {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <div className="topbar-group nav-controls" aria-label="Graph navigation controls">
          <IconButton id="back-btn" label="Back" disabled={!canBack} onClick={onBack} icon={<ArrowLeftIcon />} />
          <IconButton id="up-btn" label="Up" disabled={!canUp} onClick={onUp} icon={<ArrowUpIcon />} />
          <IconButton id="all-btn" label="Show all roots" disabled={!hasGraph} onClick={onAll} icon={<GraphRootsIcon />} />
        </div>
        <div className="topbar-group zoom-controls" aria-label="Graph zoom controls">
          <IconButton id="zoom-out-btn" label="Zoom out" disabled={!canZoomOut} onClick={onZoomOut} icon={<MinusIcon />} />
          <IconButton id="zoom-in-btn" label="Zoom in" disabled={!canZoomIn} onClick={onZoomIn} icon={<PlusIcon />} />
          <ZoomInput value={zoomPercent} disabled={!hasGraph} onCommit={onZoomPercentCommit} />
          <IconButton id="zoom-fit-btn" label="Fit graph to viewport" disabled={!hasGraph} onClick={onZoomFit} icon={<FitIcon />} />
        </div>
        </>}
        <div className="topbar-group file-controls" aria-label="Graph file controls">
          {files.workspace && !files.homeVisible && <button className="studio-icon-button" aria-label="Toggle workspace explorer" title="Explorer" aria-pressed={files.explorerOpen} onClick={() => files.setExplorerOpen(value => !value)}><WorkspaceIcon name="panel"/></button>}
          {!files.homeVisible && <><IconButton id="undo-btn" label="Undo" disabled={!canUndo} onClick={onUndo} icon={<UndoIcon />} />
          <IconButton id="redo-btn" label="Redo" disabled={!canRedo} onClick={onRedo} icon={<RedoIcon />} />
          <IconButton id="save-json-btn" label="Save JSON" disabled={!hasGraph} onClick={onSaveJson} icon={<SaveIcon />} className="ghost-btn topbar-icon-btn topbar-save-btn" /></>}
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
            <SettingsModal
              open={settingsOpen}
              layoutMode={layoutMode}
              appearance={appearance}
              showNodeDetail={showNodeDetail}
              hideNodeBorders={hideNodeBorders}
              alignNodeWidthsToMax={alignNodeWidthsToMax}
              status={status}
              fileName={fileName}
              files={files}
              hasGraph={hasGraph}
              consoleSidebarOpen={consoleSidebarOpen}
              aiSettings={aiSettings}
              aiBusy={aiBusy}
              onClose={onSettingsToggle}
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
              onConsoleSidebarToggle={onConsoleSidebarToggle}
              onInitializeCanvas={onInitializeCanvas}
              onExport={onExport}
              onAiSettingsChange={onAiSettingsChange}
              onAiConnectionTest={onAiConnectionTest}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
