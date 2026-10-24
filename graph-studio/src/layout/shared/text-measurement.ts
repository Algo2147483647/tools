import { createBrowserTextMeasurer } from "../../adapters/textMeasurement";
import { estimateTextWidth } from "./text-estimate";
export type { TextMeasurer } from "../../adapters/textMeasurement";
// Main-thread layouts use browser fonts; workers and static consumers use the same deterministic fallback.
export const measureText = createBrowserTextMeasurer((text, font) => estimateTextWidth(text, font.size));
