export interface ViewportMetrics {
  safeLeft: number;
  safeTop: number;
  availableWidth: number;
  availableHeight: number;
}

interface ZoomPositionInput {
  width: number;
  height: number;
  scale: number;
  previousScale: number;
  metrics: ViewportMetrics;
  anchorX: number;
  anchorY: number;
  preserveAnchor: boolean;
}

/** Scroll-based canvases keep the same graph coordinate under the chosen screen anchor. */
export function calculateScrollZoom(input: ZoomPositionInput & {
  scrollLeft: number;
  scrollTop: number;
  previousMarginLeft: number;
  previousMarginTop: number;
}) {
  const { width, height, scale, previousScale, metrics, anchorX, anchorY, preserveAnchor } = input;
  const marginLeft = metrics.safeLeft + Math.max((metrics.availableWidth - width * scale) / 2, 0);
  const marginTop = metrics.safeTop + Math.max((metrics.availableHeight - height * scale) / 2, 0);
  const originX = preserveAnchor
    ? (input.scrollLeft + anchorX - input.previousMarginLeft) / previousScale
    : width / 2;
  const originY = preserveAnchor
    ? (input.scrollTop + anchorY - input.previousMarginTop) / previousScale
    : height / 2;
  return {
    marginLeft,
    marginTop,
    scrollLeft: Math.max(originX * scale + marginLeft - anchorX, 0),
    scrollTop: Math.max(originY * scale + marginTop - anchorY, 0),
  };
}

/** Spatial canvases use translation; unit changes preserve the same world coordinate. */
export function calculateSpatialCamera(input: ZoomPositionInput & {
  fitBounds?: { x: number; y: number; width: number; height: number };
  previousX: number;
  previousY: number;
  unitScale: number;
  previousUnitScale: number;
}) {
  const { width, height, scale, previousScale, metrics, anchorX, anchorY, preserveAnchor, fitBounds } = input;
  const centerX = fitBounds ? fitBounds.x + fitBounds.width / 2 : width / 2;
  const centerY = fitBounds ? fitBounds.y + fitBounds.height / 2 : height / 2;
  const unitRatio = input.unitScale / input.previousUnitScale;
  return {
    x: preserveAnchor
      ? anchorX - ((anchorX - input.previousX) / previousScale) * scale * unitRatio
      : metrics.safeLeft + metrics.availableWidth / 2 - centerX * scale,
    y: preserveAnchor
      ? anchorY - ((anchorY - input.previousY) / previousScale) * scale * unitRatio
      : metrics.safeTop + metrics.availableHeight / 2 - centerY * scale,
  };
}
