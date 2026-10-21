import { getTimelineClock } from "../graph/timelineClock";
import { useMemo } from "react";
import { canOverwrite } from "../adapters/fileAccess";
import type { AiController } from "../controllers/useAiController";
import type { PreferencesController } from "../controllers/usePreferencesController";
import type { WorkspaceControls } from "../controllers/workspaceControls";
import type { StudioUiController } from "../controllers/useStudioUi";
import { useWorkspacePreview } from "../controllers/useWorkspacePreview";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { downloadSvg, prepareHtmlSvg } from "../rendering/export-svg";
import type { ConsoleController } from "../controllers/useConsoleController";
import type { DocumentSessionController } from "../controllers/useDocumentSession";
import type { GraphTransactionsController } from "../controllers/useGraphTransactions";
import type { GraphViewportController } from "../controllers/useGraphViewport";
import type { NodeActionsController } from "../controllers/useNodeActions";
import { getSankeyError } from "../graph/sankey";
import { getTimelineReferenceTime } from "../graph/timelineEditing";
import ConsoleSidebar from "./ConsoleSidebar";
import SpatialControls from "./SpatialControls";
import CompoundPanel from "./CompoundPanel";
import ContextMenu from "./ContextMenu";
import HierarchyEditorModal from "./HierarchyEditorModal";
import FilePreviewModal from "./FilePreviewModal";
import NodeDetailModal from "./NodeDetailModal";
import RelationEditorModal from "./RelationEditorModal";
import SaveJsonModal from "./SaveJsonModal";
import SettingsModal from "./settings/SettingsModal";
import Topbar from "./Topbar";
import Workspace from "./Workspace";
import WelcomeScreen from "./workspace/WelcomeScreen";
import WorkspaceExplorer from "./workspace/WorkspaceExplorer";
import WorkspaceOverview from "./workspace/WorkspaceOverview";

interface StudioViewProps {
  session: DocumentSessionController;
  preferences: PreferencesController;
  ui: StudioUiController;
  files: WorkspaceControls;
  onInitializeCanvas(): void;
  transactions: GraphTransactionsController;
  consoleController: ConsoleController;
  ai: AiController;
  viewport: GraphViewportController;
  nodeActions: NodeActionsController;
}

