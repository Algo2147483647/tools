import type { StageData } from "../layout/shared/types";
import { calculateScrollZoom, calculateSpatialCamera, type ViewportMetrics } from "./cameraGeometry";
import { calculateFitZoomScale, type ZoomAnchor } from "./zoomGeometry";

export function getFitZoomScale(container: HTMLElement, stage: StageData, overlays: HTMLElement | null = null): number {
  return calculateFitZoomScale(getViewportMetrics(container, overlays), stage);
}

export interface CameraState {
  scale: number;
  x: number;
  y: number;
  marginLeft: number;
  marginTop: number;
  unitScale: number;
}
export const initialCamera = (): CameraState => ({ scale: 1, x: 0, y: 0, marginLeft: 0, marginTop: 0, unitScale: 1 });

export function applyGraphZoom(
  container: HTMLElement,
  svg: SVGSVGElement,
  stage: StageData,
  camera: CameraState,
  scale: number,
  preserveCenter: boolean,
  anchor?: ZoomAnchor,
  overlays: HTMLElement | null = null,
): CameraState {
  const previousScale = camera.scale;
  const previousMarginLeft = camera.marginLeft;
  const previousMarginTop = camera.marginTop;
  const viewportMetrics = getViewportMetrics(container, overlays);
  const containerRect = container.getBoundingClientRect();
  const scaledWidth = stage.stageWidth * scale;
  const scaledHeight = stage.stageHeight * scale;
  const anchorOffsetX = anchor
    ? anchor.clientX - containerRect.left
    : viewportMetrics.safeLeft + viewportMetrics.availableWidth / 2;
  const anchorOffsetY = anchor
    ? anchor.clientY - containerRect.top
    : viewportMetrics.safeTop + viewportMetrics.availableHeight / 2;
  const positionInput = {
    width: stage.stageWidth,
    height: stage.stageHeight,
    scale,
    previousScale,
    metrics: viewportMetrics,
    anchorX: anchorOffsetX,
    anchorY: anchorOffsetY,
    preserveAnchor: preserveCenter || Boolean(anchor),
  };
  if (stage.layoutMode === "spatial") {
    const unitScale = stage.spatial?.unitScale ?? 1;
    const { x, y } = calculateSpatialCamera({
      ...positionInput,
      fitBounds: stage.spatial?.fitBounds,
      previousX: camera.x,
      previousY: camera.y,
      unitScale,
      previousUnitScale: camera.unitScale,
    });
    svg.style.width = `${scaledWidth}px`;
    svg.style.height = `${scaledHeight}px`;
    svg.style.marginLeft = svg.style.marginTop = "0px";
    svg.dataset.zoomScale = String(scale);
    svg.dataset.spatialUnitScale = String(unitScale);
    svg.dataset.marginLeft = svg.dataset.marginTop = "0";
    container.scrollLeft = container.scrollTop = 0;
    setSpatialCamera(svg, x, y);
    return { scale, x, y, marginLeft: 0, marginTop: 0, unitScale };
  }
  svg.style.transform = "";
  delete svg.dataset.cameraX;
  delete svg.dataset.cameraY;
  delete svg.dataset.spatialUnitScale;
  const { marginLeft, marginTop, scrollLeft, scrollTop } = calculateScrollZoom({
    ...positionInput,
    scrollLeft: camera.x,
    scrollTop: camera.y,
    previousMarginLeft,
    previousMarginTop,
  });

  svg.style.width = `${scaledWidth}px`;
  svg.style.height = `${scaledHeight}px`;
  svg.style.marginLeft = `${marginLeft}px`;
  svg.style.marginTop = `${marginTop}px`;
  svg.dataset.zoomScale = String(scale);
  svg.dataset.marginLeft = String(marginLeft);
  svg.dataset.marginTop = String(marginTop);

  container.scrollLeft = scrollLeft;
  container.scrollTop = scrollTop;
  return { scale, x: container.scrollLeft, y: container.scrollTop, marginLeft, marginTop, unitScale: 1 };
}

export function setSpatialCamera(svg: SVGSVGElement, x: number, y: number) {
  svg.dataset.cameraX = String(x);
  svg.dataset.cameraY = String(y);
  svg.style.transform = `translate(${x}px, ${y}px)`;
}

export function getViewportMetrics(container: HTMLElement, overlays: HTMLElement | null = null): ViewportMetrics {
  const { containerRect, overlayRect } = readViewportBounds(container, overlays);
  const safeTop = 16;
  const horizontalInset = 24;
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

export function readViewportBounds(container: HTMLElement, overlays: HTMLElement | null) {
  return {
    containerRect: container.getBoundingClientRect(),
    overlayRect: overlays?.getBoundingClientRect() ?? null,
  };
}
