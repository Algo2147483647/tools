import { useCallback,useEffect,useLayoutEffect,useMemo,useRef } from "react";
import type { StageData } from "../layout/shared/types";
import { useWheelZoom } from "./useWheelZoom";
import {
applyGraphZoom,
getAppliedZoomScale,
getFitZoomScale,
getViewportMetrics,
setSpatialCamera,
} from "./viewportDom";
import {
clamp,
getItemOrigin,
getNodeLocatePoint,
spatialMinScale,
ZOOM_STEP_FACTOR,
type ZoomAnchor,
} from "./zoomGeometry";

interface UseGraphZoomInput {
  containerRef: React.RefObject<HTMLElement>;
  svgRef: React.RefObject<SVGSVGElement>;
  topbarRef: React.RefObject<HTMLElement>;
  overlaysRef: React.RefObject<HTMLElement>;
  stage: StageData | null;
  viewKey?: string;
  scale: number;
  minScale: number;
  maxScale: number;
  onZoomChange: (scale: number, minScale?: number) => void;
}

export function useGraphZoom({
  containerRef,
  svgRef,
  topbarRef,
  overlaysRef,
  stage,
  viewKey,
  scale,
  minScale,
  maxScale,
  onZoomChange,
}: UseGraphZoomInput) {
  const zoomStateRef = useRef({ scale, minScale, maxScale });
  const previousStageRef = useRef<{ stage: StageData | null; viewKey?: string }>({ stage: null });
  const layoutAnchorRef = useRef<{ id: string; clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    zoomStateRef.current = { scale, minScale, maxScale };
  }, [maxScale, minScale, scale]);

  const apply = useCallback(
    (nextScale: number, preserveCenter: boolean, nextMinScale?: number, anchor?: ZoomAnchor) => {
      const container = containerRef.current;
      const svg = svgRef.current;
      if (!container || !svg || !stage) {
        return;
      }
      const currentZoom = zoomStateRef.current;
      const resolvedMinScale = nextMinScale ?? currentZoom.minScale;
      const clampedScale = clamp(nextScale, resolvedMinScale, currentZoom.maxScale);
      applyGraphZoom(container, svg, topbarRef.current, stage, clampedScale, preserveCenter, anchor, overlaysRef.current);
      zoomStateRef.current = { ...currentZoom, scale: clampedScale, minScale: resolvedMinScale };
      if (
        Math.abs(currentZoom.scale - clampedScale) > 0.0001 ||
        Math.abs(currentZoom.minScale - resolvedMinScale) > 0.0001
      ) {
        onZoomChange(clampedScale, resolvedMinScale);
      }
    },
    [containerRef, onZoomChange, stage, svgRef, topbarRef, overlaysRef],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: ZoomAnchor) => {
      if (!Number.isFinite(factor) || factor <= 0) {
        return;
      }
      const currentZoom = zoomStateRef.current;
      const currentScale = getAppliedZoomScale(svgRef.current, currentZoom.scale);
      apply(currentScale * factor, !anchor, currentZoom.minScale, anchor);
    },
    [apply, svgRef],
  );

  const refresh = useCallback(
    (preserveCenter: boolean) => {
      const container = containerRef.current;
      if (!container || !stage) {
        return;
      }
      const currentZoom = zoomStateRef.current;
      const fitScale = getFitZoomScale(container, topbarRef.current, stage, overlaysRef.current);
      if (stage.layoutMode === "spatial") {
        apply(preserveCenter ? currentZoom.scale : fitScale, preserveCenter, spatialMinScale(fitScale));
        return;
      }
      const keepCompoundScale = preserveCenter && (stage.layoutMode === "compound" || stage.layoutMode === "timeline");
      const nextMinScale = keepCompoundScale ? Math.min(fitScale, currentZoom.scale) : fitScale;
      const nextScale =
        !keepCompoundScale && Math.abs(currentZoom.scale - currentZoom.minScale) < 0.001
          ? nextMinScale
          : clamp(currentZoom.scale, nextMinScale, currentZoom.maxScale);
      apply(nextScale, preserveCenter, nextMinScale);
    },
    [apply, containerRef, stage, topbarRef, overlaysRef],
  );

  useLayoutEffect(() => {
    const previous = previousStageRef.current;
    const preserve =
      (stage?.layoutMode === "compound" || stage?.layoutMode === "timeline" || stage?.layoutMode === "spatial") &&
      previous.stage?.layoutMode === stage.layoutMode &&
      previous.viewKey === viewKey;
    refresh(preserve);
    if (!preserve && stage?.layoutMode === "timeline" && containerRef.current) {
      const fit = getFitZoomScale(containerRef.current, topbarRef.current, stage, overlaysRef.current);
      apply(Math.max(fit, 0.85), false, fit);
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
    const anchor = layoutAnchorRef.current;
    if (preserve && anchor && stage && svgRef.current && containerRef.current) {
      const point = getItemOrigin(stage, anchor.id);
      if (point) {
        const rect = svgRef.current.getBoundingClientRect();
        containerRef.current.scrollLeft += rect.left + (point.x * rect.width) / stage.stageWidth - anchor.clientX;
        containerRef.current.scrollTop += rect.top + (point.y * rect.height) / stage.stageHeight - anchor.clientY;
      }
    }
    layoutAnchorRef.current = null;
    previousStageRef.current = { stage, viewKey };
  }, [stage, viewKey]);

  useEffect(() => {
    const overlays = overlaysRef.current;
    if (!overlays || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => {
      const current = zoomStateRef.current;
      refresh(Math.abs(current.scale - current.minScale) >= 0.001);
    });
    observer.observe(overlays);
    return () => observer.disconnect();
  }, [overlaysRef, refresh]);

  useWheelZoom(containerRef, stage, zoomBy);

  return useMemo(
    () => ({
      zoomBy,
      panBy: (dx: number, dy: number) => {
        const svg = svgRef.current;
        if (svg && stage?.layoutMode === "spatial")
          setSpatialCamera(svg, Number(svg.dataset.cameraX || 0) + dx, Number(svg.dataset.cameraY || 0) + dy);
      },
      zoomIn: () => zoomBy(ZOOM_STEP_FACTOR),
      zoomOut: () => zoomBy(1 / ZOOM_STEP_FACTOR),
      zoomFit: () => {
        if (containerRef.current && stage) {
          const fitScale = getFitZoomScale(containerRef.current, topbarRef.current, stage, overlaysRef.current);
          apply(fitScale, false, stage.layoutMode === "spatial" ? spatialMinScale(fitScale) : fitScale);
        }
      },
      locateNode: (id: string) => {
        const container = containerRef.current;
        const svg = svgRef.current;
        const node = stage?.nodeMap[id];
        if (!container || !svg || !stage || !node) return;
        const current = zoomStateRef.current;
        apply(Math.max(current.scale, 1), false, current.minScale);
        const metrics = getViewportMetrics(container, topbarRef.current, overlaysRef.current);
        const appliedScale = getAppliedZoomScale(svg, current.scale);
        const point = getNodeLocatePoint(node);
        if (stage.layoutMode === "spatial") {
          setSpatialCamera(
            svg,
            metrics.safeLeft + metrics.availableWidth / 2 - point.x * appliedScale,
            metrics.safeTop + metrics.availableHeight / 2 - point.y * appliedScale,
          );
          return;
        }
        container.scrollLeft = Math.max(
          point.x * appliedScale + Number(svg.dataset.marginLeft || 0) - metrics.safeLeft - metrics.availableWidth / 2,
          0,
        );
        container.scrollTop = Math.max(
          point.y * appliedScale + Number(svg.dataset.marginTop || 0) - metrics.safeTop - metrics.availableHeight / 2,
          0,
        );
      },
      captureLayoutAnchor: (id: string) => {
        const point = stage && getItemOrigin(stage, id);
        const rect = svgRef.current?.getBoundingClientRect();
        if (stage && point && rect)
          layoutAnchorRef.current = {
            id,
            clientX: rect.left + (point.x * rect.width) / stage.stageWidth,
            clientY: rect.top + (point.y * rect.height) / stage.stageHeight,
          };
      },
      setZoomPercent: (percent: number) => {
        if (!Number.isFinite(percent) || percent <= 0) {
          return false;
        }
        apply(percent / 100, true);
        return true;
      },
      refresh,
    }),
    [apply, minScale, refresh, zoomBy, stage, containerRef, svgRef, topbarRef, overlaysRef],
  );
}
