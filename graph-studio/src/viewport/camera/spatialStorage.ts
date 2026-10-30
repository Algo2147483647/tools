import type { SpaceView } from "../../graph/space";
import { normalizeOrientation } from "./quaternion";

export function readSpatialView(identity: string): SpaceView | null {
  try {
    const value = JSON.parse(localStorage.getItem(`graph-studio.spatial-view.v1:${identity}`) ?? "null");
    if (
      !value ||
      !Array.isArray(value.axes) ||
      value.axes.length !== 3 ||
      new Set(value.axes).size !== 3 ||
      !value.axes.every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0) ||
      !["orthographic", "perspective", "map"].includes(value.projection) ||
      [value.labels, value.grid, value.hideBackPoints].some((v) => typeof v !== "boolean") ||
      (value.unitScale !== undefined &&
        (!Number.isFinite(value.unitScale) || value.unitScale < 0.1 || value.unitScale > 100))
    )
      return null;
    return {
      axes: value.axes,
      projection: value.projection,
      orientation: normalizeOrientation(value.orientation),
      labels: value.labels,
      grid: value.grid,
      hideBackPoints: value.hideBackPoints,
      unitScale: value.unitScale,
    };
  } catch {
    return null;
  }
}
export function saveSpatialView(identity: string, view: SpaceView) {
  try {
    localStorage.setItem(`graph-studio.spatial-view.v1:${identity}`, JSON.stringify(view));
  } catch {
    /* Optional browser persistence. */
  }
}
