interface Point {
  x: number;
  y: number;
}

/** Fillet bends without moving endpoints or overshooting short segments. */
export function roundedPolylinePath(input: readonly Point[], radius = 12): string {
  const points = input.filter((point, i) => !i || point.x !== input[i - 1].x || point.y !== input[i - 1].y);
  if (!points.length) return "";
  const xy = (p: Point) => `${Number(p.x.toFixed(3))},${Number(p.y.toFixed(3))}`;
  let path = `M${xy(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1],
      corner = points[i],
      next = points[i + 1];
    const incoming = { x: corner.x - previous.x, y: corner.y - previous.y };
    const outgoing = { x: next.x - corner.x, y: next.y - corner.y };
    const before = Math.hypot(incoming.x, incoming.y),
      after = Math.hypot(outgoing.x, outgoing.y);
    const r = Math.min(Math.max(0, radius), before / 2, after / 2);
    if (!r || Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) < 1e-8) {
      path += ` L${xy(corner)}`;
      continue;
    }
    path += ` L${xy({ x: corner.x - (incoming.x / before) * r, y: corner.y - (incoming.y / before) * r })}`;
    path += ` Q${xy(corner)} ${xy({ x: corner.x + (outgoing.x / after) * r, y: corner.y + (outgoing.y / after) * r })}`;
  }
  if (points.length > 1) path += ` L${xy(points[points.length - 1])}`;
  return path;
}
