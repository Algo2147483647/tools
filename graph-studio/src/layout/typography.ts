import { DEFAULT_GRAPH_APPEARANCE, type GraphAppearance } from "../graph/appearance";

export interface TextFont {
  size: number;
  family: string;
  weight: string;
  style: string;
}

export function getTitleFont(appearance: Pick<GraphAppearance, "cssVars">): TextFont {
  const vars = { ...DEFAULT_GRAPH_APPEARANCE.cssVars, ...appearance.cssVars };
  const size = parseFloat(vars["--dag-title-font-size"]);
  return {
    size: Number.isFinite(size) ? Math.max(0, size) : 15,
    family: vars["--dag-title-font-family"],
    weight: vars["--dag-title-font-weight"],
    style: vars["--dag-title-font-style"],
  };
}

export const DEFAULT_TITLE_FONT = getTitleFont(DEFAULT_GRAPH_APPEARANCE);

export const CARD_DETAIL_LINE_HEIGHT = 12;
export const CARD_BADGE_HEIGHT = 10;

export function minimumCardHeight(
  font: TextFont,
  detailCount: number,
  hasBadge: boolean,
  titleLines = 1,
  detailLineHeight = CARD_DETAIL_LINE_HEIGHT,
): number {
  const titleHeight = Math.ceil(font.size * 1.2) * titleLines;
  return detailCount
    ? 16 + titleHeight + 4 + detailCount * detailLineHeight + (hasBadge ? 4 + CARD_BADGE_HEIGHT : 0)
    : titleHeight + (hasBadge ? 30 : 16);
}

export function cardContentLayout(
  height: number,
  font: TextFont,
  detailCount: number,
  hasBadge: boolean,
  titleLines = 1,
  detailLineHeight = CARD_DETAIL_LINE_HEIGHT,
) {
  const titleHeight = Math.ceil(font.size * 1.2) * titleLines;
  const top = (height - minimumCardHeight(font, detailCount, hasBadge, titleLines, detailLineHeight)) / 2 + 8;
  return {
    titleY: detailCount ? top + titleHeight / 2 : height / 2,
    detailY: top + titleHeight + 4 + detailLineHeight / 2,
    detailLineHeight,
    badgeY: height - CARD_BADGE_HEIGHT - (detailCount ? 8 : 3),
  };
}

export type FontRole = "title" | "detail" | "date" | "axis" | "track";
export function getRoleFont(appearance: Pick<GraphAppearance, "cssVars">, role: FontRole): TextFont {
  const vars = { ...DEFAULT_GRAPH_APPEARANCE.cssVars, ...appearance.cssVars };
  const prefix = `--dag-${role}-font-`;
  return {
    size: Number(vars[prefix + "size"].slice(0, -2)),
    family: vars[prefix + "family"],
    weight: vars[prefix + "weight"],
    style: vars[prefix + "style"],
  };
}
