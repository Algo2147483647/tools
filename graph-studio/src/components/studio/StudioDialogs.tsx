import { canOverwrite } from "../../shared/browser/fileAccess";
import { useWorkspacePreview } from "../../app/workspace/useWorkspacePreview";
import { getTimelineReferenceTime } from "../../graph/timeline/editing";
import FilePreviewModal from "../workspace/FilePreviewModal";
import SaveJsonModal from "../workspace/SaveJsonModal";
import ContextMenu from "../menus/ContextMenu";
import HierarchyEditorModal from "../nodes/HierarchyEditorModal";
import NodeDetailModal from "../nodes/NodeDetailModal";
import RelationEditorModal from "../nodes/RelationEditorModal";

import type { StudioViewProps } from "./types";
export function StudioDialogs({
  session,
  ui,
  viewport,
  nodeActions,
  transactions,
  preview,
}: Pick<StudioViewProps, "session" | "ui" | "viewport" | "nodeActions" | "transactions"> & {
  preview: ReturnType<typeof useWorkspacePreview>;
}) {
  const { state } = session;
  const { filePreview, relativeLinkRoot } = preview;
  const relationEditor = state.ui.relationEditor;
  const detailNodeKey = state.ui.nodeDetail?.nodeKey || null;
  return (
    <>
      {" "}
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
    </>
  );
}
