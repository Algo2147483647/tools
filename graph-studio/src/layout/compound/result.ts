import { parseLayoutResult, type LayoutResultDocument } from "../../schema/layoutResult";
import type { LayoutGeometry, LayoutProblem, LayoutResult } from "./layout-plan";
import { draftGeometry } from "./ai/geometry";
import { measureLayout, validateLayoutGeometry } from "./layout-quality";

/** Validate against the prepared model, without a solved or rendered scene. */
export function acceptCompoundResult(value: LayoutResultDocument, problem: LayoutProblem): LayoutResult {
  const parsed = parseLayoutResult(value, "compound");
  const match = (actual: string[], expected: string[], name: string) => {
    if (
      actual.length !== expected.length ||
      new Set(actual).size !== actual.length ||
      expected.some((id) => !actual.includes(id))
    )
      throw new Error(`Layout ${name} must match the complete current scope exactly.`);
  };
  const cards = problem.projection.items.filter((i) => i.kind !== "group" || i.collapsed);
  match(
    parsed.geometry.nodes.map((n) => n.id),
    cards.map((i) => i.id),
    "nodes",
  );
  match(
    (parsed.geometry.groups ?? []).map((n) => n.id),
    problem.projection.items.filter((i) => i.kind === "group" && !i.collapsed).map((i) => i.id),
    "groups",
  );
  match(
    parsed.geometry.edges.map((e) => e.id),
    problem.projection.edges.map((e) => e.id),
    "edges",
  );
  return validateCompoundResult(draftGeometry(parsed, problem), problem);
}

export function validateCompoundResult(geometry: LayoutGeometry, problem: LayoutProblem): LayoutResult {
  const validation = validateLayoutGeometry(problem, geometry);
  for (const item of problem.projection.items) {
    const box = geometry.boxes[item.id],
      minimum = problem.minimumSizes[item.id];
    if (!box || box.width < minimum.width - 0.01 || box.height < minimum.height - 0.01)
      validation.errors.push(`Node ${item.id} is smaller than its measured content.`);
    const fixed = problem.baseline.boxes[item.id];
    if (item.external && fixed && box && (Math.abs(box.x - fixed.x) > 0.01 || Math.abs(box.y - fixed.y) > 0.01))
      validation.errors.push(`External node is fixed: ${item.id}.`);
  }
  if (problem.stored.portMode === "midpoints")
    for (const edge of problem.projection.edges) {
      const points = geometry.routes[edge.id]?.points;
      for (const [id, point] of [
        [edge.source, points?.[0]],
        [edge.target, points?.at(-1)],
      ] as const) {
        const b = geometry.boxes[id];
        if (
          !point ||
          !b ||
          ![
            [b.x, b.y + b.height / 2],
            [b.x + b.width, b.y + b.height / 2],
            [b.x + b.width / 2, b.y],
            [b.x + b.width / 2, b.y + b.height],
          ].some(([x, y]) => Math.hypot(point.x - x, point.y - y) <= 0.01)
        )
          validation.errors.push(`Route ${edge.id} must use side midpoints.`);
      }
    }
  validation.valid = validation.errors.length === 0;
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  return {
    geometry,
    quality: { validation, metrics: measureLayout(problem, geometry), elapsedMs: 0 },
    diagnostics: [],
  };
}

export function compoundResultDocument(
  problem: Pick<LayoutProblem, "projection">,
  geometry: LayoutGeometry,
): LayoutResultDocument {
  return {
    format: "graph-studio-layout",
    version: 4,
    chartType: "compound",
    geometry: {
      size: [geometry.width, geometry.height],
      nodes: problem.projection.items
        .filter((i) => i.kind !== "group" || i.collapsed)
        .map((i) => {
          const b = geometry.boxes[i.id];
          return { id: i.id, position: [b.x + b.width / 2, b.y + b.height / 2] };
        }),
      groups: problem.projection.items
        .filter((i) => i.kind === "group" && !i.collapsed)
        .map((i) => {
          const b = geometry.boxes[i.id];
          return { id: i.id, position: [b.x, b.y], size: [b.width, b.height] };
        }),
      edges: problem.projection.edges.map((e) => {
        const route = geometry.routes[e.id];
        return {
          id: e.id,
          points: route?.points.map((p) => [p.x, p.y]) ?? [],
          label: route ? [route.labelPosition.x, route.labelPosition.y] : [0, 0],
        };
      }),
    },
  };
}
