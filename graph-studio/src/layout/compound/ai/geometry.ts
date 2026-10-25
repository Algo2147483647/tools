import type { LayoutResultDocument } from "../../../schema/layoutResult";
import type { LayoutGeometry, LayoutProblem } from "../layout-plan";
import {
  boxesOverlap,
  close,
  labelRect,
  onPortSide,
  routeSegments,
  segmentCrossesBox,
  validateLayoutGeometry,
} from "../layout-quality";

export interface GeometryIssue {
  code: string;
  message: string;
  edgeId?: string;
  nodeId?: string;
  segmentIndex?: number;
  segment?: [[number, number], [number, number]];
  obstacle?: { x: number; y: number; width: number; height: number };
  expectedPorts?: number[][];
}
export function draftGeometry(layout: LayoutResultDocument, problem: LayoutProblem): LayoutGeometry {
  const g = layout.geometry;
  const boxes: LayoutGeometry["boxes"] = {};
  for (const n of g.nodes) {
    const size = problem.minimumSizes[n.id];
    if (!size) throw new Error(`Unknown node: ${n.id}.`);
    boxes[n.id] = { x: n.position[0] - size.width / 2, y: n.position[1] - size.height / 2, ...size };
  }
  for (const group of g.groups ?? [])
    boxes[group.id] = { x: group.position[0], y: group.position[1], width: group.size[0], height: group.size[1] };
  return {
    width: g.size[0],
    height: g.size[1],
    boxes,
    routes: Object.fromEntries(
      g.edges.map((e) => [
        e.id,
        {
          points: (e.points ?? []).map(([x, y]) => ({ x, y })),
          labelPosition: { x: e.label[0], y: e.label[1] },
        },
      ]),
    ),
  };
}
export function geometryLayout(template: LayoutResultDocument, geometry: LayoutGeometry): LayoutResultDocument {
  const layout = structuredClone(template);
  layout.geometry.size = [geometry.width, geometry.height];
  for (const n of layout.geometry.nodes) {
    const b = geometry.boxes[n.id];
    n.position = [b.x + b.width / 2, b.y + b.height / 2];
  }
  for (const g of layout.geometry.groups ?? []) {
    const b = geometry.boxes[g.id];
    g.position = [b.x, b.y];
    g.size = [b.width, b.height];
  }
  layout.geometry.edges = template.geometry.edges.map((e) => {
    const route = geometry.routes[e.id];
    return {
      id: e.id,
      points: route.points.map((p) => [p.x, p.y]),
      label: [route.labelPosition.x, route.labelPosition.y],
    };
  });
  return layout;
}
export function routeIssues(problem: LayoutProblem, geometry: LayoutGeometry): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  const cards = problem.projection.items.filter((i) => i.kind !== "group" || i.collapsed);
  for (const edge of problem.projection.edges) {
    const route = geometry.routes[edge.id];
    const issue = (detail: Omit<GeometryIssue, "edgeId">) => issues.push({ edgeId: edge.id, ...detail });
    if (!route || route.points.length < 2) {
      issue({ code: "missing-route", message: "Supply a complete route." });
      continue;
    }
    for (const [id, p] of [
      [edge.source, route.points[0]],
      [edge.target, route.points.at(-1)!],
    ] as const) {
      const b = geometry.boxes[id];
      if (!b) continue;
      const centers = [
        [b.x, b.y + b.height / 2],
        [b.x + b.width, b.y + b.height / 2],
        [b.x + b.width / 2, b.y],
        [b.x + b.width / 2, b.y + b.height],
      ];
      if (
        problem.stored.portMode === "midpoints"
          ? !centers.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= 0.01)
          : !onPortSide(p, b)
      )
        issue({
          code: "port",
          nodeId: id,
          message: "Route endpoint must attach to the configured side port.",
          expectedPorts: centers,
        });
    }
    routeSegments(route.points).forEach(([a, b], segmentIndex) => {
      const segment: GeometryIssue["segment"] = [
        [a.x, a.y],
        [b.x, b.y],
      ];
      if (!close(a.x, b.x) && !close(a.y, b.y))
        issue({ code: "nonorthogonal", message: "Route segment must be orthogonal.", segmentIndex, segment });
      for (const card of cards) {
        const obstacle = geometry.boxes[card.id];
        if (obstacle && segmentCrossesBox(a, b, obstacle))
          issue({
            code: "card-crossing",
            message: `Route crosses card ${card.id}.`,
            nodeId: card.id,
            segmentIndex,
            segment,
            obstacle,
          });
      }
    });
    const label = labelRect(problem, geometry, edge.id);
    if (!label) continue;
    if (
      label.x < 0 ||
      label.y < 0 ||
      label.x + label.width > geometry.width ||
      label.y + label.height > geometry.height
    )
      issue({ code: "label-bounds", message: "Label exceeds canvas." });
    for (const card of cards) {
      const b = geometry.boxes[card.id];
      if (b && boxesOverlap(label, b))
        issue({ code: "label-card", nodeId: card.id, obstacle: b, message: "Label overlaps card." });
    }
    for (const other of problem.projection.edges) {
      if (other.id === edge.id) continue;
      const r = geometry.routes[other.id],
        otherLabel = labelRect(problem, geometry, other.id);
      if (
        (r && routeSegments(r.points).some(([a, b]) => segmentCrossesBox(a, b, label))) ||
        (otherLabel && boxesOverlap(label, otherLabel))
      )
        issue({ code: "label-route", message: `Label conflicts with connection ${other.id}.` });
    }
  }
  return issues;
}
export function inspectDraft(layout: LayoutResultDocument, problem: LayoutProblem): GeometryIssue[] {
  try {
    const geometry = draftGeometry(layout, problem);
    return [
      ...routeIssues(problem, geometry),
      ...validateLayoutGeometry(problem, geometry).errors.map((message) => ({ code: "geometry", message })),
    ];
  } catch (error) {
    return [{ code: "geometry", message: error instanceof Error ? error.message : "Invalid geometry." }];
  }
}
