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

const TYPE_COLOR_SWATCHES = [
  { hue: 356, saturation: 58, lightness: 47 },
  { hue: 214, saturation: 62, lightness: 44 },
  { hue: 145, saturation: 52, lightness: 40 },
  { hue: 32, saturation: 66, lightness: 47 },
  { hue: 188, saturation: 54, lightness: 42 },
  { hue: 265, saturation: 48, lightness: 48 },
  { hue: 325, saturation: 48, lightness: 48 },
  { hue: 210, saturation: 24, lightness: 44 },
] satisfies TypeColorSwatch[];

/** Shared by Node-link and Timeline. Build from the full document before filtering. */
export function buildCategoryColorMap(labels: readonly string[]): Map<string, CategoryColorTokens> {
  const names = [...new Set(labels.map(normalizeTypeLabel).filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b),
  );
  return new Map(
    names.map((name, index) => [
      name,
      createNodeColorTokens(
        names.length <= TYPE_COLOR_SWATCHES.length
          ? TYPE_COLOR_SWATCHES[index]
          : {
              hue: ((index * 360) / names.length + TYPE_COLOR_SWATCHES[0].hue) % 360,
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
