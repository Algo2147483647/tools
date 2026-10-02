import { useEffect, useMemo } from "react";
import { canOverwrite } from "../adapters/fileAccess";
import type { AiController } from "../controllers/useAiController";
import type { AppearanceHistoryController } from "../controllers/useAppearanceHistory";
import type { ConsoleController } from "../controllers/useConsoleController";
import type { DocumentSessionController } from "../controllers/useDocumentSession";
import type { GraphTransactionsController } from "../controllers/useGraphTransactions";
import type { GraphViewportController } from "../controllers/useGraphViewport";
import type { NodeActionsController } from "../controllers/useNodeActions";
import { getSankeyError } from "../graph/sankey";
import ConsoleSidebar from "./ConsoleSidebar";
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
  appearanceHistory: AppearanceHistoryController;
  transactions: GraphTransactionsController;
  consoleController: ConsoleController;
  ai: AiController;
  viewport: GraphViewportController;
  nodeActions: NodeActionsController;
}

export default function StudioView({
  session,
  appearanceHistory,
  transactions,
  consoleController,
  ai,
  viewport,
  nodeActions,
}: StudioViewProps) {
  const { state, files, filePreview, relativeLinkRoot } = session;
  useEffect(() => {
    if (state.chartType === "compound") files.setExplorerOpen(false);
  }, [state.chartType, state.document.generation]);
  const { appearance } = appearanceHistory;
  const relationEditor = state.ui.relationEditor;
  const detailNodeKey = state.ui.nodeDetail?.nodeKey || null;
  const consoleSidebarVisible = state.ui.consoleSidebarOpen;
  const sankeyUnavailableReason = useMemo(
    () => (state.dag ? getSankeyError(state.dag.nodes, state.dag.edges) : null),
    [state.dag],
  );

  return (
    <div className="app-shell" onDragOver={session.handleAppDragOver} onDrop={session.handleAppDrop}>
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
          <span>{files.busy ? "Opening your files…" : files.notice}</span>
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
        onSettingsToggle={session.toggleSettings}
        onSaveJson={session.requestSave}
      />

      {files.homeVisible ? (
        <WelcomeScreen files={files} onNew={session.initializeCanvas} hasDocument={Boolean(state.dag)} />
      ) : (
        <Workspace
          compoundTools={
            state.chartType === "compound" && state.dag && !files.explorerOpen ? (
              <CompoundPanel
                key={state.document.generation}
                dag={state.dag}
                view={viewport.compound.view}
                onViewChange={viewport.compound.setView}
                onCommand={transactions.commitCommand}
                onSelect={viewport.setFocusedKey}
                onOpenNode={session.openNodeDetail}
                onMemberContextMenu={viewport.handleNodeContextMenu}
              />
            ) : undefined
          }
          onGroupToggle={viewport.toggleGroup}
          onGroupEnter={viewport.enterGroup}
          explorer={
            files.workspace && files.explorerOpen ? (
              <WorkspaceExplorer
                files={files}
                dirty={state.source.dirty}
                onOpenAsset={(path) => void session.handleOpenRelativeLink(path, "")}
              />
            ) : null
          }
          emptyContent={
            state.chartType === "compound" && state.dag && !viewport.stage ? (
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
          onInitializeCanvas={session.initializeCanvas}
          focusedKey={viewport.focusedKey}
          hideNodeBorders={session.hideNodeBorders}
          onNodeClick={viewport.handleNodeClick}
          onNodeDoubleClick={viewport.handleNodeDoubleClick}
          onNodeContextMenu={viewport.handleNodeContextMenu}
          onBackgroundContextMenu={viewport.handleBackgroundContextMenu}
          onFocusChange={viewport.setFocusedKey}
          onScroll={session.closeContextMenu}
          onSidebarResizeStart={viewport.handleConsoleSidebarResizeStart}
        />
      )}

      <SettingsModal
        open={state.ui.settingsOpen}
        chartType={state.chartType}
        sankeyUnavailableReason={sankeyUnavailableReason}
        onChartTypeChange={session.changeChartType}
        layoutMode={state.layout.mode}
        appearance={appearance}
        showNodeDetail={session.showNodeDetail}
        hideNodeBorders={session.hideNodeBorders}
        alignNodeWidthsToMax={session.alignNodeWidthsToMax}
        fileName={state.source.fileName}
        files={files}
        hasGraph={Boolean(state.dag)}
        consoleSidebarOpen={consoleSidebarVisible}
        aiSettings={session.aiSettings}
        aiBusy={ai.busy}
        onClose={session.toggleSettings}
        onLayoutModeChange={session.changeLayout}
        onLayoutAppearanceChange={appearanceHistory.handleLayoutAppearanceChange}
        onAppearanceCssVarChange={appearanceHistory.handleAppearanceCssVarChange}
        onAppearanceCssChange={appearanceHistory.handleAppearanceCssChange}
        onAppearanceDisplayChange={appearanceHistory.handleAppearanceDisplayChange}
        onAppearancePresetChange={appearanceHistory.handleAppearancePresetChange}
        onAppearanceReset={appearanceHistory.handleAppearanceReset}
        onAppearanceExport={appearanceHistory.handleAppearanceExport}
        onAppearanceImportClick={appearanceHistory.handleAppearanceImportClick}
        onAppearanceImportChange={appearanceHistory.handleAppearanceImportChange}
        onNodeDetailToggle={session.toggleNodeDetail}
        onNodeBordersToggle={session.toggleNodeBorders}
        onNodeWidthAlignToggle={session.toggleNodeWidthAlign}
        onConsoleSidebarToggle={session.toggleConsole}
        onInitializeCanvas={session.initializeCanvas}
        onExport={viewport.handleExportSvg}
        onAiSettingsChange={session.setAiSettings}
        onAiConnectionTest={ai.testConnection}
      />
      <ContextMenu
        menu={state.ui.contextMenu}
        dag={state.dag}
        chartType={state.chartType}
        view={viewport.compound.view}
        onAction={nodeActions.handleContextMenuAction}
        onClose={session.closeContextMenu}
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
        onClose={session.closeModals}
      />
      <NodeDetailModal
        open={Boolean(detailNodeKey)}
        nodeKey={detailNodeKey}
        node={detailNodeKey && state.dag ? state.dag.nodes[detailNodeKey] || null : null}

        initialFocus={session.nodeDetailInitialFocus}
        relativeLinkRoot={relativeLinkRoot}
        onOpenRelativeLink={session.handleOpenRelativeLink}
        onRelativeLinkError={session.handleRelativeLinkError}
        onSave={nodeActions.saveNode}
        onClose={session.closeModals}
      />
      <FilePreviewModal
        preview={filePreview}
        relativeLinkRoot={
          relativeLinkRoot && filePreview
            ? { ...relativeLinkRoot, baseFile: filePreview.relativePath }
            : relativeLinkRoot
        }
        onOpenRelativeLink={(url) => void session.handleOpenRelativeLink(url, filePreview?.relativePath)}
        onRelativeLinkError={session.handleRelativeLinkError}
        onClose={session.closeFilePreview}
      />
      <SaveJsonModal
        open={state.ui.saveDialogOpen}
        sourceFileName={state.source.fileName}
        canOverwrite={canOverwrite(state.source.fileHandle)}
        previousContent={session.savedJsonContent}
        currentContent={session.currentJsonContent}
        onOverwrite={session.handleOverwriteJson}
        onSaveNew={session.handleSaveJsonAsNew}
        onClose={session.closeSaveDialog}
      />
    </div>
  );
}
