import type { LayoutGeometry, LayoutProblem } from "../layout-plan";
import type { CompoundBox } from "../../../graph/compound/geometry";
import { buildScopes } from "../constraints";
import { routeDesignedEdges } from "../routing/designed";
import { applyComposition, compositionRows, type ScopeComposition } from "./composition";
import { ancestry, emptyRouting, validateRouting, type RoutingIntent, type RoutingIssue } from "../routing/intent";
import { boundaryPoint, channelWidth } from "../routing/plan";

/** Spatial cells describe composition, never additional graph dependencies. */
export interface CompoundDesign {
  purpose: string;
  readingPath: string[];
  regions: { id: string; role: "primary" | "branch" | "support"; reason: string }[];
  scopes: ScopeComposition[];
  connections: { edgeId: string; role: "main" | "branch" | "feedback" | "support" }[];
  routing?: RoutingIntent;
}

export function validateRequiredAnchors(design: CompoundDesign, geometry: LayoutGeometry) {
  for (const scope of design.scopes)
    for (const alignment of scope.anchorAlignment ?? []) {
      if (alignment.strength !== "required") continue;
      const values = alignment.anchors.map((anchor) => {
        const gateway =
          anchor.kind === "gateway-center"
            ? design.routing?.gateways.find((g) => g.id === anchor.gatewayId)
            : undefined;
        const id = anchor.kind === "center" ? anchor.nodeId : gateway?.regionId;
        const box = id ? geometry.boxes[id] : undefined;
        if (!box) throw new Error("Required alignment references an unavailable anchor.");
        return gateway
          ? boundaryPoint(box, gateway.side)[alignment.axis]
          : box[alignment.axis] + (alignment.axis === "x" ? box.width : box.height) / 2;
      });
      if (Math.max(...values) - Math.min(...values) > 1)
        throw new Error(
          `Required anchor alignment in ${scope.groupId ?? "root"} is not realized. Change the alignment intent or move its regions together.`,
        );
    }
}

export function validateDesign(problem: LayoutProblem, design: CompoundDesign) {
  validateRouting(problem.projection, design.routing ?? emptyRouting());
  const { scopes } = buildScopes(problem.projection);
  const items = new Map(problem.projection.items.map((item) => [item.id, item]));
  const normalize = (id: string | null) => (id === problem.projection.focusGroupId ? null : id);
  const seen = new Set<string | null>();
  for (const scope of design.scopes) {
    const id = normalize(scope.groupId),
      children = scopes.get(id)?.children;
    if (!children || (id !== null && items.get(id)?.external))
      throw new Error(`Unknown movable scope: ${scope.groupId}.`);
    if (seen.has(id)) throw new Error(`Duplicate design scope: ${scope.groupId}.`);
    seen.add(id);
    if (problem.stored.direction !== "AUTO" && scope.direction !== problem.stored.direction)
      throw new Error(`Preserve selected direction ${problem.stored.direction}.`);
    const movable = children.filter((child) => !items.get(child)!.external);
    const ids = compositionRows(
      scope,
      movable,
      new Set(design.regions.filter((r) => r.role === "support").map((r) => r.id)),
    )
      .flat()
      .filter((value): value is string => value !== null);
    if (
      ids.length !== movable.length ||
      new Set(ids).size !== ids.length ||
      ids.some((child) => !movable.includes(child))
    )
      throw new Error(
        `Scope ${scope.groupId ?? "root"} must place every movable direct child exactly once: ${movable.join(", ")}.`,
      );
    const intentIds = [
      ...(scope.primaryPath ?? []),
      ...(scope.parallelBranches ?? []).flatMap((b) => [b.from, ...b.members]),
      ...(scope.placement ?? []).flatMap((p) => [p.subject, p.anchor]),
      ...(scope.alignment ?? []).flatMap((a) => a.members),
    ];
    for (const child of intentIds)
      if (!movable.includes(child)) throw new Error(`Intent references a non-sibling or fixed node: ${child}.`);
    for (const alignment of scope.anchorAlignment ?? [])
      for (const anchor of alignment.anchors) {
        const nodeId =
          anchor.kind === "center"
            ? anchor.nodeId
            : design.routing?.gateways.find((g) => g.id === anchor.gatewayId)?.regionId;
        if (
          !nodeId ||
          !items.has(nodeId) ||
          items.get(nodeId)?.external ||
          ![nodeId, ...ancestry(problem.projection, nodeId)].some((n) => movable.includes(n))
        )
          throw new Error(`Anchor must belong to a movable child of scope ${scope.groupId}.`);
      }
  }
  for (const id of [...design.readingPath, ...design.regions.map((r) => r.id)])
    if (!items.has(id)) throw new Error(`Unknown design node: ${id}.`);
  const edgeIds = new Set(problem.projection.edges.map((e) => e.id));
  if (new Set(design.connections.map((e) => e.edgeId)).size !== design.connections.length)
    throw new Error("Each connection can have only one design role.");
  for (const edge of design.connections)
    if (!edgeIds.has(edge.edgeId)) throw new Error(`Unknown design connection: ${edge.edgeId}.`);
}

