import { estimateTextWidth } from "./text-estimate";
import type { TextFont } from "./typography";
export type TextMeasurer = (text: string, font: TextFont) => number;
export function createBrowserTextMeasurer(fallback: TextMeasurer): TextMeasurer {
  let measurementContext: CanvasRenderingContext2D | null | undefined;
  return (text, font) => {
    if (font.size <= 0) return 0;
    if (measurementContext === undefined && typeof document !== "undefined")
      measurementContext = document.createElement("canvas").getContext("2d");
    if (measurementContext) {
      measurementContext.font = `${font.style} ${font.weight} ${font.size}px ${font.family}`;
      return measurementContext.measureText(text).width;
    }
    return fallback(text, font);
  };
}

// Browser fonts on the main thread; deterministic fallback in workers and static consumers.
export const measureText = createBrowserTextMeasurer((text, font) => estimateTextWidth(text, font.size));
