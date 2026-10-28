import { useLayoutEffect, useState, type RefObject } from "react";
import type { StageData } from "../layout/shared/types";
import { readViewportBounds } from "./viewportDom";
export interface ViewportChromeRefs {
  overlaysRef?: RefObject<HTMLElement>;
}
export function useTimelineRulerViewport(
  stage: StageData,
  svgRef: RefObject<SVGSVGElement>,
  { overlaysRef }: ViewportChromeRefs,
) {
  const timeline = stage.timeline!;
  const [viewport, setViewport] = useState({
    scale: 1,
    x: timeline.axisX,
    top: 16,
    bottom: stage.stageHeight,
    width: stage.stageWidth,
    left: 0,
    right: stage.stageWidth,
  });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!svg || !container) return;
    let frame = 0;
    function measure() {
      frame = 0;
      if (!svg || !container) return;
      const rect = svg.getBoundingClientRect();
      const { containerRect: box, overlayRect: overlays } = readViewportBounds(container, overlaysRef?.current ?? null);
      const viewBox = svg.viewBox.baseVal;
      const scale = rect.width / (viewBox.width || stage.stageWidth) || 1;
      const safeLeft =
        overlays && overlays.width > 0 && overlays.width < box.width * 0.75
          ? Math.max(box.left, overlays.right + 6)
          : box.left;
      const safeTop = box.top + 4;
      setViewport({
        scale,
        x: Math.max(timeline.axisX, viewBox.x + (safeLeft - rect.left + 100) / scale),
        top: Math.max(16, viewBox.y + (safeTop - rect.top) / scale),
        bottom: Math.min(stage.stageHeight, viewBox.y + (box.bottom - rect.top) / scale),
        width: box.width / scale,
        left: Math.max(0, viewBox.x + (safeLeft - rect.left) / scale),
        right: Math.min(stage.stageWidth, viewBox.x + (box.right - rect.left) / scale),
      });
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(svg);
    observer.observe(container);
    const overlays = overlaysRef?.current;
    if (overlays) observer.observe(overlays);
    container.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("scroll", schedule);
    };
  }, [stage, svgRef, timeline.axisX, overlaysRef]);

  return viewport;
}
