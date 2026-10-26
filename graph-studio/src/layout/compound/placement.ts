import { createPlacementScore } from "./placement-score";
import { buildScopes } from "./constraints";
import { type CompoundLayoutData, type LayoutDirection, type LayoutIntent, type LayoutProblem } from "./layout-plan";
import { boxesOverlap } from "./layout-quality";
import type { CompoundBox } from "../../graph/compound/geometry";
import { arrangeTopology, compoundTopology } from "./topology-layout";
import { groupContentTop } from "../shared/group-title";

export function place(
  problem: LayoutProblem,
  intent: LayoutIntent,
  data: CompoundLayoutData,
  members: Set<string>,
  direction: LayoutDirection,
) {
  const { scopes, parents } = buildScopes(problem.projection);
  const rootScope = intent.scope.groupId === problem.projection.focusGroupId ? null : intent.scope.groupId;
  const active = new Set<string | null>([rootScope]);
  if (intent.scope.includeDescendants)
    for (const id of scopes.keys()) if (id !== null && members.has(id)) active.add(id);
  if (intent.boundaryPolicy === "allow-ancestor-resize") {
    let id = rootScope;
    while (id !== null) {
      id = parents.get(id) ?? null;
      active.add(id);
    }
  }
  const baseline = problem.baseline.boxes;
  const sizes = new Map(Object.entries(baseline).map(([id, b]) => [id, { width: b.width, height: b.height }]));
  const locals = new Map<string, CompoundBox>();
  const completed = new Map<string | null, { boxes: Map<string, CompoundBox> }>();
  for (const [scopeId, scope] of [...scopes].reverse()) {
    const origin = scopeId === null ? { x: 0, y: 0 } : baseline[scopeId];
    const left = scopeId === null ? 36 : 24,
      top =
        scopeId === null ? 36 : groupContentTop(problem.projection.items.find((item) => item.id === scopeId)!.title);
    const original = new Map(
      scope.children.map((id) => [id, { ...baseline[id], x: baseline[id].x - origin.x, y: baseline[id].y - origin.y }]),
    );
    let positioned = original;
    if (active.has(scopeId)) {
      const persistentDirection = data.constraints.find(
        (c) => c.type === "direction" && c.scopeId === (scopeId ?? problem.projection.focusGroupId),
      );
      const orientation = persistentDirection?.type === "direction" ? persistentDirection.value : direction;
      const order = data.constraints.find(
        (c) => c.type === "flow-order" && c.scopeId === (scopeId ?? problem.projection.focusGroupId),
      );
      const flowOrder =
        order?.type === "flow-order" ? order.nodeIds.filter((id) => scope.children.includes(id)) : undefined;
      const arranged = arrangeTopology(
        scope.children,
        scope.edges,
        sizes,
        problem.columnGap,
        problem.rowGap,
        orientation,
        flowOrder,
        createPlacementScore(scope.edges, {
          projection: problem.projection,
          children: completed,
          showLabels: problem.showLabels,
          labelSizes: problem.labelSizes,
          objective: intent.objective,
          portMode: data.portMode,
        }),
      );
      const preferred = new Map([...arranged.boxes].map(([id, b]) => [id, { ...b, x: b.x + left, y: b.y + top }]));
      const fixed = new Map<string, CompoundBox>();
      for (const id of scope.children) {
        const item = problem.projection.items.find((i) => i.id === id)!;
        if (item.external) fixed.set(id, { ...original.get(id)!, ...sizes.get(id)! });
      }
      const limit =
        intent.boundaryPolicy === "strict" && scopeId === rootScope && scopeId !== null ? baseline[scopeId] : null;
      const fits = (box: CompoundBox) =>
        box.x >= left - 0.01 &&
        box.y >= top - 0.01 &&
        (!limit || (box.x + box.width <= limit.width - 24 + 0.01 && box.y + box.height <= limit.height - 24 + 0.01));
      const { layers } = compoundTopology(scope.children, scope.edges, flowOrder);
      if (!fixed.size && [...preferred.values()].every(fits)) positioned = preferred;
      else {
        positioned = new Map(fixed);
        const allFixed = [...fixed.values()];
        if (allFixed.some((a, i) => !fits(a) || allFixed.slice(i + 1).some((b) => boxesOverlap(a, b))))
          throw new Error(`Locked rectangles do not fit scope ${scopeId ?? "root"}.`);
        for (const id of layers.flat()) {
          if (positioned.has(id)) continue;
          const seed = preferred.get(id)!,
            size = sizes.get(id)!;
          const occupied = [...positioned.values()];
          const xs = [
            ...new Set([
              left,
              seed.x,
              original.get(id)!.x,
              ...occupied.flatMap((b) => [
                b.x,
                b.x + b.width + problem.columnGap,
                b.x - size.width - problem.columnGap,
              ]),
            ]),
          ];
          const ys = [
            ...new Set([
              top,
              seed.y,
              original.get(id)!.y,
              ...occupied.flatMap((b) => [b.y, b.y + b.height + problem.rowGap, b.y - size.height - problem.rowGap]),
            ]),
          ];
          const candidates = xs
            .flatMap((x) => ys.map((y) => ({ x, y, ...size })))
            .sort(
              (a, b) =>
                Math.hypot(a.x - seed.x, a.y - seed.y) - Math.hypot(b.x - seed.x, b.y - seed.y) ||
                a.x - b.x ||
                a.y - b.y,
            );
          const chosen = candidates.find((b) => {
            return fits(b) && !occupied.some((a) => boxesOverlap(a, b));
          });
          if (!chosen) throw new Error(`No legal slot found for ${id}. Try a larger scope or allow ancestor resizing.`);
          positioned.set(id, chosen);
        }
      }
    }
    for (const [id, b] of positioned) locals.set(id, { ...b, ...sizes.get(id)! });
    completed.set(scopeId, { boxes: new Map(scope.children.map((id) => [id, locals.get(id)!])) });
    if (scopeId !== null && active.has(scopeId)) {
      const strict = intent.boundaryPolicy === "strict" && scopeId === rootScope;
      sizes.set(
        scopeId,
        strict
          ? { width: baseline[scopeId].width, height: baseline[scopeId].height }
          : {
              width: Math.max(
                problem.minimumSizes[scopeId].width,
                ...[...positioned.values()].map((b) => b.x + b.width + 24),
              ),
              height: Math.max(
                problem.minimumSizes[scopeId].height,
                ...[...positioned.values()].map((b) => b.y + b.height + 24),
              ),
            },
      );
    }
  }
  const boxes: Record<string, CompoundBox> = Object.create(null);
  for (const [scopeId, scope] of scopes) {
    const origin = scopeId === null ? { x: 0, y: 0 } : boxes[scopeId];
    for (const id of scope.children) {
      const b = locals.get(id)!;
      boxes[id] = { ...b, ...sizes.get(id)!, x: b.x + origin.x, y: b.y + origin.y };
    }
  }
  return boxes;
}
