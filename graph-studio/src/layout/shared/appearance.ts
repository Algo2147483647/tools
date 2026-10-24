import type { GraphAppearance, GraphGeometryAppearance } from "../../graph/appearance";
import type { GraphChartType } from "../../graph/types";
import { DEFAULT_TITLE_FONT, getRoleFont, getTitleFont, type TextFont } from "./typography";
// Only geometry inputs belong in layout memoization; colors and CSS are rendered separately.
export interface StageAppearance extends GraphGeometryAppearance {
  typography?: TextFont;
  fonts?: Record<"detail" | "date" | "axis" | "track", TextFont>;
  palette?: GraphAppearance["palette"];
  fontMetricsKey?: string;
  display: Partial<
    Pick<GraphAppearance["display"], "showGroupStats" | "titleAlign" | "titleOverflow" | "titleWrap" | "showNodeDots">
  >;
}
export function getStageAppearance(
  appearance: GraphAppearance,
  chartType?: GraphChartType,
  fontMetricsKey?: string,
): StageAppearance {
  return {
    canvas: appearance.canvas,
    nodes: appearance.nodes,
    edges: appearance.edges,
    typography: getTitleFont(appearance),
    fonts: Object.fromEntries(
      (["detail", "date", "axis", "track"] as const).map((role) => [role, getRoleFont(appearance, role)]),
    ) as StageAppearance["fonts"],
    palette: appearance.palette,
    ...(fontMetricsKey ? { fontMetricsKey } : {}),
    display: {
      ...(chartType === undefined || chartType === "compound"
        ? {
            showGroupStats: appearance.display.showGroupStats,
            titleAlign: appearance.display.titleAlign,
            titleOverflow: appearance.display.titleOverflow,
            titleWrap: appearance.display.titleWrap,
            showNodeDots: appearance.display.showNodeDots,
          }
        : {}),
    },
  };
}

export function stageTitleFont(appearance: StageAppearance): TextFont {
  return (
    appearance.typography ??
    ("cssVars" in appearance ? getTitleFont(appearance as GraphAppearance) : DEFAULT_TITLE_FONT)
  );
}

export function stageRoleFont(appearance: StageAppearance, role: "detail" | "date" | "axis" | "track"): TextFont {
  return (
    appearance.fonts?.[role] ??
    getRoleFont("cssVars" in appearance ? (appearance as GraphAppearance) : { cssVars: {} }, role)
  );
}
