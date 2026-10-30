import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { StageData } from "../layout/shared/types";
import { useWheelZoom } from "./useWheelZoom";
import { applyGraphZoom, getFitZoomScale, getViewportMetrics, setSpatialCamera, initialCamera } from "./viewportDom";
import {
  clamp,
  getItemOrigin,
  getNodeLocatePoint,
  spatialMinScale,
  ZOOM_STEP_FACTOR,
  type ZoomAnchor,
} from "./zoomGeometry";
import { readCamera, saveCamera } from "./camera/storage";

interface UseGraphZoomInput {
  containerRef: React.RefObject<HTMLElement>;
  svgRef: React.RefObject<SVGSVGElement>;
  overlaysRef: React.RefObject<HTMLElement>;
  stage: StageData | null;
  viewKey: string;
  scale: number;
  minScale: number;
  maxScale: number;
  onZoomChange(scale: number, minScale?: number): void;
}

export function useGraphZoom(input: UseGraphZoomInput) {
  const current = useRef(input);
  current.current = input;
  const camera = useRef(initialCamera());
  const bounds = useRef({ min: input.minScale, max: input.maxScale });
  bounds.current.max = input.maxScale;
  const installed = useRef<{ key: string; mode: string } | null>(null);
  const anchor = useRef<{ id: string; clientX: number; clientY: number } | null>(null);
  const remember = useCallback(() => {
    if (installed.current) saveCamera(installed.current.key, camera.current);
  }, []);
  const apply = useCallback(
    (scale: number, preserve: boolean, minimum?: number, zoomAnchor?: ZoomAnchor) => {
      const { containerRef, svgRef, overlaysRef, stage, onZoomChange } = current.current;
      const container = containerRef.current,
        svg = svgRef.current;
      if (!container || !svg || !stage) return;
      const min = minimum ?? bounds.current.min;
      camera.current = applyGraphZoom(
        container,
        svg,
        stage,
        camera.current,
        clamp(scale, min, bounds.current.max),
        preserve,
        zoomAnchor,
        overlaysRef.current,
      );
      bounds.current.min = min;
      if (
        Math.abs(current.current.scale - camera.current.scale) > 1e-6 ||
        Math.abs(current.current.minScale - min) > 1e-6
      )
        onZoomChange(camera.current.scale, min);
      remember();
    },
    [remember],
  );
  const refresh = useCallback(
    (preserve = true) => {
      const { containerRef, overlaysRef, stage } = current.current;
      if (!containerRef.current || !stage) return;
      const fit = getFitZoomScale(containerRef.current, stage, overlaysRef.current);
      const min =
        stage.layoutMode === "spatial" ? spatialMinScale(fit) : preserve ? Math.min(fit, camera.current.scale) : fit;
      apply(preserve ? camera.current.scale : fit, preserve, min);
    },
    [apply],
  );
  const zoomBy = useCallback(
    (factor: number, zoomAnchor?: ZoomAnchor) => {
      if (Number.isFinite(factor) && factor > 0)
        apply(camera.current.scale * factor, !zoomAnchor, undefined, zoomAnchor);
    },
    [apply],
  );
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const { containerRef, svgRef, stage } = current.current;
      if (!containerRef.current || !svgRef.current || !stage) return;
      if (stage.layoutMode === "spatial") {
        camera.current = { ...camera.current, x: camera.current.x + dx, y: camera.current.y + dy };
        setSpatialCamera(svgRef.current, camera.current.x, camera.current.y);
      } else {
        containerRef.current.scrollLeft -= dx;
        containerRef.current.scrollTop -= dy;
        camera.current = { ...camera.current, x: containerRef.current.scrollLeft, y: containerRef.current.scrollTop };
      }
      remember();
    },
    [remember],
  );

  useLayoutEffect(() => {
    const { stage, viewKey, containerRef, svgRef } = input;
    // Pending work and temporary canvas removal never erase the last camera.
    if (!stage || !containerRef.current || !svgRef.current) return;
    const same = installed.current?.key === viewKey && installed.current.mode === stage.layoutMode;
    if (!same) {
      remember();
      const saved = readCamera(viewKey);
      camera.current = saved ?? initialCamera();
      installed.current = { key: viewKey, mode: stage.layoutMode };
      refresh(!!saved);
      if (!saved && stage.layoutMode === "timeline") {
        apply(Math.max(bounds.current.min, 0.85), false);
        containerRef.current.scrollLeft = containerRef.current.scrollTop = 0;
        camera.current = { ...camera.current, x: 0, y: 0 };
      }
    } else refresh(true);
    const point = anchor.current && getItemOrigin(stage, anchor.current.id);
    if (same && point && anchor.current) {
      const rect = svgRef.current.getBoundingClientRect();
      panBy(
        anchor.current.clientX - rect.left - (point.x * rect.width) / stage.stageWidth,
        anchor.current.clientY - rect.top - (point.y * rect.height) / stage.stageHeight,
      );
    }
    anchor.current = null;
    remember();
  }, [input.stage, input.viewKey, refresh, apply, panBy, remember]);

  // One observer owns all viewport dimensions; unrelated renders never resubscribe it.
  const hasStage = !!input.stage;
  useEffect(() => {
    const { containerRef, overlaysRef } = current.current;
    const container = containerRef.current;
    if (!container) return;
    let signature = JSON.stringify(getViewportMetrics(container, overlaysRef.current));
    const resized = () => {
      const next = JSON.stringify(getViewportMetrics(container, overlaysRef.current));
      if (next !== signature) {
        signature = next;
        refresh(true);
      }
    };
    const scrolled = () => {
      if (current.current.stage?.layoutMode === "spatial" || !current.current.stage) return;
      camera.current = { ...camera.current, x: container.scrollLeft, y: container.scrollTop };
      remember();
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resized) : null;
    observer?.observe(container);
    if (overlaysRef.current) observer?.observe(overlaysRef.current);
    window.addEventListener("resize", resized);
    container.addEventListener("scroll", scrolled);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resized);
      container.removeEventListener("scroll", scrolled);
    };
  }, [hasStage, refresh, remember]);
  useWheelZoom(input.containerRef, input.stage, zoomBy);
  return {
    zoomBy,
    panBy,
    refresh,
    zoomIn: () => zoomBy(ZOOM_STEP_FACTOR),
    zoomOut: () => zoomBy(1 / ZOOM_STEP_FACTOR),
    zoomFit: () => refresh(false),
    locateNode: (id: string) => {
      const { stage, containerRef, svgRef, overlaysRef } = current.current;
      const node = stage?.nodeMap[id],
        container = containerRef.current,
        svg = svgRef.current;
      if (!node || !stage || !container || !svg) return;
      apply(Math.max(camera.current.scale, 1), true);
      const metrics = getViewportMetrics(container, overlaysRef.current),
        p = getNodeLocatePoint(node),
        c = camera.current;
      if (stage.layoutMode === "spatial")
        panBy(
          metrics.safeLeft + metrics.availableWidth / 2 - p.x * c.scale - c.x,
          metrics.safeTop + metrics.availableHeight / 2 - p.y * c.scale - c.y,
        );
      else
        panBy(
          c.x - (p.x * c.scale + c.marginLeft - metrics.safeLeft - metrics.availableWidth / 2),
          c.y - (p.y * c.scale + c.marginTop - metrics.safeTop - metrics.availableHeight / 2),
        );
    },
    captureLayoutAnchor: (id: string) => {
      const { stage, svgRef } = current.current;
      const point = stage && getItemOrigin(stage, id),
        rect = svgRef.current?.getBoundingClientRect();
      if (stage && point && rect)
        anchor.current = {
          id,
          clientX: rect.left + (point.x * rect.width) / stage.stageWidth,
          clientY: rect.top + (point.y * rect.height) / stage.stageHeight,
        };
    },
    setZoomPercent: (percent: number) => {
      if (!Number.isFinite(percent) || percent <= 0) return false;
      apply(percent / 100, true);
      return true;
    },
  };
}
