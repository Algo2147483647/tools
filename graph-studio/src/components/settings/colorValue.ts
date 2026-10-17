export interface ColorValue {
  hex: string;
  alpha: number;
}
export function parseColorValue(value: string): ColorValue | null {
  const text = value.trim();
  if (/^#[0-9a-f]{3,4}$/i.test(text)) return parseColorValue("#" + [...text.slice(1)].map((c) => c + c).join(""));
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(text))
    return { hex: text.slice(0, 7).toLowerCase(), alpha: text.length === 9 ? parseInt(text.slice(7), 16) / 255 : 1 };
  const match = text.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?))?\s*\)$/i,
  );
  if (!match) return null;
  const rgb = match.slice(1, 4).map(Number),
    alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (rgb.some((c) => c < 0 || c > 255) || !Number.isFinite(alpha)) return null;
  return { hex: "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join(""), alpha };
}
export function formatColorValue({ hex, alpha }: ColorValue): string {
  if (alpha === 1) return hex;
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}
