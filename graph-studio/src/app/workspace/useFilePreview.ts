import { type Dispatch, useEffect, useRef, useState } from "react";
import {
  type RelativeLinkRoot,
  type ResolvedRelativeFile,
  isExternalUrl,
  resolveRelativeFile,
  resolveRelativePath,
} from "../../workspace/relativeLinks";
import { loadGeneralPreferences } from "../../workspace/generalPreferences";
import { localJson } from "../../workspace/localApi";
import type { GraphAction } from "../document/graphActions";
export function useFilePreview(dispatch: Dispatch<GraphAction>, relativeLinkRoot: RelativeLinkRoot | null) {
  const [filePreview, setFilePreview] = useState<ResolvedRelativeFile | null>(null);
  const requestRef = useRef(0);
  useEffect(() => {
    requestRef.current++;
    setFilePreview(null);
    return () => {
      requestRef.current++;
    };
  }, [relativeLinkRoot?.localId || relativeLinkRoot?.files, relativeLinkRoot?.baseFile]);
  useEffect(
    () => () => {
      if (filePreview) URL.revokeObjectURL(filePreview.url);
    },
    [filePreview],
  );
  async function handleOpenRelativeLink(url: string, fromFile?: string) {
    if (isExternalUrl(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const request = ++requestRef.current;
    const root =
      relativeLinkRoot && fromFile !== undefined ? { ...relativeLinkRoot, baseFile: fromFile } : relativeLinkRoot;
    try {
      const preferences = await loadGeneralPreferences();
      if (request !== requestRef.current) return;
      if (preferences.fileOpenMode === "external") {
        if (!root) throw new Error("Open a workspace to access linked files.");
        const resolved = resolveRelativePath(url, root.baseFile);
        if (!resolved.ok) throw new Error(resolved.message);
        const entry = root.files.get(resolved.path);
        if (!entry) throw new Error(`File not found in this workspace: ${resolved.path}`);
        if (!entry.local)
          throw new Error("Open this folder as a local workspace to use the system default application.");
        await localJson(`/files/${entry.local.locationId}/open-external`, "POST", { path: entry.local.path });
        return;
      }
    } catch (error) {
      if (request === requestRef.current)
        handleRelativeLinkError(error instanceof Error ? error.message : String(error));
      return;
    }
    const result = await resolveRelativeFile(root, url);
    if (request !== requestRef.current) {
      if (result.ok) URL.revokeObjectURL(result.file.url);
      return;
    }
    if (!result.ok) {
      handleRelativeLinkError(result.message);
      return;
    }
    setFilePreview(result.file);
  }
  function handleRelativeLinkError(message: string) {
    dispatch({ type: "statusChanged", status: message });
    window.alert(message);
  }
  function closeFilePreview() {
    requestRef.current++;
    setFilePreview(null);
  }
  return { relativeLinkRoot, filePreview, handleOpenRelativeLink, closeFilePreview };
}
