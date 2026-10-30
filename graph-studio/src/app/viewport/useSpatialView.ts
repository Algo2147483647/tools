import { readSpatialView, saveSpatialView } from "../../viewport/camera/spatialStorage";
import { composeOrientation, normalizeOrientation, type Quaternion } from "../../viewport/camera/quaternion";
import { useEffect, useMemo, useState } from "react";
import { defaultSpaceView, getSpaceMetadata, type SpaceView } from "../../graph/space";
import type { NormalizedDag } from "../../graph/types";

export function useSpatialView(dag: NormalizedDag | null, generation: number, identity: string, initial?: SpaceView) {
  const metadata = dag ? getSpaceMetadata(dag) : null;
  const key = `${generation}:${identity}:${JSON.stringify(metadata)}`;
  const defaults = useMemo(() => {
    const fallback = defaultSpaceView(metadata);
    const stored = initial ?? readSpatialView(identity);
    if (!stored) return fallback;
    const dimensions = Math.max(3, metadata?.dimensions ?? 3);
    const sphere = metadata && ["spherical", "geographic"].includes(metadata.coordinateSystem);
    return {
      ...stored,
      axes: stored.axes.every((axis) => axis < dimensions) ? stored.axes : fallback.axes,
      projection: stored.projection === "map" && !sphere ? fallback.projection : stored.projection,
    };
  }, [key]);
  const [saved, setSaved] = useState<{ key: string; view: SpaceView } | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const view = saved?.key === key ? saved.view : defaults;
  useEffect(() => {
    if (!dag) return;
    const timer = setTimeout(() => saveSpatialView(identity, view), 150);
    return () => clearTimeout(timer);
  }, [identity, view, dag]);
  const change = (patch: Partial<SpaceView>) =>
    setSaved((previous) => ({
      key,
      view: {
        ...(previous?.key === key ? previous.view : defaults),
        ...patch,
        ...(patch.orientation ? { orientation: normalizeOrientation(patch.orientation) } : {}),
      },
    }));
  const orbit = (rotation: Quaternion) =>
    setSaved((previous) => {
      const current = previous?.key === key ? previous.view : defaults;
      return { key, view: { ...current, orientation: composeOrientation(rotation, current.orientation) } };
    });
  return {
    metadata,
    view,
    change,
    orbit,
    resetVersion,
    reset: () => {
      setSaved({ key, view: defaultSpaceView(metadata) });
      setResetVersion((version) => version + 1);
    },
  };
}
