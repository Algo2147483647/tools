import { getSpaceMetadata, spaceToCartesian, type SpaceView } from "../../graph/space";
import type { NormalizedDag } from "../../graph/types";

export function prepareSpatialModel(source: NormalizedDag, axes: SpaceView["axes"]) {
  const metadata = getSpaceMetadata(source);
  const sphere = !!metadata && ["spherical", "geographic"].includes(metadata.coordinateSystem);
  const view = { axes };
  const valid = Object.values(source.nodes).filter(
    (n) => metadata && Array.isArray(n.space) && n.space.length === metadata.dimensions,
  );
  const converted = new Map(valid.map((n) => [n.key, spaceToCartesian(n.space as number[], metadata!)]));
  let coordinateScale = 0;
  converted.forEach((v) =>
    view.axes.forEach((axis) => {
      coordinateScale = Math.max(coordinateScale, Math.abs(v[axis] ?? 0));
    }),
  );
  coordinateScale ||= 1;
  const selected = (v: number[]): [number, number, number] =>
    view.axes.map((axis) => (v[axis] ?? 0) / coordinateScale) as [number, number, number];
  const center = [0, 0, 0];
  let extent = 1;
  if (sphere) {
    extent = 0;
    converted.forEach((v) => {
      extent = Math.max(extent, Math.hypot(...selected(v)));
    });
    extent ||= 1;
  } else if (valid.length) {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    converted.forEach((v) =>
      selected(v).forEach((x, i) => {
        min[i] = Math.min(min[i], x);
        max[i] = Math.max(max[i], x);
      }),
    );
    center.forEach((_, i) => {
      center[i] = min[i] / 2 + max[i] / 2;
    });
    extent = 0;
    converted.forEach((v) => {
      extent = Math.max(extent, Math.hypot(...selected(v).map((x, i) => x - center[i])));
    });
    extent ||= 1;
  }
  return { source, metadata, sphere, valid, converted, coordinateScale, selected, center, extent };
}
export type SpatialModel = ReturnType<typeof prepareSpatialModel>;
