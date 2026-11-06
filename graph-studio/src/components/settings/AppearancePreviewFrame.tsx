import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GraphAppearance } from "../../schema/appearance/types";
import type { StageData } from "../../layout/shared/types";
import compoundCss from "../../styles/compound.css?inline";
import graphCss from "../../styles/graph.css?inline";
import spatialCss from "../../styles/spatial.css?inline";
import { PreviewCanvas } from "./PreviewCanvas";

const FRAME_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#fff}#preview-root{height:100%}</style></head><body><div id="preview-root"></div></body></html>';

export interface AppearancePreviewFrameProps {
  stage: StageData | null;
  appearance: GraphAppearance;
  hideNodeBorders: boolean;
  mode: "overview" | "detail";
  onModeChange: (mode: "overview" | "detail") => void;
  loading?: boolean;
  error?: string;
  onReset?: () => void;
  onToggle?: (id: string) => void;
  onEnter?: (id: string) => void;
  emptyMessage?: string;
}

export default function AppearancePreviewFrame({
  stage,
  appearance,
  hideNodeBorders,
  mode,
  onModeChange,
  loading = false,
  error = "",
  onReset,
  onToggle,
  onEnter,
  emptyMessage = "Arranging graph…",
}: AppearancePreviewFrameProps) {
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [frameRoot, setFrameRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setZoom(1), [stage?.layoutMode]);
  const reset = () => {
    onReset?.();
    setZoom(1);
  };
  return (
    <section
      className={`settings-preview-card${expanded ? " is-expanded" : ""}${drawerOpen ? " is-open" : ""}`}
      aria-label="Live graph preview"
      aria-busy={loading}
    >
      <button
        type="button"
        className="preview-drawer-toggle"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((value) => !value)}
      >
        {drawerOpen ? "Hide preview" : "Show preview"}
      </button>
      <div className="preview-mode" role="group" aria-label="Preview view">
        <button
          type="button"
          aria-pressed={mode === "overview"}
          onClick={() => {
            onModeChange("overview");
            setZoom(1);
          }}
        >
          Overview
        </button>
        <button
          type="button"
          aria-pressed={mode === "detail"}
          onClick={() => {
            onModeChange("detail");
            setZoom(1);
          }}
        >
          Detail
        </button>
      </div>
      <div className="settings-preview-toolbar">
        <div role="group" aria-label="Preview zoom">
          <button
            type="button"
            aria-label="Zoom out preview"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value / 1.25))}
          >
            −
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            Fit
          </button>
          <button
            type="button"
            aria-label="Zoom in preview"
            disabled={zoom >= 4}
            onClick={() => setZoom((value) => Math.min(4, value * 1.25))}
          >
            +
          </button>
          <output aria-label="Preview zoom">{Math.round(zoom * 100)}%</output>
        </div>
        {onReset && (
          <button type="button" onClick={reset}>
            Reset view
          </button>
        )}
        <button
          type="button"
          aria-label={expanded ? "Show settings controls" : "Expand preview"}
          aria-pressed={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "↙" : "⛶"}
        </button>
      </div>
      <div className="settings-preview-frame-wrap">
        <iframe
          title="Graph preview"
          className="settings-preview-frame"
          sandbox="allow-same-origin"
          srcDoc={FRAME_DOCUMENT}
          onLoad={(event) => setFrameRoot(event.currentTarget.contentDocument?.getElementById("preview-root") ?? null)}
        />
        {frameRoot &&
          createPortal(
            <>
              <style>{`${graphCss}\n${compoundCss}\n${spatialCss}\n.preview-viewport{display:flex;width:100%;height:100%;overflow:auto;box-sizing:border-box}.preview-viewport>svg{display:block;flex:none;max-width:none;margin:auto}.dag-graph[data-preview-detail="true"] .timeline-floating{display:none}`}</style>
              {stage && (
                <PreviewCanvas
                  stage={stage}
                  appearance={appearance}
                  hideNodeBorders={hideNodeBorders}
                  zoom={zoom}
                  mode={mode}
                  onToggle={onToggle}
                  onEnter={onEnter}
                />
              )}
            </>,
            frameRoot,
          )}
        {!stage && !error && (
          <p className="settings-preview-overlay" role="status">
            {emptyMessage}
          </p>
        )}
      </div>
      {(error || loading) && (
        <p className="settings-preview-status" role="status">
          {error || "Updating preview…"}
        </p>
      )}
    </section>
  );
}