export default function StudioView({
  session,
  preferences,
  ui,
  files,
  onInitializeCanvas,
  transactions,
  consoleController,
  ai,
  viewport,
  nodeActions,
}: StudioViewProps) {
  const { state, dispatch } = session;
  const preview = useWorkspacePreview(files, dispatch);
  const { filePreview, relativeLinkRoot } = preview;
  const { charts: appearanceHistory } = preferences;
  const { appearance } = appearanceHistory;
  const resizeSidebar = useSidebarResize(state.ui.consoleSidebarWidth, (width) =>
    dispatch({ type: "consoleSidebarWidthChanged", width }),
  );
  function exportSvg() {
    if (!viewport.svgRef.current) {
      dispatch({ type: "statusChanged", status: "Render a DAG first, then export the SVG." });
      return;
    }
    downloadSvg(viewport.svgRef.current);
    dispatch({ type: "statusChanged", status: "Exported current view as dag-graph.svg." });
  }
  async function exportHtml() {
    const { stage } = viewport;
    const graph = state.dag;
    const svg = viewport.svgRef.current;
    if (!svg || !stage || !graph) {
      dispatch({ type: "statusChanged", status: "Render a graph first, then export HTML." });
      return;
    }
    try {
      // Snapshot before loading so a later edit or navigation cannot mix document and SVG versions.
      const snapshot = prepareHtmlSvg(svg);
      const { downloadHtml } = await import("../rendering/export-html");
      downloadHtml(snapshot, stage, graph, state.source.fileName);
      dispatch({ type: "statusChanged", status: "Exported current canvas as interactive HTML." });
    } catch (error) {
      dispatch({
        type: "statusChanged",
        status: `HTML export failed: ${error instanceof Error ? error.message : error}`,
      });
    }
  }
  const relationEditor = state.ui.relationEditor;
  const detailNodeKey = state.ui.nodeDetail?.nodeKey || null;
  const consoleSidebarVisible = state.ui.consoleSidebarOpen;
  const sankeyUnavailableReason = useMemo(
    () => (state.dag ? getSankeyError(state.dag.nodes, state.dag.edges) : null),
    [state.dag],
  );
  const compoundPanel =
    state.chartType === "compound" && state.dag ? (
      <CompoundPanel
        key={state.document.generation}
        dag={state.dag}
        view={viewport.compound.view}
        onViewChange={viewport.compound.setView}
        onCommand={transactions.commitCommand}
        onSelect={viewport.setFocusedKey}
        onOpenNode={ui.openNodeDetail}
        onMemberContextMenu={viewport.handleNodeContextMenu}
      />
    ) : null;

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
        topbarRef={viewport.topbarRef}
        files={files}
        hasGraph={Boolean(state.dag)}
        typeOptions={viewport.typeOptions}
        selectedType={viewport.activeType}
        onTypeChange={viewport.changeType}
        timeline={
          state.chartType === "timeline"
            ? {
                clock: getTimelineClock(state.dag?.metadata),
                tracks: viewport.trackOptions,
                selectedTrack: viewport.activeTrack,
                onTrackChange: viewport.changeTrack,
                range: viewport.activeTimelineRange,
                onRangeChange: viewport.changeTimelineRange,
                canLocate: Boolean(viewport.focusedKey && viewport.stage?.nodeMap[viewport.focusedKey]),
                onLocate: () => {
                  if (viewport.focusedKey) viewport.zoom.locateNode(viewport.focusedKey);
                },
              }
            : undefined
        }
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
          spatialTools={
            state.chartType === "spatial" ? (
              <SpatialControls spatial={viewport.spatialView} onReset={viewport.zoom.zoomFit} />
            ) : undefined
          }
          compoundTools={!files.workspace || !files.explorerOpen ? compoundPanel : undefined}
          onGroupToggle={viewport.toggleGroup}
          onGroupEnter={viewport.enterGroup}
          explorer={
            files.workspace && files.explorerOpen ? (
              <WorkspaceExplorer
                key={files.workspace.locationId}
                files={files}
                dirty={state.source.dirty}
                onOpenAsset={(path) => void preview.handleOpenRelativeLink(path, "")}
              >
                {compoundPanel}
              </WorkspaceExplorer>
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
              aiHarness={ai.harness}
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

      <SettingsModal
        open={state.ui.settingsOpen}
        chartType={state.chartType}
        sankeyUnavailableReason={sankeyUnavailableReason}
        onChartTypeChange={ui.changeChartType}
        timelineControls={{
          clock: getTimelineClock(state.dag?.metadata),
          settings: viewport.timelineSettings,
          onChange: viewport.changeTimelineSettings,
          onReadapt: viewport.readaptTimeline,
        }}
        layoutMode={state.layout.mode}
        appearance={appearance}
        showNodeDetail={appearanceHistory.showNodeDetail}
        hideNodeBorders={appearanceHistory.hideNodeBorders}
        alignNodeWidthsToMax={appearanceHistory.alignNodeWidthsToMax}
        fileName={state.source.fileName}
        files={files}
        hasGraph={Boolean(state.dag)}
        consoleSidebarOpen={consoleSidebarVisible}
        aiSettings={preferences.aiSettings}
        aiBusy={ai.busy}
        onClose={ui.toggleSettings}
        onLayoutModeChange={ui.changeLayout}
        onLayoutAppearanceChange={appearanceHistory.handleLayoutAppearanceChange}
        onAppearanceCssVarChange={appearanceHistory.handleAppearanceCssVarChange}
        onAppearanceCssChange={appearanceHistory.handleAppearanceCssChange}
        onAppearanceDisplayChange={appearanceHistory.handleAppearanceDisplayChange}
        onAppearanceAdjustmentStart={appearanceHistory.beginAdjustment}
        onAppearanceAdjustmentEnd={appearanceHistory.endAdjustment}
        onSectionReset={appearanceHistory.resetSection}
        onAppearanceUndo={appearanceHistory.undo}
        onAppearanceRedo={appearanceHistory.redo}
        canUndoAppearance={appearanceHistory.canUndo}
        canRedoAppearance={appearanceHistory.canRedo}
        preferencesSaved={preferences.saved}
        onAppearancePresetChange={appearanceHistory.handleAppearancePresetChange}
        onAppearanceReset={appearanceHistory.handleAppearanceReset}
        onAppearanceExport={appearanceHistory.handleAppearanceExport}
        onAppearanceImportClick={appearanceHistory.handleAppearanceImportClick}
        onAppearanceImportChange={appearanceHistory.handleAppearanceImportChange}
        onNodeDetailToggle={appearanceHistory.toggleNodeDetail}
        onNodeBordersToggle={appearanceHistory.toggleNodeBorders}
        onNodeWidthAlignToggle={appearanceHistory.toggleNodeWidthAlign}
        onConsoleSidebarToggle={ui.toggleConsole}
        onInitializeCanvas={onInitializeCanvas}
        onExport={exportSvg}
        onExportHtml={exportHtml}
        canExportCanvas={Boolean(viewport.stage && !files.homeVisible)}
        onAiSettingsChange={preferences.setAiSettings}
        onAiConnectionTest={ai.testConnection}
      />
      <ContextMenu
        menu={state.ui.contextMenu}
        dag={state.dag}
        chartType={state.chartType}
        view={viewport.compound.view}
        onAction={nodeActions.handleContextMenuAction}
        onClose={ui.closeContextMenu}
      />
      {nodeActions.hierarchyEdit && state.dag && (
        <HierarchyEditorModal
          edit={nodeActions.hierarchyEdit}
          dag={state.dag}
          onSave={transactions.commitCommands}
          onClose={nodeActions.closeHierarchyEditor}
        />
      )}
      <RelationEditorModal
        open={Boolean(relationEditor)}
        nodeKey={relationEditor?.nodeKey || null}
        field={relationEditor?.field || null}
        fieldLabel={relationEditor?.field === "parents" ? "incoming relationships" : "outgoing relationships"}
        node={relationEditor && state.dag ? state.dag.nodes[relationEditor.nodeKey] || null : null}
        sankey={state.dag?.diagram === "sankey"}
        onSave={nodeActions.saveRelations}
        onClose={ui.closeModals}
      />
      <NodeDetailModal
        open={Boolean(detailNodeKey)}
        graph={state.dag}
        nodeKey={detailNodeKey}
        node={detailNodeKey && state.dag ? state.dag.nodes[detailNodeKey] || null : null}
        timeline={state.chartType === "timeline"}
        timelineReferenceTime={getTimelineReferenceTime(state.dag)}
        initialFocus={ui.nodeDetailInitialFocus}
        relativeLinkRoot={relativeLinkRoot}
        onOpenRelativeLink={preview.handleOpenRelativeLink}
        onSave={nodeActions.saveNode}
        onClose={ui.closeModals}
      />
      <FilePreviewModal
        preview={filePreview}
        relativeLinkRoot={
          relativeLinkRoot && filePreview
            ? { ...relativeLinkRoot, baseFile: filePreview.relativePath }
            : relativeLinkRoot
        }
        onOpenRelativeLink={(url) => void preview.handleOpenRelativeLink(url, filePreview?.relativePath)}
        onClose={preview.closeFilePreview}
      />
      <SaveJsonModal
        open={state.ui.saveDialogOpen}
        sourceFileName={state.source.fileName}
        canOverwrite={canOverwrite(state.source.fileHandle)}
        previousContent={session.savedJsonContent}
        currentContent={session.currentJsonContent}
        onOverwrite={session.handleOverwriteJson}
        onSaveNew={session.handleSaveJsonAsNew}
        onClose={ui.closeSaveDialog}
      />
    </div>
  );
}
