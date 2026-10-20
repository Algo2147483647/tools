import { buildCategoryColorMap, normalizeTypeLabel, type CategoryColorTokens } from "./categoryColors";

export function timelineTypeColor(
  type: string,
  overrides: Record<string, string>,
  palette: ReadonlyMap<string, CategoryColorTokens> = buildCategoryColorMap([type]),
): string {
  if (Object.prototype.hasOwnProperty.call(overrides, type) && overrides[type]) return overrides[type];
  return palette.get(normalizeTypeLabel(type) ?? "")?.pinCore ?? "#64748b";
}
