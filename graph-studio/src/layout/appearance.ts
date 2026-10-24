import type { GraphChartType } from "../graph/types";
import type { GraphAppearance, GraphLayoutAppearance } from "../graph/appearance";
import { getRoleFont, getTitleFont, DEFAULT_TITLE_FONT, type TextFont } from "./typography";
// Only geometry inputs belong in layout memoization; colors and CSS are rendered separately.
export interface StageAppearance {
  layout: GraphLayoutAppearance;
  typography?: TextFont;
  fonts?: Record<"detail" | "date" | "axis" | "track", TextFont>;
  palette?: GraphAppearance["palette"];
  fontMetricsKey?: string;
  display: Pick<GraphAppearance["display"], "sankeyNodeWidth"> &
    Partial<
      Pick<GraphAppearance["display"], "showGroupStats" | "titleAlign" | "titleOverflow" | "titleWrap" | "showNodeDots">
    >;
}
export function getStageAppearance(
  appearance: GraphAppearance,
  chartType?: GraphChartType,
  fontMetricsKey?: string,
): StageAppearance {
  return {
    layout: appearance.layout,
    typography: getTitleFont(appearance),
    fonts: Object.fromEntries(
      (["detail", "date", "axis", "track"] as const).map((role) => [role, getRoleFont(appearance, role)]),
    ) as StageAppearance["fonts"],
    palette: appearance.palette,
    ...(fontMetricsKey ? { fontMetricsKey } : {}),
    display: {
      sankeyNodeWidth: appearance.display.sankeyNodeWidth,
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
