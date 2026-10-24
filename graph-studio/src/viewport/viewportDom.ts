import type { StageData } from "../layout/shared/types";
import { calculateFitZoomScale, type ZoomAnchor } from "./zoomGeometry";

export function getFitZoomScale(container: HTMLElement, topbar: HTMLElement | null, stage: StageData): number {
  return calculateFitZoomScale(getViewportMetrics(container, topbar), stage);
}

export function applyGraphZoom(
  container: HTMLElement,
  svg: SVGSVGElement,
  topbar: HTMLElement | null,
  stage: StageData,
  scale: number,
  preserveCenter: boolean,
  anchor?: ZoomAnchor,
): void {
  const previousScale = Number(svg.dataset.zoomScale || 1);
  const previousMarginLeft = Number(svg.dataset.marginLeft || 0);
  const previousMarginTop = Number(svg.dataset.marginTop || 0);
  const viewportMetrics = getViewportMetrics(container, topbar);
  const containerRect = container.getBoundingClientRect();
  const scaledWidth = stage.stageWidth * scale;
  const scaledHeight = stage.stageHeight * scale;
  const marginLeft = viewportMetrics.safeLeft + Math.max((viewportMetrics.availableWidth - scaledWidth) / 2, 0);
  const marginTop = viewportMetrics.safeTop + Math.max((viewportMetrics.availableHeight - scaledHeight) / 2, 0);
  const anchorOffsetX = anchor
    ? anchor.clientX - containerRect.left
    : viewportMetrics.safeLeft + viewportMetrics.availableWidth / 2;
  const anchorOffsetY = anchor
    ? anchor.clientY - containerRect.top
    : viewportMetrics.safeTop + viewportMetrics.availableHeight / 2;
  if (stage.layoutMode === "spatial") {
    const bounds = stage.spatial?.fitBounds;
    const centerX = bounds ? bounds.x + bounds.width / 2 : stage.stageWidth / 2;
    const centerY = bounds ? bounds.y + bounds.height / 2 : stage.stageHeight / 2;
    const previousX = Number(svg.dataset.cameraX || 0);
    const previousY = Number(svg.dataset.cameraY || 0);
    // Keep the same coordinate under the viewport center when display units change.
    const unitScale = stage.spatial?.unitScale ?? 1;
    const unitRatio = unitScale / Number(svg.dataset.spatialUnitScale || unitScale);
    const x =
      preserveCenter || anchor
        ? anchorOffsetX - ((anchorOffsetX - previousX) / previousScale) * scale * unitRatio
        : viewportMetrics.safeLeft + viewportMetrics.availableWidth / 2 - centerX * scale;
    const y =
      preserveCenter || anchor
        ? anchorOffsetY - ((anchorOffsetY - previousY) / previousScale) * scale * unitRatio
        : viewportMetrics.safeTop + viewportMetrics.availableHeight / 2 - centerY * scale;
    svg.style.width = `${scaledWidth}px`;
    svg.style.height = `${scaledHeight}px`;
    svg.style.marginLeft = svg.style.marginTop = "0px";
    svg.dataset.zoomScale = String(scale);
    svg.dataset.spatialUnitScale = String(unitScale);
    svg.dataset.marginLeft = svg.dataset.marginTop = "0";
    container.scrollLeft = container.scrollTop = 0;
    setSpatialCamera(svg, x, y);
    return;
  }
  svg.style.transform = "";
  delete svg.dataset.cameraX;
  delete svg.dataset.cameraY;
  delete svg.dataset.spatialUnitScale;
  const zoomOriginX =
    preserveCenter || anchor
      ? (container.scrollLeft + anchorOffsetX - previousMarginLeft) / previousScale
      : stage.stageWidth / 2;
  const zoomOriginY =
    preserveCenter || anchor
      ? (container.scrollTop + anchorOffsetY - previousMarginTop) / previousScale
      : stage.stageHeight / 2;

  svg.style.width = `${scaledWidth}px`;
  svg.style.height = `${scaledHeight}px`;
  svg.style.marginLeft = `${marginLeft}px`;
  svg.style.marginTop = `${marginTop}px`;
  svg.dataset.zoomScale = String(scale);
  svg.dataset.marginLeft = String(marginLeft);
  svg.dataset.marginTop = String(marginTop);

  container.scrollLeft = Math.max(zoomOriginX * scale + marginLeft - anchorOffsetX, 0);
  container.scrollTop = Math.max(zoomOriginY * scale + marginTop - anchorOffsetY, 0);
}

export function setSpatialCamera(svg: SVGSVGElement, x: number, y: number) {
  svg.dataset.cameraX = String(x);
  svg.dataset.cameraY = String(y);
  svg.style.transform = `translate(${x}px, ${y}px)`;
}

export function getAppliedZoomScale(svg: SVGSVGElement | null, fallbackScale: number): number {
  if (!svg) {
    return fallbackScale;
  }
  const appliedScale = Number(svg.dataset.zoomScale);
  return Number.isFinite(appliedScale) && appliedScale > 0 ? appliedScale : fallbackScale;
}

export function getViewportMetrics(container: HTMLElement, topbar: HTMLElement | null) {
  const containerRect = container.getBoundingClientRect();
  const topbarRect = topbar ? topbar.getBoundingClientRect() : null;
  const safeTop = topbarRect ? Math.max(topbarRect.bottom - containerRect.top + 12, 0) : 0;
  const horizontalInset = 24;
  const overlays = container.closest(".workspace")?.querySelector(".workspace-overlays");
  const overlayRect = overlays?.getBoundingClientRect();
  // Fit into the visible area; the scrollable canvas itself still fills the page.
  const safeLeft =
    overlayRect && overlayRect.width > 0 && overlayRect.width < container.clientWidth * 0.75
      ? Math.max(horizontalInset, overlayRect.right - containerRect.left + 16)
      : horizontalInset;
  const bottomInset = 16;
  return {
    safeTop,
    safeLeft,
    availableWidth: container.clientWidth - safeLeft - horizontalInset,
    availableHeight: container.clientHeight - safeTop - bottomInset,
  };
}
