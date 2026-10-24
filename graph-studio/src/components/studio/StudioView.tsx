import { useState } from "react";
import { useWorkspacePreview } from "../../app/workspace/useWorkspacePreview";
import { useSidebarResize } from "./useSidebarResize";
import ConsoleSidebar from "../console/ConsoleSidebar";
import WelcomeScreen from "../workspace/WelcomeScreen";
import WorkspaceExplorer from "../workspace/WorkspaceExplorer";
import WorkspaceOverview from "../workspace/WorkspaceOverview";
import { StudioDialogs } from "./StudioDialogs";
import { StudioLayoutPanels } from "./StudioLayoutPanels";
import { StudioSettings } from "./StudioSettings";
import Topbar from "./Topbar";
import Workspace from "./Workspace";

import type { StudioViewProps } from "./types";

export default function StudioView({
  session,
  preferences,
  ui,
  files,
  onInitializeCanvas,
  transactions,
  consoleController,
  ai,
  compoundLayoutPlan,
  timelineLayoutPlan,
  viewport,
  nodeActions,
}: StudioViewProps) {
  const { state, dispatch } = session;
  const [toolsOpen, setToolsOpen] = useState(false);
  const preview = useWorkspacePreview(files, dispatch);
  const { charts: appearanceHistory } = preferences;
  const { appearance } = appearanceHistory;
  const resizeSidebar = useSidebarResize(state.ui.consoleSidebarWidth, (width) =>
    dispatch({ type: "consoleSidebarWidthChanged", width }),
  );
  const consoleSidebarVisible = state.ui.consoleSidebarOpen;

  return (
    <div className="app-shell" onDragOver={preview.handleAppDragOver} onDrop={preview.handleAppDrop}>
      <input
        hidden
        type="file"
        ref={files.fileInputRef}
        accept=".json,application/json"
        onChange={files.onFileChange}
      />
      <input
        hidden
        type="file"
        ref={files.folderInputRef}
        multiple
        {...{ webkitdirectory: "", directory: "" }}
        onChange={files.onFolderChange}
      />
      {(files.busy || files.notice) && (
        <div className={`source-notice${files.busy ? " is-busy" : ""}`} role={files.busy ? "status" : "alert"}>
          <span>{files.busy ? "Preparing your workspace…" : files.notice}</span>
          {!files.busy && (
            <button aria-label="Dismiss message" onClick={() => files.setNotice("")}>
              ×
            </button>
          )}
        </div>
      )}
      <Topbar
        chartTools={
          state.dag && !files.homeVisible
            ? { open: toolsOpen && !state.ui.settingsOpen, toggle: () => setToolsOpen((value) => !value) }
            : undefined
        }
        topbarRef={viewport.topbarRef}
        files={files}
        hasGraph={Boolean(state.dag)}
        typeOptions={viewport.typeOptions}
        selectedType={viewport.activeType}
        onTypeChange={viewport.changeType}
        timeline={state.chartType === "timeline"}
        canBack={viewport.canBack}
        canUp={viewport.canUp}
        canUndo={transactions.canUndo}
        canRedo={transactions.canRedo}
        zoomPercent={viewport.zoomPercent}
        canZoomOut={viewport.canZoomOut}
        canZoomIn={viewport.canZoomIn}
        settingsOpen={state.ui.settingsOpen}
        onBack={viewport.back}
        onUp={viewport.up}
        onAll={viewport.showAll}
        onUndo={transactions.undo}
        onRedo={transactions.redo}
        onZoomOut={viewport.zoom.zoomOut}
        onZoomIn={viewport.zoom.zoomIn}
        onZoomFit={viewport.zoom.zoomFit}
        onZoomPercentCommit={viewport.zoom.setZoomPercent}
        onSettingsToggle={ui.toggleSettings}
        onSaveJson={session.requestSave}
      />

      {files.homeVisible ? (
        <WelcomeScreen files={files} onNew={onInitializeCanvas} hasDocument={Boolean(state.dag)} />
      ) : (
        <Workspace
          topbarRef={viewport.topbarRef}
          onGroupToggle={viewport.toggleGroup}
          onGroupEnter={viewport.enterGroup}
          explorer={
            files.workspace && files.explorerOpen ? (
              <WorkspaceExplorer
                key={files.workspace.locationId}
                files={files}
                dirty={state.source.dirty}
                onOpenAsset={(path) => void preview.handleOpenRelativeLink(path, "")}
              />
            ) : null
          }
          emptyContent={
            state.chartType === "timeline" &&
            state.dag &&
            !viewport.stage &&
            (viewport.activeType || viewport.activeTrack || viewport.activeTimelineRange) ? (
              <div className="compound-loading" role="status">
                <p>{viewport.status}</p>
                <button className="studio-button" onClick={viewport.showAll}>
                  Show all events
                </button>
              </div>
            ) : state.chartType === "compound" && state.dag && !viewport.stage ? (
              <div className="compound-loading" role={viewport.compoundLayout.error ? "alert" : "status"}>
                {viewport.status}
              </div>
            ) : files.workspace && !state.dag ? (
              <WorkspaceOverview files={files} />
            ) : undefined
          }
          containerRef={viewport.containerRef}
          overlaysRef={viewport.overlaysRef}
          svgRef={viewport.svgRef}
          stage={viewport.stage}
          documentGeneration={state.document.generation}
          status={viewport.status}
          sidebar={
            <ConsoleSidebar
              hasGraph={Boolean(state.dag)}
              entries={consoleController.entries}
              inputValue={consoleController.input}
              contextNodeKey={consoleController.contextNodeKey}
              aiBusy={ai.busy}
              suggestions={consoleController.suggestions}
              activeSuggestionIndex={consoleController.activeSuggestionIndex}
              onReviewApply={ai.applyReview}
              onReviewDismiss={ai.dismissReview}
              onReviewCopy={ai.copyReview}
              onInputChange={consoleController.changeInput}
              onKeyDown={(event) => consoleController.handleKeyDown(event, ai.request)}
              onPaste={(event) => consoleController.handlePaste(event, ai.request)}
              onSuggestionSelect={(suggestion) => consoleController.changeInput(suggestion.insertText)}
            />
          }
          sidebarOpen={consoleSidebarVisible}
          sidebarWidth={state.ui.consoleSidebarWidth}
          appearance={appearance}
          onInitializeCanvas={onInitializeCanvas}
          focusedKey={viewport.focusedKey}
          hideNodeBorders={appearanceHistory.hideNodeBorders}
          onTimelineNodePin={viewport.pinTimelineNode}
          onNodeClick={viewport.handleNodeClick}
          onNodeDoubleClick={viewport.handleNodeDoubleClick}
          onNodeContextMenu={viewport.handleNodeContextMenu}
          onBackgroundContextMenu={viewport.handleBackgroundContextMenu}
          onFocusChange={viewport.setFocusedKey}
          onScroll={ui.closeContextMenu}
          onSidebarResizeStart={resizeSidebar}
        />
      )}

      <StudioLayoutPanels
        session={session}
        preferences={preferences}
        ui={ui}
        files={files}
        transactions={transactions}
        ai={ai}
        viewport={viewport}
        compoundLayoutPlan={compoundLayoutPlan}
        timelineLayoutPlan={timelineLayoutPlan}
        key={state.chartType + state.document.generation}
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
      />
      <StudioSettings
        session={session}
        preferences={preferences}
        ui={ui}
        files={files}
        ai={ai}
        viewport={viewport}
        compoundLayoutPlan={compoundLayoutPlan}
        timelineLayoutPlan={timelineLayoutPlan}
      />
      <StudioDialogs
        session={session}
        ui={ui}
        viewport={viewport}
        nodeActions={nodeActions}
        transactions={transactions}
        preview={preview}
      />
    </div>
  );
}
