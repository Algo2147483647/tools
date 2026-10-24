import { timelineBarBox } from "../layout/timeline/orientation";
import type { StageData, StageNode } from "../layout/shared/types";

// Complete production networks can be much wider/taller than a small diagram.
export const MIN_ZOOM_FLOOR = 0.001;
export const ZOOM_STEP_FACTOR = 1.15;
export interface ZoomAnchor {
  clientX: number;
  clientY: number;
}

export function getNodeLocatePoint(node: StageNode): { x: number; y: number } {
  if (node.timeline?.kind === "range" && node.timeline.intervalTitle !== "outside" && node.timeline.intervalTitle) {
    const box = timelineBarBox(node);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return node.timeline
    ? { x: node.timeline.labelX + node.width / 2, y: node.timeline.labelY }
    : { x: node.x, y: node.y };
}

export function getItemOrigin(stage: StageData, id: string) {
  const group = stage.groups?.find((item) => item.id === id);
  if (group) return { x: group.x, y: group.y };
  const node = stage.nodeMap[id];
  return node ? { x: node.x - node.width / 2, y: node.y - node.height / 2 } : null;
}

export function calculateFitZoomScale(
  viewportMetrics: { availableWidth: number; availableHeight: number },
  stage: StageData,
): number {
  const availableWidth = Math.max(viewportMetrics.availableWidth, 1);
  const availableHeight = Math.max(viewportMetrics.availableHeight, 1);
  const bounds = stage.spatial?.fitBounds;
  const fitScale = Math.min(
    availableWidth / (bounds?.width ?? stage.stageWidth),
    availableHeight / (bounds?.height ?? stage.stageHeight),
    bounds ? 2 : 1,
  );
  return Math.max(fitScale, MIN_ZOOM_FLOOR);
}

export function spatialMinScale(fit: number) {
  return Math.max(MIN_ZOOM_FLOOR, fit * 0.1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
