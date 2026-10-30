import { useMemo, useSyncExternalStore } from "react";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import type { GraphChartType } from "../../graph/types";
import { getRoleFont, type TextFont } from "../../layout/shared/typography";
import { measureText } from "../../layout/shared/text-measurement";

/** Snapshot actual glyph metrics of graph fonts. Unrelated shell fonts cannot invalidate layout. */
export function useFontMetricsKey(appearance: GraphAppearance, chart: GraphChartType, text: string) {
  const roles =
    chart === "spatial"
      ? []
      : chart === "timeline"
        ? (["title", "detail", "date", "axis", "track"] as const)
        : (["title", "detail"] as const);
  const fonts: TextFont[] = roles.map((role) => getRoleFont(appearance, role));
  if (chart === "compound")
    fonts.push(
      { family: '"Segoe UI", sans-serif', weight: "600", size: 14, style: "normal" },
      { family: "Arial, sans-serif", weight: "400", size: 10, style: "normal" },
    );
  const signature = JSON.stringify(fonts);
  const store = useMemo(() => {
    const selected = JSON.parse(signature) as TextFont[];
    const glyphs = [...new Set(Array.from(text))];
    let value: string | undefined;
    const measure = () => selected.map((font) => glyphs.map((g) => measureText(g, font)).join(",")).join("|");
    const families = new Set(
      selected.flatMap((font) => font.family.split(",").map((f) => f.trim().replace(/["']/g, "").toLowerCase())),
    );
    return {
      snapshot: () => (value ??= measure()),
      subscribe: (notify: () => void) => {
        const changed = (event: Event) => {
          const faces = (event as FontFaceSetLoadEvent).fontfaces;
          if (faces?.length && !faces.some((font) => families.has(font.family.replace(/["']/g, "").toLowerCase())))
            return;
          const next = measure();
          if (next !== value) {
            value = next;
            notify();
          }
        };
        document.fonts.addEventListener("loadingdone", changed);
        document.fonts.addEventListener("loadingerror", changed);
        return () => {
          document.fonts.removeEventListener("loadingdone", changed);
          document.fonts.removeEventListener("loadingerror", changed);
        };
      },
    };
  }, [signature, text]);
  return useSyncExternalStore(store.subscribe, store.snapshot, () => "");
}
