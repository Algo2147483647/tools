import { useMemo, useState } from "react";
import { defaultSpaceView, getSpaceMetadata, type SpaceView } from "../graph/space";
import type { NormalizedDag } from "../graph/types";

export function useSpatialView(dag: NormalizedDag | null, generation: number) {
  const metadata = dag ? getSpaceMetadata(dag) : null;
  const key = `${generation}:${JSON.stringify(metadata)}`;
  const defaults = useMemo(() => defaultSpaceView(metadata), [key]);
  const [saved, setSaved] = useState<{ key: string; view: SpaceView } | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const view = saved?.key === key ? saved.view : defaults;
  const change = (patch: Partial<SpaceView>) =>
    setSaved((previous) => ({ key, view: { ...(previous?.key === key ? previous.view : defaults), ...patch } }));
  const orbit = (dx: number, dy: number) =>
    setSaved((previous) => {
      const current = previous?.key === key ? previous.view : defaults;
      return {
        key,
        view: {
          ...current,
          yaw: ((((current.yaw + dx * 0.4 + 180) % 360) + 360) % 360) - 180,
          pitch: Math.max(-90, Math.min(90, current.pitch + dy * 0.4)),
        },
      };
    });
  return {
    metadata,
    view,
    change,
    orbit,
    resetVersion,
    reset: () => {
      setSaved(null);
      setResetVersion((version) => version + 1);
    },
  };
}
