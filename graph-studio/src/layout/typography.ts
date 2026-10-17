import { DEFAULT_GRAPH_APPEARANCE, type GraphAppearance } from "../graph/appearance";

export interface TextFont {
  size: number;
  family: string;
  weight: string;
  style: string;
}

export function getTitleFont(appearance: Pick<GraphAppearance, "cssVars">): TextFont {
  const vars = { ...DEFAULT_GRAPH_APPEARANCE.cssVars, ...appearance.cssVars };
  return {
    size: Math.max(1, parseFloat(vars["--dag-title-font-size"]) || 15),
    family: vars["--dag-title-font-family"],
    weight: vars["--dag-title-font-weight"],
    style: vars["--dag-title-font-style"],
  };
}

export const DEFAULT_TITLE_FONT = getTitleFont(DEFAULT_GRAPH_APPEARANCE);

export const CARD_DETAIL_LINE_HEIGHT = 12;
export const CARD_BADGE_HEIGHT = 10;

export function minimumCardHeight(font: TextFont, detailCount: number, hasBadge: boolean): number {
  const titleHeight = Math.ceil(font.size * 1.2);
  return detailCount
    ? 16 + titleHeight + 4 + detailCount * CARD_DETAIL_LINE_HEIGHT + (hasBadge ? 4 + CARD_BADGE_HEIGHT : 0)
    : titleHeight + (hasBadge ? 30 : 16);
}

export function cardContentLayout(height: number, font: TextFont, detailCount: number, hasBadge: boolean) {
  const titleHeight = Math.ceil(font.size * 1.2);
  const top = (height - minimumCardHeight(font, detailCount, hasBadge)) / 2 + 8;
  return {
    titleY: detailCount ? top + titleHeight / 2 : height / 2,
    detailY: top + titleHeight + 4 + CARD_DETAIL_LINE_HEIGHT / 2,
    detailLineHeight: CARD_DETAIL_LINE_HEIGHT,
    badgeY: height - CARD_BADGE_HEIGHT - (detailCount ? 8 : 3),
  };
}
