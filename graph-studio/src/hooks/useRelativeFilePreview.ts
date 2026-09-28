import { useEffect, useState, type Dispatch } from "react";
import {
  isExternalUrl,
  loadRelativeLinkMetadata,
  loadRelativeLinkRoot,
  openRelativeLinkRootDirectory,
  resolveRelativeFile,
  saveRelativeLinkRoot,
  type FilePreviewKind,
  type RelativeLinkRoot,
  type ResolvedRelativeFile,
} from "../adapters/relativeLinks";
import type { GraphAction } from "../state/graphActions";

export interface FilePreviewState {
  originalUrl: string;
  path: string;
  file: File;
  url: string;
  previewKind: FilePreviewKind;
}

export function useRelativeFilePreview(dispatch: Dispatch<GraphAction>) {
  const [relativeLinkRoot, setRelativeLinkRoot] = useState<RelativeLinkRoot | null>(() => {
    const metadata = loadRelativeLinkMetadata();
    return metadata ? { name: metadata.name, handle: null } : null;
  });
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function restoreRelativeLinkRoot() {
      const metadata = loadRelativeLinkMetadata();
      if (!metadata?.canAutoLoad) {
        return;
      }
      try {
        const restored = await loadRelativeLinkRoot();
        if (!cancelled && restored) {
          setRelativeLinkRoot(restored);
          dispatch({ type: "statusChanged", status: `Restored relative link base path: ${restored.name}.` });
        }
      } catch (error) {
        console.warn("Unable to restore relative link root", error);
      }
    }
    restoreRelativeLinkRoot();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  async function handleRelativeLinkRootSelect() {
    if (typeof window.showDirectoryPicker !== "function") {
      const message = "This browser does not support choosing a resolve path. Use a browser with File System Access API support.";
      dispatch({ type: "statusChanged", status: message });
      window.alert(message);
      return;
    }

    try {
      const root = await openRelativeLinkRootDirectory();
      if (!root) {
        return;
      }
      await saveRelativeLinkRoot(root);
      setRelativeLinkRoot(root);
      dispatch({ type: "statusChanged", status: `Relative link base path set to ${root.name}.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error(error);
      const message = "Unable to choose or save the relative link resolve path.";
      dispatch({ type: "statusChanged", status: message });
      window.alert(message);
    }
  }

  async function handleOpenRelativeLink(url: string) {
    if (isExternalUrl(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const result = await resolveRelativeFile(relativeLinkRoot, url);
    if (!result.ok) {
      handleRelativeLinkError(result.message);
      return;
    }

    openResolvedFilePreview(result.file);
  }

  function handleRelativeLinkError(message: string) {
    dispatch({ type: "statusChanged", status: message });
    window.alert(message);
  }

  function openResolvedFilePreview(file: ResolvedRelativeFile) {
    setFilePreview((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return {
        originalUrl: file.originalUrl,
        path: file.path,
        file: file.file,
        url: file.url,
        previewKind: file.previewKind,
      };
    });
    dispatch({ type: "statusChanged", status: `Opened ${file.path}.` });
  }

  function closeFilePreview() {
    setFilePreview((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }

  return {
    relativeLinkRoot,
    filePreview,
    handleRelativeLinkRootSelect,
    handleOpenRelativeLink,
    handleRelativeLinkError,
    closeFilePreview,
  };
}