export function executeDesign(
  problem: LayoutProblem,
  design: CompoundDesign,
): LayoutGeometry & { routingIssues: RoutingIssue[] } {
  validateDesign(problem, design);
  const { scopes } = buildScopes(problem.projection);
  const plans = new Map(
    design.scopes.map((s) => [s.groupId === problem.projection.focusGroupId ? null : s.groupId, s]),
  );
  const sizes = new Map(
    Object.entries(problem.baseline.boxes).map(([id, b]) => [id, { width: b.width, height: b.height }]),
  );
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
      const children = scope.children.filter((child) => !items.get(child)!.external);
      const rows = compositionRows(
        plan,
        children,
        new Set(design.regions.filter((r) => r.role === "support").map((r) => r.id)),
      );
      const gap: [number, number] = [...(plan.spacing ?? [problem.columnGap, problem.rowGap])];
      const perimeter = { left: 0, right: 0, top: 0, bottom: 0 };
      for (const channel of design.routing?.channels.filter((c) => normalizeScope(c.scopeId) === id) ?? []) {
        const required = channelWidth(channel.edgeIds.length);
        if (channel.location.type === "between") {
          const [a, b] = channel.location.regions;
          const ay = rows.findIndex((row) => row.includes(a)),
            by = rows.findIndex((row) => row.includes(b));
          const ax = rows[ay]?.indexOf(a),
            bx = rows[by]?.indexOf(b);
          const axis = ax !== bx ? 0 : 1;
          gap[axis] = Math.max(gap[axis], required);
        } else {
          const key = { east: "right", west: "left", north: "top", south: "bottom" }[
            channel.location.side
          ] as keyof typeof perimeter;
          perimeter[key] = Math.max(perimeter[key], required);
        }
      }
      // Rows and columns always describe physical canvas positions.
      const widths: number[] = [],
        heights: number[] = [];
      rows.forEach((row, y) =>
        row.forEach((child, x) => {
          const size = child === null ? { width: 0, height: 0 } : sizes.get(child)!;
          widths[x] = Math.max(widths[x] ?? 0, size.width);
          heights[y] = Math.max(heights[y] ?? 0, size.height);
        }),
      );
      const offsets = (values: number[], gap: number) =>
        values.map((_, i) => values.slice(0, i).reduce((sum, v) => sum + v + gap, 0));
      const xs = offsets(widths, gap[0]);
      const ys = offsets(heights, gap[1]);
      rows.forEach((row, y) =>
        row.forEach((child, x) => {
          if (child === null) return;
          const size = sizes.get(child)!;
          const xOffset = xs[x] + (widths[x] - size.width) / 2;
          const yOffset = ys[y] + (heights[y] - size.height) / 2;
          local.set(child, {
            ...size,
            x: (id === null ? 36 : 24) + perimeter.left + xOffset,
            y: (id === null ? 36 : 58) + perimeter.top + yOffset,
          });
        }),
      );
      applyComposition(plan, local, children, gap);
      for (const alignment of plan.anchorAlignment ?? []) {
        const anchors = alignment.anchors.map((anchor) => {
          const gateway =
            anchor.kind === "gateway-center"
              ? design.routing!.gateways.find((g) => g.id === anchor.gatewayId)!
              : undefined;
          const nodeId = anchor.kind === "center" ? anchor.nodeId : gateway!.regionId;
          const b = { ...local.get(nodeId)!, ...sizes.get(nodeId)! };
          const point = gateway ? boundaryPoint(b, gateway.side) : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          let child = nodeId,
            parent = items.get(child)?.parentId;
          while (normalizeScope(parent ?? null) !== id && parent != null) {
            const p = local.get(parent)!;
            point.x += p.x;
            point.y += p.y;
            child = parent;
            parent = items.get(child)?.parentId;
          }
          return { child, coordinate: point[alignment.axis] };
        });
        const before = new Map(children.map((child) => [child, { ...local.get(child)! }]));
        const desired = Math.max(...anchors.map((a) => a.coordinate));
        const shifts = new Map<string, number>();
        for (const a of anchors) {
          const shift = desired - a.coordinate;
          if (shifts.has(a.child) && Math.abs(shifts.get(a.child)! - shift) > 1) {
            if (alignment.strength === "required")
              throw new Error("Anchor alignment cannot independently move descendants of the same region.");
            shifts.clear();
            break;
          }
          shifts.set(a.child, shift);
        }
        for (const [child, shift] of shifts) local.get(child)![alignment.axis] += shift;
        try {
          applyComposition(plan, local, children, gap);
        } catch (error) {
          for (const [child, b] of before) local.set(child, b);
          if (alignment.strength === "required") throw error;
        }
        const values = anchors.map(
          (a) => a.coordinate + local.get(a.child)![alignment.axis] - before.get(a.child)![alignment.axis],
        );
        if (Math.max(...values) - Math.min(...values) > 1) {
          for (const [child, b] of before) local.set(child, b);
          if (alignment.strength === "required")
            throw new Error(`Anchor alignment conflicts with placement in ${id ?? "root"}.`);
        }
      }
      if (id !== null) {
        const childBoxes = children.map((child) => local.get(child)!);
        sizes.set(id, {
          width: Math.max(
            problem.minimumSizes[id].width,
            ...childBoxes.map((b) => b.x + b.width + 24 + perimeter.right),
          ),
          height: Math.max(
            problem.minimumSizes[id].height,
            ...childBoxes.map((b) => b.y + b.height + 24 + perimeter.bottom),
          ),
        });
      }
    }
    if (id !== null && !items.get(id)?.external) {
      const children = scope.children.map((child) => local.get(child)!);
      sizes.set(id, {
        width: Math.max(sizes.get(id)!.width, ...children.map((b) => b.x + b.width + 24)),
        height: Math.max(sizes.get(id)!.height, ...children.map((b) => b.y + b.height + 24)),
      });
    }
  }
  const boxes: Record<string, CompoundBox> = {};
  for (const [id, scope] of scopes) {
    const origin = id === null ? { x: 0, y: 0 } : boxes[id];
    for (const child of scope.children) {
      const box = local.get(child)!;
      boxes[child] = items.get(child)!.external
        ? { ...problem.baseline.boxes[child] }
        : { ...box, ...sizes.get(child)!, x: box.x + origin.x, y: box.y + origin.y };
    }
  }
  const rootMargin = (side: "east" | "south") =>
    Math.max(
      0,
      ...(design.routing?.channels
        .filter(
          (c) => normalizeScope(c.scopeId) === null && c.location.type === "perimeter" && c.location.side === side,
        )
        .map((c) => channelWidth(c.edgeIds.length)) ?? []),
    );
  const width = Math.max(
    problem.minimumCanvas?.width ?? 0,
    ...Object.values(boxes).map((b) => b.x + b.width + 36 + rootMargin("east")),
  );
  const height = Math.max(
    problem.minimumCanvas?.height ?? 0,
    ...Object.values(boxes).map((b) => b.y + b.height + 36 + rootMargin("south")),
  );
  const priority = new Map(
    design.connections.map((e) => [e.edgeId, { main: 0, branch: 1, feedback: 2, support: 3 }[e.role]]),
  );
  const routed = routeDesignedEdges(
    problem.projection,
    new Map(Object.entries(boxes)),
    { x: 0, y: 0, width, height },
    problem.showLabels,
    {
      intent: design.routing ?? emptyRouting(),
      edgePriority: priority,
      portMode: problem.stored.portMode,
      labelSizes: problem.labelSizes,
    },
  );
  const result = {
    boxes,
    routes: Object.fromEntries(routed.routes),
    width: routed.width,
    height: routed.height,
    routingIssues: routed.issues,
  };
  validateRequiredAnchors(design, result);
  return result;
  function normalizeScope(id: string | null) {
    return id === problem.projection.focusGroupId ? null : id;
  }
}
