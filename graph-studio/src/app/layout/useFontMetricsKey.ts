import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  document.fonts.addEventListener("loadingdone", onChange);
  document.fonts.addEventListener("loadingerror", onChange);
  return () => {
    document.fonts.removeEventListener("loadingdone", onChange);
    document.fonts.removeEventListener("loadingerror", onChange);
  };
}

function snapshot() {
  const loaded: string[] = [];
  document.fonts.forEach((font) => {
    if (font.status === "loaded") loaded.push(`${font.family}:${font.weight}:${font.style}`);
  });
  return loaded.sort().join("|");
}

/** A web font replacing its fallback must also invalidate cached text geometry. */
export function useFontMetricsKey() {
  return useSyncExternalStore(subscribe, snapshot, () => "");
}
