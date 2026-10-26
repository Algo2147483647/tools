import type { CompoundBox } from "../../graph/compound/geometry";
import { estimateTextWidth } from "./text-estimate";

// Match .dag-group-title. These measurements travel with the projection so a
// worker uses exactly the same glyph bounds as the rendered main-thread title.
type GlyphBounds = { width: number; left: number; right: number; ascent: number; descent: number };
export type GroupTitleMetrics = { text: string; prefixes: GlyphBounds[]; ellipses: GlyphBounds[] }[];
let context: CanvasRenderingContext2D | null | undefined;
function measure(text: string): GlyphBounds {
  if (context === undefined && typeof document !== "undefined")
    context = document.createElement("canvas").getContext("2d");
  if (context) {
    context.font = '600 14px "Segoe UI", sans-serif';
    const m = context.measureText(text);
    return {
      width: m.width,
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  }
  const width = estimateTextWidth(text, 14);
  return { width, left: 0, right: width, ascent: text.trim() ? 14 : 0, descent: text.trim() ? 3 : 0 };
}
export function measureGroupTitle(title: string): GroupTitleMetrics {
  return title.split(/\r?\n/).map((text) => {
    const chars = Array.from(text);
    const prefixes = chars.map((_, i) => chars.slice(0, i + 1).join(""));
    prefixes.unshift("");
    return { text, prefixes: prefixes.map(measure), ellipses: prefixes.map((s) => measure(s + "…")) };
  });
}
export function layoutGroupTitle(title: string, width: number, metrics = measureGroupTitle(title)) {
  const available = Math.max(0, width - 96);
  return metrics.map((line, index) => {
    const chars = Array.from(line.text);
    let text = line.text,
      bounds = line.prefixes[chars.length];
    if (bounds.width > available) {
      let count = chars.length;
      while (count >= 0 && line.ellipses[count].width > available) count--;
      text = count < 0 ? "" : chars.slice(0, count).join("") + "…";
      bounds = count < 0 ? line.prefixes[0] : line.ellipses[count];
    }
    const x = 16,
      baseline = 26 + index * 18;
    return {
      text,
      x,
      baseline,
      box: {
        x: x - bounds.left,
        y: baseline - bounds.ascent,
        width: bounds.left + bounds.right,
        height: bounds.ascent + bounds.descent,
      },
    };
  });
}
export function groupTitleObstacles(
  item: { title: string; titleMetrics?: GroupTitleMetrics },
  box: CompoundBox,
): CompoundBox[] {
  return layoutGroupTitle(item.title, box.width, item.titleMetrics)
    .filter((line) => line.box.width > 0 && line.box.height > 0)
    .map((line) => ({ ...line.box, x: box.x + line.box.x, y: box.y + line.box.y }));
}
export function groupContentTop(title: string) {
  return 58 + (title.split(/\r?\n/).length - 1) * 18;
}
