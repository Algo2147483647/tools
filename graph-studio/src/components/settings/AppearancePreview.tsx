import { useFontMetricsKey } from "../../controllers/useFontMetricsKey";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GraphAppearance } from "../../graph/appearance";
import { getGraphChartLabel, type CompoundView, type GraphChartType, type GraphLayoutMode } from "../../graph/types";
import type { TimelineViewSettings } from "../../graph/timelineSettings";
import { useCompoundStage } from "../../controllers/useCompoundStage";
import { useDebouncedValue } from "../../controllers/useDebouncedValue";
import { useTimelineStage } from "../../controllers/useTimelineStage";
import GraphStage from "../../rendering/GraphStage";
import type { StageData } from "../../layout/types";
import graphCss from "../../styles/graph.css?inline";
import compoundCss from "../../styles/compound.css?inline";
import {
  buildFlatPreviewStage,
  compoundPreviewInput,
  INITIAL_PREVIEW_VIEW,
  PREVIEW_GRAPHS,
  previewGeometry,
} from "./previewModel";

const FRAME_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#fff}#preview-root{height:100%}</style></head><body><div id="preview-root"></div></body></html>';
const noop = () => {};

export default function AppearancePreview({
  appearance,
  chartType,
  layoutMode,
  hideNodeBorders,
  showNodeDetail,
  alignNodeWidthsToMax,
  timelineSettings,
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
  const timeline = useTimelineStage({
    dag: geometry.chartType === "timeline" ? PREVIEW_GRAPHS.timeline : null,
    visibleDag: PREVIEW_GRAPHS.timeline,
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
              <style>{`${graphCss}\n${compoundCss}\n.preview-viewport{display:flex;width:100%;height:100%;overflow:auto;box-sizing:border-box}.preview-viewport>svg{display:block;flex:none;max-width:none;margin:auto}.dag-graph[data-preview-detail="true"] .timeline-floating{display:none}`}</style>
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
      <p className="settings-preview-status" role="status">
        {error || (loading ? "Updating preview…" : "Sample graph · Changes apply to your current chart type.")}
      </p>
    </section>
  );
}

function PreviewCanvas({
  stage,
  appearance,
  hideNodeBorders,
  zoom,
  onToggle,
  onEnter,
  mode,
}: {
  stage: StageData;
  appearance: GraphAppearance;
  hideNodeBorders: boolean;
  zoom: number;
  onToggle: (id: string) => void;
  onEnter: (id: string) => void;
  mode: "overview" | "detail";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current,
      viewport = viewportRef.current;
    if (!svg || !viewport) return;
    let disposed = false;
    const fit = () => {
      if (disposed || !viewport.clientWidth || !viewport.clientHeight) return;
      // Measure rendered text as well as geometry; shadows need padding beyond getBBox().
      let boxes = [...svg.children]
        .filter(
          (element) =>
            element.tagName.toLowerCase() === "g" &&
            !element.classList.contains("dag-backdrop") &&
            !element.classList.contains("timeline-floating"),
        )
        .map((element) => (element as SVGGraphicsElement).getBBox())
        .filter((box) => box.width > 0 || box.height > 0);
      svg.setAttribute("data-preview-detail", String(mode === "detail"));
      if (mode === "detail") {
        const node =
          svg.querySelector<SVGGraphicsElement>(
            '[data-key="api"], [data-key="review"], [data-key="validate"], [data-key="process"]',
          ) ?? svg.querySelector<SVGGraphicsElement>("[data-key]");
        const rootMatrix = svg.getCTM();
        if (node && rootMatrix) {
          // Timeline markers, hit targets and labels live in separate layers with the same key.
          boxes = [...svg.querySelectorAll<SVGGraphicsElement>("[data-key]")]
            .filter((element) => element.dataset.key === node.dataset.key && element.getCTM())
            .map((element) => {
              const box = element.getBBox(),
                transform = rootMatrix.inverse().multiply(element.getCTM()!);
              const points = [
                [box.x, box.y],
                [box.x + box.width, box.y],
                [box.x, box.y + box.height],
                [box.x + box.width, box.y + box.height],
              ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
              const x = Math.min(...points.map((point) => point.x)),
                y = Math.min(...points.map((point) => point.y));
              return {
                x,
                y,
                width: Math.max(...points.map((point) => point.x)) - x,
                height: Math.max(...points.map((point) => point.y)) - y,
              } as DOMRect;
            });
        }
      }
      const padding =
        20 + (appearance.display.nodeShadow ? appearance.display.shadowBlur * 2 + appearance.display.shadowOffset : 0);
      const x =
        stage.timeline && mode === "overview"
          ? 0
          : (boxes.length ? Math.min(...boxes.map((box) => box.x)) : 0) - padding;
      const y =
        mode === "overview" && (stage.timeline || stage.lanes.length)
          ? 0
          : (boxes.length ? Math.min(...boxes.map((box) => box.y)) : 0) - padding;
      const width = Math.max(
        1,
        stage.timeline && mode === "overview"
          ? stage.stageWidth
          : Math.max(...boxes.map((box) => box.x + box.width), 1) - x + padding,
      );
      const height = Math.max(
        1,
        stage.timeline && mode === "overview"
          ? stage.stageHeight
          : Math.max(...boxes.map((box) => box.y + box.height), 1) - y + padding,
      );
      const scale = Math.min((viewport.clientWidth - 1) / width, (viewport.clientHeight - 1) / height) * zoom;
      svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
      svg.setAttribute("width", String(width * scale));
      svg.setAttribute("height", String(height * scale));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    fit();
    void svg.ownerDocument.fonts.ready.then(fit);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [stage, appearance, hideNodeBorders, zoom, mode]);
  return (
    <div className="preview-viewport" ref={viewportRef}>
      <GraphStage
        stage={stage}
        focusedKey={null}
        appearance={appearance}
        hideNodeBorders={hideNodeBorders}
        svgRef={svgRef}
        onNodeClick={noop}
        onNodeDoubleClick={noop}
        onNodeContextMenu={(event) => event.preventDefault()}
        onBackgroundContextMenu={(event) => event.preventDefault()}
        onFocusChange={noop}
        onGroupToggle={onToggle}
        onGroupEnter={onEnter}
      />
    </div>
  );
}
