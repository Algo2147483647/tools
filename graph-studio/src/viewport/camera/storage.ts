import type { CameraState } from "../viewportDom";
const STORAGE_KEY = "graph-studio.cameras.v1";
let loaded = false;
const entries = new Map<string, CameraState>();
let timer: ReturnType<typeof setTimeout> | undefined;
export function readCamera(key: string): CameraState | null {
  if (!loaded) {
    loaded = true;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved))
        for (const [id, value] of saved) {
          if (
            typeof id === "string" &&
            value &&
            [value.scale, value.x, value.y, value.marginLeft, value.marginTop, value.unitScale].every(
              (v) => typeof v === "number" && Number.isFinite(v),
            ) &&
            value.scale > 0 &&
            value.unitScale > 0
          )
            entries.set(id, value);
        }
    } catch {
      /* Browser storage is optional. */
    }
  }
  const camera = entries.get(key);
  return camera ? { ...camera } : null;
}
export function saveCamera(key: string, value: CameraState) {
  entries.delete(key);
  entries.set(key, { ...value });
  while (entries.size > 80) entries.delete(entries.keys().next().value!);
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries]));
    } catch {
      /* Quota or private mode. */
    }
  }, 150);
}
