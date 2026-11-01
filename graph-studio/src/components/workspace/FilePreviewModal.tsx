import { localJson, readLocalFile, subscribeLocalChanges } from "../../workspace/localApi";
import { useEffect, useState } from "react";
import type { RelativeLinkRoot, ResolvedRelativeFile } from "../../workspace/relativeLinks";
import MarkdownValue from "../content/MarkdownValue";
import Icon from "../ui/Icon";

interface FilePreviewModalProps {
  preview: ResolvedRelativeFile | null;
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onClose: () => void;
}

export default function FilePreviewModal({
  preview,
  relativeLinkRoot,
  onOpenRelativeLink,
  onClose,
}: FilePreviewModalProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [readError, setReadError] = useState("");
  const [editError, setEditError] = useState("");
  const [openingEditor, setOpeningEditor] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTextContent(null);
    setReadError("");
    setEditError("");
    if (!preview || (preview.previewKind !== "markdown" && preview.previewKind !== "text")) {
      return;
    }

    let request = 0;
    const reload = async () => {
      const current = ++request;
      try {
        const file = preview.local ? await readLocalFile(preview.local) : preview.file;
        const content = await file.text();
        if (!cancelled && current === request) {
          setTextContent(content);
          setReadError("");
        }
      } catch (error) {
        if (!cancelled && current === request)
          setReadError(error instanceof Error ? error.message : "Unable to read file.");
      }
    };
    void reload();
    const unsubscribe = preview.local
      ? subscribeLocalChanges((event) => {
          if (
            !event.locationId ||
            (event.locationId === preview.local!.locationId && (!event.path || event.path === preview.local!.path))
          )
            void reload();
        }, preview.local.locationId)
      : () => {};
    const onFocus = () => {
      if (preview.local) void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) {
      setIsFullscreen(false);
    }
  }, [preview]);

  if (!preview) {
    return null;
  }
  const activePreview = preview;

  return (
    <div className={`file-preview-modal is-visible${isFullscreen ? " is-fullscreen" : ""}`} role="presentation">
      <section
        className="file-preview-dialog"
        data-preview-kind={activePreview.previewKind}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
      >
        <div className="file-preview-header">
          <div>
            <h3 id="file-preview-title">{activePreview.path}</h3>
            <p className="file-preview-source">Original link: {activePreview.originalUrl}</p>
          </div>
          <div className="file-preview-actions">
            {activePreview.previewKind === "markdown" && activePreview.local && (
              <button
                type="button"
                className="ghost-btn file-preview-edit-btn"
                disabled={openingEditor}
                aria-busy={openingEditor}
                title={openingEditor ? "Opening…" : "Edit in the default application"}
                aria-label={openingEditor ? "Opening in the default application" : "Edit in the default application"}
                onClick={async () => {
                  setOpeningEditor(true);
                  setEditError("");
                  try {
                    await localJson("/files/" + activePreview.local!.locationId + "/open-external", "POST", {
                      path: activePreview.local!.path,
                    });
                  } catch (error) {
                    setEditError(error instanceof Error ? error.message : "Unable to open the default application.");
                  } finally {
                    setOpeningEditor(false);
                  }
                }}
              >
                <Icon name="edit" className="modal-icon-close-svg" />
              </button>
            )}
            <button
              className="ghost-btn file-preview-fullscreen-btn"
              type="button"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-pressed={isFullscreen ? "true" : "false"}
              onClick={() => setIsFullscreen((current) => !current)}
            >
              <Icon name={isFullscreen ? "collapse" : "expand"} className="modal-icon-close-svg" />
            </button>
            <button
              className="ghost-btn modal-icon-close-btn"
              type="button"
              title="Close preview"
              aria-label="Close preview"
              onClick={onClose}
            >
              <Icon name="close" className="modal-icon-close-svg" />
            </button>
          </div>
        </div>
        <div className="file-preview-body">
          {editError && (
            <p className="node-detail-error" role="alert">
              {editError}
            </p>
          )}
          {readError ? <p className="node-detail-error">{readError}</p> : renderFilePreviewContent()}
        </div>
      </section>
    </div>
  );

  function renderFilePreviewContent() {
    if (activePreview.previewKind === "image") {
      return <img className="file-preview-image" src={activePreview.url} alt={activePreview.file.name} />;
    }
    if (activePreview.previewKind === "html") {
      return <iframe className="file-preview-frame" title={activePreview.path} src={activePreview.url} sandbox="" />;
    }
    if (activePreview.previewKind === "markdown") {
      return textContent !== null ? (
        <MarkdownValue
          value={textContent}
          previewSurface
          relativeLinkRoot={relativeLinkRoot}
          onOpenRelativeLink={onOpenRelativeLink}
        />
      ) : (
        <p className="node-detail-empty">Reading file: {activePreview.path}</p>
      );
    }
    if (activePreview.previewKind === "text") {
      return textContent !== null ? (
        <pre className="file-preview-text">{textContent}</pre>
      ) : (
        <p className="node-detail-empty">Reading file: {activePreview.path}</p>
      );
    }
    return (
      <div className="file-preview-unsupported">
        <p>This file type is not supported for preview.</p>
        <p>Original link: {activePreview.originalUrl}</p>
        <p>Resolved target: {activePreview.path}</p>
        <a href={activePreview.url} target="_blank" rel="noreferrer">
          Open in browser
        </a>
      </div>
    );
  }
}
