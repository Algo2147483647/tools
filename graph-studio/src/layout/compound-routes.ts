import type { ElkNode, ElkPoint } from "elkjs/lib/elk-api";
import type { CompoundLocalGraph } from "./compound-local-graph";

export interface CompoundBox extends ElkPoint {
  width: number;
  height: number;
}

export interface CompoundRoute {
  points: ElkPoint[];
  labelPosition: ElkPoint;
}

export function placeCompoundBoxes(model: CompoundLocalGraph, layouts: Map<string, ElkNode>) {
  const offsets = new Map<string, ElkPoint>([[model.rootId, { x: 0, y: 0 }]]);
  const boxes = new Map<string, CompoundBox>();
  for (const id of model.order) {
    const offset = offsets.get(id)!;
    for (const child of layouts.get(id)!.children ?? []) {
      const box = {
        x: offset.x + (child.x ?? 0),
        y: offset.y + (child.y ?? 0),
        width: child.width!,
        height: child.height!,
      };
      boxes.set(child.id, box);
      if (model.scopes.has(child.id)) offsets.set(child.id, box);
    }
  }
  return { boxes, offsets };
}

/** Join at the exact fixed boundary ports, never by drawing a shortcut across a container. */
export function stitchCompoundRoutes(
  model: CompoundLocalGraph,
  layouts: Map<string, ElkNode>,
  offsets: Map<string, ElkPoint>,
): Map<string, CompoundRoute> {
  const segments = new Map<string, { points: ElkPoint[]; labelPosition?: ElkPoint }>();
  for (const [scopeId, layout] of layouts) {
    const offset = offsets.get(scopeId)!;
    const shift = (point: ElkPoint) => ({ x: point.x + offset.x, y: point.y + offset.y });
    for (const edge of layout.edges ?? []) {
      // A local graph has no hyperedges or hierarchy; every segment must have one continuous section.
      if (edge.sections?.length !== 1) throw new Error(`Missing or ambiguous local route: ${edge.id}.`);
      const section = edge.sections[0];
      const label = edge.labels?.[0];
      segments.set(edge.id, {
        points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift),
        labelPosition:
          label?.x !== undefined && label.y !== undefined
            ? shift({ x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 })
            : undefined,
      });
    }
  }
  const routes = new Map<string, CompoundRoute>();
  for (const [edgeId, parts] of model.routes) {
    const points: ElkPoint[] = [];
    let labelPosition: ElkPoint | undefined;
    for (const part of parts) {
      const segment = segments.get(part.id);
      if (!segment) throw new Error(`Missing compound route: ${edgeId}.`);
      const last = points[points.length - 1];
      if (last && Math.hypot(last.x - segment.points[0].x, last.y - segment.points[0].y) > 0.01)
        throw new Error(`Disconnected boundary port: ${edgeId}.`);
      points.push(...(last ? segment.points.slice(1) : segment.points));
      labelPosition ??= segment.labelPosition;
    }
    // Remove duplicate and collinear junctions so rounding cannot introduce spurious bends at a boundary.
    const simplified: ElkPoint[] = [];
    for (const point of points) {
      const b = simplified[simplified.length - 1];
      if (b && Math.hypot(point.x - b.x, point.y - b.y) < 0.001) continue;
      const a = simplified[simplified.length - 2];
      if (
        a &&
        b &&
        Math.abs((b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x)) < 0.001 &&
        (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) >= 0
      )
        simplified.pop();
      simplified.push(point);
    }
    const middle = simplified[Math.floor(simplified.length / 2)];
    routes.set(edgeId, { points: simplified, labelPosition: labelPosition ?? { x: middle.x, y: middle.y - 10 } });
  }
  return routes;
}
