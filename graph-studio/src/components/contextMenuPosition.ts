interface Size {
  width: number;
  height: number;
}
interface Rect extends Size {
  left: number;
  top: number;
  right: number;
}
const margin = 8;
const gap = 4;
const clamp = (value: number, size: number, limit: number) => Math.max(margin, Math.min(value, limit - size - margin));

export function placeContextMenu(point: { x: number; y: number }, size: Size, viewport: Size) {
  return { left: clamp(point.x, size.width, viewport.width), top: clamp(point.y, size.height, viewport.height) };
}

export function placeContextSubmenu(root: Rect, rowTop: number, size: Size, viewport: Size) {
  const right = root.right + gap;
  const left = root.left - size.width - gap;
  const side = right + size.width <= viewport.width - margin ? "right" : "left";
  const fits = side === "right" || left >= margin;
  return {
    left: fits ? (side === "right" ? right : left) : root.left,
    top: clamp(rowTop - 6, size.height, viewport.height),
    side,
    inline: !fits,
  };
}
