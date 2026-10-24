import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useCompoundStage } from "../../app/layout/useCompoundStage";
import { useFontMetricsKey } from "../../app/layout/useFontMetricsKey";
import { useTimelineStage } from "../../app/layout/useTimelineStage";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import type { TimelineClock } from "../../graph/timeline/clock";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import { getGraphChartLabel, type CompoundView, type GraphChartType, type GraphLayoutMode } from "../../graph/types";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import compoundCss from "../../styles/compound.css?inline";
import graphCss from "../../styles/graph.css?inline";
import spatialCss from "../../styles/spatial.css?inline";
import { PreviewCanvas } from "./PreviewCanvas";
import {
  buildFlatPreviewStage,
  compoundPreviewInput,
  INITIAL_PREVIEW_VIEW,
  previewGeometry,
  timelinePreviewGraph,
} from "./previewModel";

const FRAME_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#fff}#preview-root{height:100%}</style></head><body><div id="preview-root"></div></body></html>';

export default function AppearancePreview({
  appearance,
  chartType,
  layoutMode,
  hideNodeBorders,
  showNodeDetail,
  alignNodeWidthsToMax,
  timelineSettings,
  timelineClock,
  mode,
  onModeChange,
}: {
  appearance: GraphAppearance;
  chartType: GraphChartType;
  layoutMode: GraphLayoutMode;
  hideNodeBorders: boolean;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
  timelineSettings?: TimelineViewSettings;
  timelineClock?: TimelineClock;
  mode: "overview" | "detail";
  onModeChange: (mode: "overview" | "detail") => void;
}) {
  const [view, setView] = useState<CompoundView>(INITIAL_PREVIEW_VIEW);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [frameRoot, setFrameRoot] = useState<HTMLElement | null>(null);
  const fontMetricsKey = useFontMetricsKey();
  const json = JSON.stringify(
    previewGeometry({
      appearance,
      fontMetricsKey,
      chartType,
      layoutMode,
      showNodeDetail,
      alignNodeWidthsToMax,
      timelineSettings,
      timelineClock,
      view,
    }),
  );
  const requested = useMemo(() => JSON.parse(json) as ReturnType<typeof previewGeometry>, [json]);
  const geometry = useDebouncedValue(requested);
  const compoundInput = useMemo(
    () => (geometry.chartType === "compound" ? compoundPreviewInput(geometry) : null),
    [geometry],
  );
  const compound = useCompoundStage(compoundInput);
  const timelineSample = useMemo(() => timelinePreviewGraph(geometry.timelineClock), [geometry.timelineClock]);
  const timeline = useTimelineStage({
    dag: geometry.chartType === "timeline" ? timelineSample : null,
    visibleDag: timelineSample,
    generation: 0,
    range: null,
    settings: geometry.timelineSettings,
    appearance: geometry.appearance,
    showNodeDetail: geometry.showNodeDetail,
  });
  const flat = useMemo(() => {
    try {
      return { stage: geometry.chartType === "timeline" ? null : buildFlatPreviewStage(geometry), error: "" };
    } catch (error) {
      return { stage: null, error: error instanceof Error ? error.message : "Unable to render preview." };
    }
  }, [geometry]);
  const matches = geometry.chartType === chartType;
  const stage = matches
    ? chartType === "compound"
      ? compound.stage
      : chartType === "timeline"
        ? timeline.stage
        : flat.stage
    : null;
  const error = matches ? (chartType === "compound" ? compound.error : flat.error) : "";
  const loading = requested !== geometry || (chartType === "compound" && compound.loading);
  useEffect(() => {
    setZoom(1);
    setView(INITIAL_PREVIEW_VIEW);
  }, [chartType]);
  const reset = () => {
    setView(INITIAL_PREVIEW_VIEW);
    setZoom(1);
  };
  return (
    <section
      className={`settings-preview-card${expanded ? " is-expanded" : ""}${drawerOpen ? " is-open" : ""}`}
      aria-label="Live graph preview"
      aria-busy={loading}
    >
      <div className="settings-preview-heading">
        <span className="eyebrow">LIVE PREVIEW</span>
        <small>{getGraphChartLabel(chartType)} · sample graph</small>
        <button
          type="button"
          className="preview-drawer-toggle"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((value) => !value)}
        >
          {drawerOpen ? "Hide preview" : "Show preview"}
        </button>
      </div>
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
        <button type="button" onClick={reset}>
          Reset sample
        </button>
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
                  onToggle={(id) =>
                    setView((current) => ({
                      ...current,
                      collapsedGroupIds: current.collapsedGroupIds.includes(id)
                        ? current.collapsedGroupIds.filter((key) => key !== id)
                        : [...current.collapsedGroupIds, id],
                    }))
                  }
                  onEnter={(id) => setView((current) => ({ ...current, focusGroupId: id }))}
                />
              )}
            </>,
            frameRoot,
          )}
        {!stage && !error && <p className="settings-preview-overlay">Arranging sample…</p>}
      </div>
      {(error || loading) && (
        <p className="settings-preview-status" role="status">
          {error || "Updating preview…"}
        </p>
      )}
    </section>
  );
}
