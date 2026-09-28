import { useEffect, useState } from "react";
import type { RelativeLinkRoot } from "../adapters/relativeLinks";
import { MarkdownValue } from "./NodeFieldEditor";
import type { FilePreviewState } from "../hooks/useRelativeFilePreview";

interface FilePreviewModalProps {
  preview: FilePreviewState | null;
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onRelativeLinkError: (message: string) => void;
  onClose: () => void;
}

export default function FilePreviewModal({
  preview,
  relativeLinkRoot,
  onOpenRelativeLink,
  onRelativeLinkError,
  onClose,
}: FilePreviewModalProps) {
  const [textContent, setTextContent] = useState("");
  const [readError, setReadError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTextContent("");
    setReadError("");
    if (!preview || (preview.previewKind !== "markdown" && preview.previewKind !== "text")) {
      return;
    }

    preview.file.text()
      .then((content) => {
        if (!cancelled) {
          setTextContent(content);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : "Unable to read file content.";
          setReadError(`Unable to read file "${preview.path}". ${detail}`);
        }
      });

    return () => {
      cancelled = true;
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
      <section className="file-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="file-preview-title">
        <div className="file-preview-header">
          <div>
            <h3 id="file-preview-title">{activePreview.path}</h3>
            <p className="file-preview-source">Original link: {activePreview.originalUrl}</p>
          </div>
          <div className="file-preview-actions">
            <button
              className="ghost-btn file-preview-fullscreen-btn"
              type="button"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-pressed={isFullscreen ? "true" : "false"}
              onClick={() => setIsFullscreen((current) => !current)}
            >
              <FilePreviewFullscreenIcon active={isFullscreen} />
            </button>
            <button className="ghost-btn modal-icon-close-btn" type="button" title="Close preview" aria-label="Close preview" onClick={onClose}>
              <FilePreviewCloseIcon />
            </button>
          </div>
        </div>
        <div className="file-preview-body">
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
      return textContent ? (
        <MarkdownValue
          value={textContent}
          previewSurface
          relativeLinkRoot={relativeLinkRoot}
          onOpenRelativeLink={onOpenRelativeLink}
          onRelativeLinkError={onRelativeLinkError}
        />
      ) : <p className="node-detail-empty">Reading file: {activePreview.path}</p>;
    }
    if (activePreview.previewKind === "text") {
      return textContent ? <pre className="file-preview-text">{textContent}</pre> : <p className="node-detail-empty">Reading file: {activePreview.path}</p>;
    }
    return (
      <div className="file-preview-unsupported">
        <p>This file type is not supported for preview.</p>
        <p>Original link: {activePreview.originalUrl}</p>
        <p>Resolved target: {activePreview.path}</p>
        <a href={activePreview.url} target="_blank" rel="noreferrer">Open in browser</a>
      </div>
    );
  }
}

function FilePreviewFullscreenIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3v5H3" />
        <path d="M21 8h-5V3" />
        <path d="M16 21v-5h5" />
        <path d="M3 16h5v5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8V3h5" />
      <path d="M16 3h5v5" />
      <path d="M21 16v5h-5" />
      <path d="M8 21H3v-5" />
    </svg>
  );
}

function FilePreviewCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6L18 18" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
