import type { Quaternion } from "../viewport/camera/quaternion";
import { isRecord } from "../shared/json";
import type { GraphDocument } from "./types";

export const SPACE_SYSTEMS = ["cartesian", "polar", "spherical", "cylindrical", "geographic"] as const;
export type SpaceSystem = (typeof SPACE_SYSTEMS)[number];
export interface SpaceMetadata {
  dimensions: number;
  coordinateSystem: SpaceSystem;
  angleUnit?: "degrees" | "radians";
  axes?: string[];
  unit?: string;
  radius?: number;
  /** Optional multi-category node field and corresponding edge metadata field. */
  typeField?: string;
  edgeTypeField?: string;
}
export interface SpaceView {
  axes: [number, number, number];
  projection: "orthographic" | "perspective" | "map";
  orientation: Quaternion;
  labels: boolean;
  grid: boolean;
  hideBackPoints: boolean;
  /** Coordinate spacing relative to the automatic layout, independent of camera zoom. */
  unitScale?: number;
}
export function spatialUnitScale(value = 1): number {
  return Number.isFinite(value) && value > 0 ? Math.max(0.1, Math.min(100, value)) : 1;
}
export function isSpatialDocument(dag: Pick<GraphDocument, "metadata">): boolean {
  return isRecord(dag.metadata?.space);
}
export function getSpaceMetadata(dag: Pick<GraphDocument, "metadata">): SpaceMetadata | null {
  return isSpatialDocument(dag) ? (dag.metadata!.space as unknown as SpaceMetadata) : null;
}
export function defaultSpaceView(metadata: SpaceMetadata | null): SpaceView {
  return {
    // A cyclic permutation preserves handedness: east (+Y) is screen-right,
    // north (+Z) is up, and the zero meridian (+X) faces the camera.
    // Swapping only Y/Z would reflect the globe instead of rotating it.
    axes: metadata && ["spherical", "geographic"].includes(metadata.coordinateSystem) ? [1, 2, 0] : [0, 1, 2],
    projection: "orthographic",
    orientation: [0, 0, 0, 1],
    labels: true,
    grid: true,
    hideBackPoints: false,
  };
}
export function validateSpaceMetadata(value: unknown): asserts value is SpaceMetadata {
  const path = "/metadata/space";
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  if (!Number.isSafeInteger(value.dimensions) || (value.dimensions as number) < 0)
    throw new Error(`${path}/dimensions must be a non-negative safe integer.`);
  if (!SPACE_SYSTEMS.includes(value.coordinateSystem as SpaceSystem))
    throw new Error(`${path}/coordinateSystem must be cartesian, polar, spherical, cylindrical or geographic.`);
  const minimum =
    value.coordinateSystem === "polar" || value.coordinateSystem === "geographic"
      ? 2
      : value.coordinateSystem === "cartesian"
        ? 0
        : 3;
  if ((value.dimensions as number) < minimum)
    throw new Error(`${path}: ${value.coordinateSystem} requires at least ${minimum} dimensions.`);
  if (value.angleUnit !== undefined && value.angleUnit !== "degrees" && value.angleUnit !== "radians")
    throw new Error(`${path}/angleUnit must be degrees or radians.`);
  if (
    value.axes !== undefined &&
    (!Array.isArray(value.axes) ||
      value.axes.length !== value.dimensions ||
      value.axes.some((axis) => typeof axis !== "string"))
  )
    throw new Error(`${path}/axes must contain one string per dimension.`);
  if (value.unit !== undefined && typeof value.unit !== "string") throw new Error(`${path}/unit must be a string.`);
  for (const field of ["typeField", "edgeTypeField"])
    if (value[field] !== undefined && (typeof value[field] !== "string" || !(value[field] as string).trim()))
      throw new Error(`${path}/${field} must be a non-empty field name.`);
  if (
    value.radius !== undefined &&
    (typeof value.radius !== "number" || !Number.isFinite(value.radius) || value.radius <= 0)
  )
    throw new Error(`${path}/radius must be positive and finite.`);
}
export function validateSpaceCoordinates(space: number[], metadata: SpaceMetadata, path: string): void {
  if (space.length !== metadata.dimensions)
    throw new Error(`${path} needs exactly ${metadata.dimensions} coordinates.`);
  const system = metadata.coordinateSystem;
  if (["polar", "spherical", "cylindrical"].includes(system) && space[0] < 0)
    throw new Error(`${path}: radius must be non-negative.`);
  const latitude = system === "geographic" ? space[1] : system === "spherical" ? space[2] : 0;
  if (Math.abs(latitude) > (metadata.angleUnit === "radians" ? Math.PI / 2 : 90))
    throw new Error(`${path}: latitude/elevation is outside its valid range.`);
  if (system === "geographic" && space.length >= 3 && space[2] <= -(metadata.radius ?? 6371))
    throw new Error(`${path}: altitude must be above the sphere center.`);
}
/** Convert only the coordinate-system prefix; extra dimensions remain available for projection. */
export function spaceToCartesian(space: readonly number[], metadata: SpaceMetadata): number[] {
  const v = [...space];
  const angle = metadata.angleUnit === "radians" ? 1 : Math.PI / 180;
  if (metadata.coordinateSystem === "polar" || metadata.coordinateSystem === "cylindrical") {
    v[0] = space[0] * Math.cos(space[1] * angle);
    v[1] = space[0] * Math.sin(space[1] * angle);
  } else if (metadata.coordinateSystem === "spherical" || metadata.coordinateSystem === "geographic") {
    const geo = metadata.coordinateSystem === "geographic";
    const r = geo ? (metadata.radius ?? 6371) + (space[2] ?? 0) : space[0];
    const lon = space[geo ? 0 : 1] * angle;
    const lat = space[geo ? 1 : 2] * angle;
    v[0] = r * Math.cos(lat) * Math.cos(lon);
    v[1] = r * Math.cos(lat) * Math.sin(lon);
    v[2] = r * Math.sin(lat);
  }
  return v;
}
export function spaceMapPoint(space: readonly number[], metadata: SpaceMetadata): [number, number] {
  const geo = metadata.coordinateSystem === "geographic";
  const degrees = metadata.angleUnit === "radians" ? 180 / Math.PI : 1;
  const lon = space[geo ? 0 : 1] * degrees;
  return [((((lon + 180) % 360) + 360) % 360) - 180, space[geo ? 1 : 2] * degrees];
}
