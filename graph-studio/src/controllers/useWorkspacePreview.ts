import { type Dispatch, useMemo } from "react";
import { useRelativeFilePreview } from "../hooks/useRelativeFilePreview";
import type { GraphAction } from "../state/graphActions";
import type { WorkspaceControls } from "./workspaceControls";

export function useWorkspacePreview(
  files: Pick<WorkspaceControls, "workspace" | "handleDroppedFiles">,
  dispatch: Dispatch<GraphAction>,
) {
  const { workspace } = files;
  const relativeRoot = useMemo(
    () =>
      workspace
        ? {
            name: workspace.name,
            handle: workspace.handle,
            files: workspace.files,
            baseFile: workspace.activePath || "",
          }
        : null,
    [workspace?.name, workspace?.handle, workspace?.files, workspace?.activePath],
  );
  const preview = useRelativeFilePreview(dispatch, relativeRoot);
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types || []).includes("Files");
  return {
    ...preview,
    handleAppDragOver(event: React.DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    handleAppDrop(event: React.DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dispatch({ type: "contextMenuClosed" });
      void files.handleDroppedFiles(event.dataTransfer.files);
    },
  };
}
