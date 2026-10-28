import { canOverwrite } from "../../shared/browser/fileAccess";
import { useWorkspacePreview } from "../../app/workspace/useWorkspacePreview";
import { getTimelineReferenceTime } from "../../graph/timeline/editing";
import FilePreviewModal from "../workspace/FilePreviewModal";
import SaveJsonModal from "../workspace/SaveJsonModal";
import NodeDetailModal from "../nodes/NodeDetailModal";

import type { StudioViewProps } from "./types";
export function StudioDialogs({
  session,
  ui,
  transactions,
  preview,
}: Pick<StudioViewProps, "session" | "ui" | "transactions"> & {
  preview: ReturnType<typeof useWorkspacePreview>;
}) {
  const { state } = session;
  const { filePreview, relativeLinkRoot } = preview;
  const detailNodeKey = state.ui.nodeDetail?.nodeKey || null;
  return (
    <>
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
        onSave={(nextKey, fields) =>
          detailNodeKey
            ? transactions.commitCommand({ type: "updateNodeFields", key: detailNodeKey, nextKey, fields })
            : undefined
        }
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
