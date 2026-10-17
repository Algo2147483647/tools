import type { GraphChartType } from "../graph/types";
import type { GraphAppearance, GraphLayoutAppearance } from "../graph/appearance";
import { getTitleFont, DEFAULT_TITLE_FONT, type TextFont } from "./typography";
// Only geometry inputs belong in layout memoization; colors and CSS are rendered separately.
export interface StageAppearance {
  layout: GraphLayoutAppearance;
  typography?: TextFont;
  fontMetricsKey?: string;
  display: Pick<GraphAppearance["display"], "sankeyNodeWidth"> &
    Partial<Pick<GraphAppearance["display"], "showGroupStats">>;
}
export function getStageAppearance(
  appearance: GraphAppearance,
  chartType?: GraphChartType,
  fontMetricsKey?: string,
): StageAppearance {
  return {
    layout: appearance.layout,
    typography: getTitleFont(appearance),
    ...(fontMetricsKey ? { fontMetricsKey } : {}),
    display: {
      sankeyNodeWidth: appearance.display.sankeyNodeWidth,
      ...(chartType === undefined || chartType === "compound"
        ? { showGroupStats: appearance.display.showGroupStats }
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
