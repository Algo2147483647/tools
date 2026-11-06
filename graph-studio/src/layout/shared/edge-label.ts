import { measureText } from "./text-measurement";
import type { TextFont } from "./typography";

export function edgeLabelSize(label: string, font: TextFont) {
  return { width: Math.max(18, Math.ceil(measureText(label, font)) + 14), height: Math.ceil(font.size * 1.2) + 6 };
}
