import type { GraphAppearance, GraphLayoutAppearance } from "../graph/appearance";
// Only geometry inputs belong in layout memoization; colors and CSS are rendered separately.
export interface StageAppearance {
  layout: GraphLayoutAppearance;
  display: Pick<GraphAppearance["display"], "sankeyNodeWidth">;
}
export function getStageAppearance(appearance: GraphAppearance): StageAppearance {
  return { layout: appearance.layout, display: { sankeyNodeWidth: appearance.display.sankeyNodeWidth } };
}
