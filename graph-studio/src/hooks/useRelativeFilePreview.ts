import { type Dispatch, useEffect, useRef, useState } from "react";
import {
  type RelativeLinkRoot,
  type ResolvedRelativeFile,
  isExternalUrl,
  resolveRelativeFile,
} from "../adapters/relativeLinks";
import type { GraphAction } from "../state/graphActions";
export type FilePreviewState = ResolvedRelativeFile;
export function useRelativeFilePreview(dispatch: Dispatch<GraphAction>, relativeLinkRoot: RelativeLinkRoot | null) {
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);
  const requestRef = useRef(0);
  useEffect(() => {
    requestRef.current++;
    setFilePreview(null);
    return () => {
      requestRef.current++;
    };
  }, [relativeLinkRoot?.files, relativeLinkRoot?.baseFile]);
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
  return { relativeLinkRoot, filePreview, handleOpenRelativeLink, handleRelativeLinkError, closeFilePreview };
}
