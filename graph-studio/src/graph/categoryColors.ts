import { DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
export interface CategoryColorTokens {
  glow: string;
  border: string;
  borderStrong: string;
  activeBorder: string;
  pinFill: string;
  pinStroke: string;
  pinCore: string;
  affordanceBg: string;
  affordanceText: string;
}
type TypeColorSwatch = {
  hue: number;
  saturation: number;
  lightness: number;
};

/** Shared by Node-link and Timeline. Build from the full document before filtering. */
export function buildCategoryColorMap(
  labels: readonly string[],
  swatches = DEFAULT_GRAPH_APPEARANCE.palette.categories,
): Map<string, CategoryColorTokens> {
  const palette = swatches.map(([hue, saturation, lightness]) => ({ hue, saturation, lightness }));
  const names = [...new Set(labels.map(normalizeTypeLabel).filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b),
  );
  return new Map(
    names.map((name, index) => [
      name,
      createNodeColorTokens(
        names.length <= palette.length
          ? palette[index]
          : {
              hue: ((index * 360) / names.length + palette[0].hue) % 360,
              saturation: 58,
              lightness: 45,
            },
      ),
    ]),
  );
}
export function normalizeTypeLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function createNodeColorTokens(swatch: TypeColorSwatch): CategoryColorTokens {
  const { hue, saturation, lightness } = swatch;

  return {
    glow: hsla(hue, saturation + 8, lightness + 2, 0.13),
    border: hsla(hue, saturation, lightness, 0.34),
    borderStrong: hsla(hue, saturation + 4, lightness - 5, 0.52),
    activeBorder: hsla(hue, saturation + 8, lightness - 3, 0.66),
    pinFill: hsla(hue, saturation + 8, lightness + 4, 0.2),
    pinStroke: hsla(hue, saturation + 6, lightness - 2, 0.34),
    pinCore: hsla(hue, saturation + 8, lightness - 9, 0.88),
    affordanceBg: hsla(hue, Math.max(24, saturation - 10), 94, 0.98),
    affordanceText: hsla(hue, saturation + 6, lightness - 14, 0.88),
  };
}

function hsla(hue: number, saturation: number, lightness: number, alpha: number): string {
  return `hsla(${Math.round(hue)} ${saturation}% ${lightness}% / ${alpha})`;
}
