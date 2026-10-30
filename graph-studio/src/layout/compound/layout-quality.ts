import { overlapLength, sharedEndpoints, sharedExit } from "./routing/cost";
import type { LayoutMetrics, LayoutProblem, LayoutGeometry, LayoutValidation } from "./layout-plan";
import type { CompoundBox } from "../../graph/compound/geometry";
import { groupContentTop, groupTitleObstacles } from "../shared/group-title";

export const GEOMETRY_EPSILON = 0.01;
type Point = { x: number; y: number };
export const close = (a: number, b: number) => Math.abs(a - b) < GEOMETRY_EPSILON;
export function sameBox(a: CompoundBox, b: CompoundBox) {
  return close(a.x, b.x) && close(a.y, b.y) && close(a.width, b.width) && close(a.height, b.height);
}
export function boxesOverlap(a: CompoundBox, b: CompoundBox, gap = 0) {
  return (
    a.x < b.x + b.width + gap - GEOMETRY_EPSILON &&
    b.x < a.x + a.width + gap - GEOMETRY_EPSILON &&
    a.y < b.y + b.height + gap - GEOMETRY_EPSILON &&
    b.y < a.y + a.height + gap - GEOMETRY_EPSILON
  );
}
export function segmentCrossesBox(a: Point, b: Point, box: CompoundBox) {
  const e = GEOMETRY_EPSILON;
  if (close(a.x, b.x))
    return (
      a.x > box.x + e &&
      a.x < box.x + box.width - e &&
      Math.max(a.y, b.y) > box.y + e &&
      Math.min(a.y, b.y) < box.y + box.height - e
    );
  if (close(a.y, b.y))
    return (
      a.y > box.y + e &&
      a.y < box.y + box.height - e &&
      Math.max(a.x, b.x) > box.x + e &&
      Math.min(a.x, b.x) < box.x + box.width - e
    );
  return true;
}
export function routeSegments(points: Point[]): [Point, Point][] {
  return points.slice(1).map((p, i) => [points[i], p]);
}
export function labelRect(problem: LayoutProblem, geometry: LayoutGeometry, edgeId: string): CompoundBox | null {
  const size = problem.labelSizes[edgeId],
    route = geometry.routes[edgeId];
  return problem.showLabels && size && route
    ? { x: route.labelPosition.x - size.width / 2, y: route.labelPosition.y - 10, ...size }
    : null;
}
export function onPortSide(point: Point, b: CompoundBox, side?: number) {
  return [
    close(point.x, b.x + b.width) && point.y > b.y && point.y < b.y + b.height,
    close(point.y, b.y + b.height) && point.x > b.x && point.x < b.x + b.width,
    close(point.x, b.x) && point.y > b.y && point.y < b.y + b.height,
    close(point.y, b.y) && point.x > b.x && point.x < b.x + b.width,
  ].some((onSide, index) => onSide && (side === undefined || side === index));
}
export function validateLayoutGeometry(problem: LayoutProblem, geometry: LayoutGeometry): LayoutValidation {
  const errors: string[] = [];
  const fail = (message: string) => {
    if (errors.length < 40) errors.push(message);
  };
  const { items, edges } = problem.projection;
  if (
    !Number.isFinite(geometry.width) ||
    !Number.isFinite(geometry.height) ||
    geometry.width < 0 ||
    geometry.height < 0
  )
    fail("Invalid canvas bounds.");
  const ids = new Set(items.map((i) => i.id)),
    edgeIds = new Set(edges.map((e) => e.id));
  if (
    Object.keys(geometry.boxes).some((id) => !ids.has(id)) ||
    Object.keys(geometry.routes).some((id) => !edgeIds.has(id))
  )
    fail("Geometry contains objects outside the current projection.");
  const validBoxes = new Set<string>();
  for (const item of items) {
    const b = geometry.boxes[item.id];
    if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) {
      fail(`Invalid rectangle: ${item.id}.`);
      continue;
    }
    validBoxes.add(item.id);
    const size = problem.minimumSizes[item.id];
    if (
      size &&
      (item.kind === "group" && !item.collapsed
        ? b.width < size.width - GEOMETRY_EPSILON || b.height < size.height - GEOMETRY_EPSILON
        : !close(b.width, size.width) || !close(b.height, size.height))
    )
      fail(`Rectangle does not match measured content: ${item.id}.`);
    if (
      b.x < -GEOMETRY_EPSILON ||
      b.y < -GEOMETRY_EPSILON ||
      b.x + b.width > geometry.width + GEOMETRY_EPSILON ||
      b.y + b.height > geometry.height + GEOMETRY_EPSILON
    )
      fail(`Rectangle is outside the canvas: ${item.id}.`);
    const parent = item.parentId === null ? null : geometry.boxes[item.parentId];
    if (item.parentId !== null && !parent) fail(`Missing parent rectangle: ${item.parentId}.`);
    if (
      parent &&
      (b.x < parent.x + 24 - GEOMETRY_EPSILON ||
        b.y < parent.y + groupContentTop(items.find((i) => i.id === item.parentId)!.title) - GEOMETRY_EPSILON ||
        b.x + b.width > parent.x + parent.width - 24 + GEOMETRY_EPSILON ||
        b.y + b.height > parent.y + parent.height - 24 + GEOMETRY_EPSILON)
    )
      fail(`Node exceeds its parent content area: ${item.id}.`);
  }
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i],
        b = items[j];
      if (
        a.parentId === b.parentId &&
        validBoxes.has(a.id) &&
        validBoxes.has(b.id) &&
        boxesOverlap(geometry.boxes[a.id], geometry.boxes[b.id])
      )
        fail(`Sibling overlap: ${a.id} / ${b.id}.`);
    }
  const cards = items.filter((i) => i.kind !== "group" || i.collapsed).filter((i) => validBoxes.has(i.id));
  const titles = items
    .filter((i) => i.kind === "group" && !i.collapsed && validBoxes.has(i.id))
    .flatMap((i) => groupTitleObstacles(i, geometry.boxes[i.id]).map((box) => ({ id: i.id, box })));
  for (const edge of edges) {
    const r = geometry.routes[edge.id];
    if (
      !r ||
      !Array.isArray(r.points) ||
      r.points.length < 2 ||
      ![...r.points, r.labelPosition].every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    ) {
      fail(`Invalid route: ${edge.id}.`);
      continue;
    }
    if (!validBoxes.has(edge.source) || !validBoxes.has(edge.target)) continue;
    if (
      !onPortSide(r.points[0], geometry.boxes[edge.source]) ||
      !onPortSide(r.points[r.points.length - 1], geometry.boxes[edge.target])
    )
      fail(`Incorrect route endpoints: ${edge.id}.`);
    for (const [a, b] of routeSegments(r.points)) {
      if (!close(a.x, b.x) && !close(a.y, b.y)) {
        fail(`Nonorthogonal route: ${edge.id}.`);
        continue;
      }
      if (
        [a, b].some(
          (p) =>
            p.x < -GEOMETRY_EPSILON ||
            p.y < -GEOMETRY_EPSILON ||
            p.x > geometry.width + GEOMETRY_EPSILON ||
            p.y > geometry.height + GEOMETRY_EPSILON,
        )
      )
        fail(`Route exceeds canvas: ${edge.id}.`);
      for (const card of cards)
        if (segmentCrossesBox(a, b, geometry.boxes[card.id])) fail(`Route ${edge.id} crosses card ${card.id}.`);
      for (const title of titles)
        if (segmentCrossesBox(a, b, title.box)) fail(`Route ${edge.id} crosses title ${title.id}.`);
    }
    const label = labelRect(problem, geometry, edge.id);
    if (label) {
      if (
        label.x < 0 ||
        label.y < 0 ||
        label.x + label.width > geometry.width + GEOMETRY_EPSILON ||
        label.y + label.height > geometry.height + GEOMETRY_EPSILON
      )
        fail(`Label exceeds canvas: ${edge.id}.`);
      for (const card of cards)
        if (boxesOverlap(label, geometry.boxes[card.id])) fail(`Label ${edge.id} overlaps ${card.id}.`);
      for (const other of edges) {
        if (other.id === edge.id) continue;
        const otherRoute = geometry.routes[other.id];
        if (otherRoute?.points && routeSegments(otherRoute.points).some(([a, b]) => segmentCrossesBox(a, b, label)))
          fail(`Label ${edge.id} overlaps route ${other.id}.`);
        const otherLabel = labelRect(problem, geometry, other.id);
        if (otherLabel && other.id > edge.id && boxesOverlap(label, otherLabel))
          fail(`Labels overlap: ${edge.id} / ${other.id}.`);
      }
    }
  }
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}
export function measureLayout(problem: LayoutProblem, geometry: LayoutGeometry): LayoutMetrics {
  const metrics: LayoutMetrics = {
    crossings: 0,
    sharedLength: 0,
    labelCollisions: 0,
    bends: 0,
    length: 0,
    area: 0,
    movedNodes: 0,
    movement: 0,
    changedEdges: 0,
  };
  const all = problem.projection.edges.flatMap((e) =>
    routeSegments(geometry.routes[e.id]?.points ?? []).map(([a, b]) => ({ id: e.id, edge: e, a, b })),
  );
  const crossings = new Set<string>();
  for (const item of problem.projection.items) {
    const a = problem.baseline.boxes[item.id],
      b = geometry.boxes[item.id];
    if (a && b) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      metrics.movement += distance;
      if (!sameBox(a, b)) metrics.movedNodes++;
    }
  }
  for (const edge of problem.projection.edges) {
    const points = geometry.routes[edge.id]?.points ?? [];
    metrics.bends += Math.max(0, points.length - 2);
    if (JSON.stringify(geometry.routes[edge.id]) !== JSON.stringify(problem.baseline.routes[edge.id]))
      metrics.changedEdges++;
    const label = labelRect(problem, geometry, edge.id);
    if (label) {
      metrics.labelCollisions += problem.projection.items.filter(
        (i) => (i.kind !== "group" || i.collapsed) && geometry.boxes[i.id] && boxesOverlap(label, geometry.boxes[i.id]),
      ).length;
      metrics.labelCollisions += all.filter((s) => s.id !== edge.id && segmentCrossesBox(s.a, s.b, label)).length;
      metrics.labelCollisions += problem.projection.edges
        .filter((e) => e.id > edge.id)
        .filter((e) => {
          const other = labelRect(problem, geometry, e.id);
          return other && boxesOverlap(label, other);
        }).length;
    }
  }
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    metrics.length += Math.hypot(a.a.x - a.b.x, a.a.y - a.b.y);
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      if (a.id === b.id) continue;
      const shared = sharedEndpoints(a.edge, geometry.routes[a.id].points, b.edge, geometry.routes[b.id].points);
      const ah = close(a.a.y, a.b.y),
        bh = close(b.a.y, b.b.y);
      if (ah === bh) {
        if (close(ah ? a.a.y : a.a.x, bh ? b.a.y : b.a.x))
          metrics.sharedLength += overlapLength(a.a, a.b, b.a, b.b, shared);
      } else {
        const h = ah ? a : b,
          v = ah ? b : a;
        if (
          v.a.x >= Math.min(h.a.x, h.b.x) - GEOMETRY_EPSILON &&
          v.a.x <= Math.max(h.a.x, h.b.x) + GEOMETRY_EPSILON &&
          h.a.y >= Math.min(v.a.y, v.b.y) - GEOMETRY_EPSILON &&
          h.a.y <= Math.max(v.a.y, v.b.y) + GEOMETRY_EPSILON &&
          !sharedExit({ x: v.a.x, y: h.a.y }, shared)
        )
          crossings.add(`${[a.id, b.id].sort().join("|")}|${v.a.x}|${h.a.y}`);
      }
    }
  }
  metrics.crossings = crossings.size;
  const boxes = Object.values(geometry.boxes);
  const xs = [...boxes.flatMap((b) => [b.x, b.x + b.width]), ...all.flatMap((s) => [s.a.x, s.b.x])];
  const ys = [...boxes.flatMap((b) => [b.y, b.y + b.height]), ...all.flatMap((s) => [s.a.y, s.b.y])];
  metrics.area = xs.length ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) : 0;
  return metrics;
}
/** Finite routing and compactness trade-offs for final candidate selection. */
export function scoreLayoutMetrics(m: LayoutMetrics) {
  return m.length + 4 * m.sharedLength + 160 * m.crossings + 20 * m.bends + 2 * Math.sqrt(m.area);
}
export function compareLayoutMetrics(a: LayoutMetrics, b: LayoutMetrics): number {
  if (!close(a.labelCollisions, b.labelCollisions)) return a.labelCollisions - b.labelCollisions;
  const first = scoreLayoutMetrics(a),
    second = scoreLayoutMetrics(b);
  return close(first, second) ? 0 : first - second;
}
