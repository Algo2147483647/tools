import type { LayoutGeometry, LayoutProblem } from "../layout-plan";
import type { CompoundBox } from "../../../graph/compound/geometry";
import { buildScopes } from "../constraints";
import { routeCompoundEdges } from "../routing/router";

/** Spatial cells describe composition, never additional graph dependencies. */
export interface CompoundDesign {
  purpose: string;
  readingPath: string[];
  regions: { id: string; role: "primary" | "branch" | "support"; reason: string }[];
  scopes: {
    groupId: string | null;
    direction: "RIGHT" | "DOWN";
    rows: (string | null)[][];
    reason: string;
  }[];
  connections: { edgeId: string; role: "main" | "branch" | "feedback" | "support" }[];
}

export function validateDesign(problem: LayoutProblem, design: CompoundDesign) {
  const { scopes } = buildScopes(problem.projection);
  const items = new Map(problem.projection.items.map((item) => [item.id, item]));
  const normalize = (id: string | null) => id === problem.projection.focusGroupId ? null : id;
  const seen = new Set<string | null>();
  for (const scope of design.scopes) {
    const id = normalize(scope.groupId), children = scopes.get(id)?.children;
    if (!children || (id !== null && items.get(id)?.external)) throw new Error(`Unknown movable scope: ${scope.groupId}.`);
    if (seen.has(id)) throw new Error(`Duplicate design scope: ${scope.groupId}.`);
    seen.add(id);
    if (problem.stored.direction !== "AUTO" && scope.direction !== problem.stored.direction)
      throw new Error(`Preserve selected direction ${problem.stored.direction}.`);
    const ids = scope.rows.flat().filter((value): value is string => value !== null);
    const movable = children.filter((child) => !items.get(child)!.external);
    if (ids.length !== movable.length || new Set(ids).size !== ids.length || ids.some((child) => !movable.includes(child)))
      throw new Error(`Scope ${scope.groupId ?? "root"} must place every movable direct child exactly once: ${movable.join(", ")}.`);
  }
  if (!seen.has(null)) throw new Error("Design the current root scope, including every movable direct child.");
  for (const id of [...design.readingPath, ...design.regions.map((r) => r.id)])
    if (!items.has(id)) throw new Error(`Unknown design node: ${id}.`);
  const edgeIds = new Set(problem.projection.edges.map((e) => e.id));
  if (new Set(design.connections.map((e) => e.edgeId)).size !== design.connections.length)
    throw new Error("Each connection can have only one design role.");
  for (const edge of design.connections) if (!edgeIds.has(edge.edgeId)) throw new Error(`Unknown design connection: ${edge.edgeId}.`);
}

export function executeDesign(problem: LayoutProblem, design: CompoundDesign): LayoutGeometry {
  validateDesign(problem, design);
  const { scopes } = buildScopes(problem.projection);
  const plans = new Map(design.scopes.map((s) => [s.groupId === problem.projection.focusGroupId ? null : s.groupId, s]));
  const sizes = new Map(Object.entries(problem.baseline.boxes).map(([id, b]) => [id, { width: b.width, height: b.height }]));
  const local = new Map<string, CompoundBox>();
  const items = new Map(problem.projection.items.map((i) => [i.id, i]));
  for (const [id, scope] of [...scopes].reverse()) {
    const origin = id === null ? { x: 0, y: 0 } : problem.baseline.boxes[id];
    for (const child of scope.children) {
      const box = problem.baseline.boxes[child];
      local.set(child, { ...box, ...sizes.get(child)!, x: box.x - origin.x, y: box.y - origin.y });
    }
    const plan = plans.get(id);
    if (plan) {
      // Rows and columns always describe physical canvas positions.
      const widths: number[] = [], heights: number[] = [];
      plan.rows.forEach((row, y) => row.forEach((child, x) => {
        const size = child === null ? { width: 0, height: 0 } : sizes.get(child)!;
        widths[x] = Math.max(widths[x] ?? 0, size.width);
        heights[y] = Math.max(heights[y] ?? 0, size.height);
      }));
      const offsets = (values: number[], gap: number) => values.map((_, i) => values.slice(0, i).reduce((sum, v) => sum + v + gap, 0));
      const xs = offsets(widths, problem.columnGap);
      const ys = offsets(heights, problem.rowGap);
      plan.rows.forEach((row, y) => row.forEach((child, x) => {
        if (child === null) return;
        const size = sizes.get(child)!;
        const xOffset = xs[x] + (widths[x] - size.width) / 2;
        const yOffset = ys[y] + (heights[y] - size.height) / 2;
        local.set(child, { ...size, x: (id === null ? 36 : 24) + xOffset, y: (id === null ? 36 : 58) + yOffset });
      }));
    }
    if (id !== null && !items.get(id)?.external) {
      const children = scope.children.map((child) => local.get(child)!);
      sizes.set(id, {
        width: Math.max(problem.minimumSizes[id].width, ...children.map((b) => b.x + b.width + 24)),
        height: Math.max(problem.minimumSizes[id].height, ...children.map((b) => b.y + b.height + 24)),
      });
    }
  }
  const boxes: Record<string, CompoundBox> = {};
  for (const [id, scope] of scopes) {
    const origin = id === null ? { x: 0, y: 0 } : boxes[id];
    for (const child of scope.children) {
      const box = local.get(child)!;
      boxes[child] = items.get(child)!.external ? { ...problem.baseline.boxes[child] } : { ...box, ...sizes.get(child)!, x: box.x + origin.x, y: box.y + origin.y };
    }
  }
  const width = Math.max(problem.minimumCanvas?.width ?? 0, ...Object.values(boxes).map((b) => b.x + b.width + 36));
  const height = Math.max(problem.minimumCanvas?.height ?? 0, ...Object.values(boxes).map((b) => b.y + b.height + 36));
  const outerEdges = new Set(design.connections.filter((e) => e.role === "feedback" || e.role === "support").map((e) => e.edgeId));
  const priority = new Map(design.connections.map((e) => [e.edgeId, { main: 0, branch: 1, feedback: 2, support: 3 }[e.role]]));
  const routed = routeCompoundEdges(problem.projection, new Map(Object.entries(boxes)), { x: 0, y: 0, width, height }, problem.showLabels, {
    outerEdges, edgePriority: priority, portMode: problem.stored.portMode, labelSizes: problem.labelSizes,
  });
  return { boxes, routes: Object.fromEntries(routed.routes), width: routed.width, height: routed.height };
}
