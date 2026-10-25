import type { CompoundBox, CompoundRoute } from "../../../graph/compound/geometry";
import type { CompoundProjection } from "../../../graph/compound/projection";
import { compileRoutingPlan } from "./plan";
import { sides, type RoutingIntent, type RoutingIssue } from "./intent";
import type { Point } from "./types";

const positionOnPath = (point: Point, points: Point[]) => {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (
      Math.abs(
        Math.abs(point.x - a.x) + Math.abs(point.y - a.y) + Math.abs(point.x - b.x) + Math.abs(point.y - b.y) - length,
      ) < 0.01
    )
      return distance + Math.abs(point.x - a.x) + Math.abs(point.y - a.y);
    distance += length;
  }
  return -1;
};
/** Validate the complete result, including manually replaced and fixed routes. */
export function verifyRoutingIntent(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  routes: Map<string, CompoundRoute>,
  bounds: CompoundBox,
  intent: RoutingIntent,
  mode: "distributed" | "midpoints",
) {
  const plan = compileRoutingPlan(projection, boxes, bounds, intent, mode);
  const issues: RoutingIssue[] = [];
  const reject = (required: boolean, id: string, edgeId: string, reason: string) => {
    if (required) throw new Error(`Required routing intent ${id} not realized for ${edgeId}: ${reason}.`);
    issues.push({
      id: `intent-deviation:${id}:${edgeId}`,
      kind: "intent-deviation",
      scopeId: null,
      nodeIds: [],
      edgeIds: [edgeId],
      evidence: { intentId: id, reason },
      repairLevel: "routing",
      suggestedActions: ["change-routing-intent", "reroute-together"],
    });
  };
  for (const port of intent.ports)
    for (const end of port.ends) {
      const points = routes.get(end.edgeId)?.points ?? [],
        p = end.end === "source" ? points[0] : points[points.length - 1],
        b = boxes.get(port.nodeId)!;
      const d = sides.indexOf(port.side),
        coordinate = [b.x + b.width, b.y + b.height, b.x, b.y][d];
      if (!p || Math.abs((d % 2 ? p.y : p.x) - coordinate) > 0.01)
        reject(port.strength === "required", `port:${port.nodeId}:${port.side}`, end.edgeId, "endpoint side changed");
    }
  const explicit = new Set([...intent.channels.map((c) => c.id), ...intent.gateways.map((g) => g.id)]);
  for (const [edgeId, passages] of plan.passages) {
    const points = routes.get(edgeId)?.points ?? [];
    let previous = -1;
    for (const p of passages) {
      if (!explicit.has(p.id)) continue;
      const entry = positionOnPath(p.entry, points),
        exit = positionOnPath(p.exit, points);
      if (entry < 0 || exit < entry || entry < previous)
        reject(p.required, p.id, edgeId, "ordered passage is absent or reversed");
      else previous = exit;
    }
  }
  return issues;
}
