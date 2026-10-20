/** Names determine colors, so filtering, order and track changes do not recolor a Type. */
export function timelineCategoryColor(name: string): string {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${((hash % 360) + 360) % 360} 58% 43%)`;
}

export function timelineTypeColor(type: string, overrides: Record<string, string>): string {
  if (Object.prototype.hasOwnProperty.call(overrides, type) && overrides[type]) return overrides[type];
  if (!type) return "#64748b";
  // The same hue as track colors, expressed as HEX for the color picker.
  const hue = Number(timelineCategoryColor(type).match(/\d+/)![0]);
  const lightness = 0.43;
  const amplitude = 0.58 * Math.min(lightness, 1 - lightness);
  return (
    "#" +
    [0, 8, 4]
      .map((n) => {
        const k = (n + hue / 30) % 12;
        return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}
