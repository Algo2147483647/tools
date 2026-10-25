import type { CompoundProjection } from "../../graph/compound/projection";
import { type CompoundLayoutData, type LayoutIntent, type LayoutProblem, type LayoutGeometry } from "./layout-plan";
import { sameBox } from "./layout-quality";
import { compoundTopology } from "./topology-layout";

interface Scope {
  children: string[];
  edges: [string, string][];
}

export function buildScopes(projection: CompoundProjection) {
  const scopes = new Map<string | null, Scope>([[null, { children: [], edges: [] }]]);
  const parents = new Map(projection.items.map((i) => [i.id, i.parentId]));
  for (const item of [...projection.items].sort((a, b) => a.depth - b.depth)) {
    scopes.get(item.parentId)!.children.push(item.id);
    if (item.kind === "group" && !item.collapsed) scopes.set(item.id, { children: [], edges: [] });
  }
  const ancestry = (id: string) => {
    const path = [id];
    let parent = parents.get(id);
    while (parent != null) {
      path.push(parent);
      parent = parents.get(parent);
    }
    return path;
  };
  for (const edge of projection.edges) {
    const source = ancestry(edge.source),
      target = ancestry(edge.target);
    let common: string | null = null;
    while (source.length && target.length && source.at(-1) === target.at(-1)) {
      common = source.pop()!;
      target.pop();
    }
    if (source.length && target.length) scopes.get(common)!.edges.push([source.at(-1)!, target.at(-1)!]);
  }
  return { scopes, parents };
}

export function layoutScopeMembers(problem: LayoutProblem, intent: LayoutIntent): Set<string> {
  const { groupId } = intent.scope;
  const items = new Map(problem.projection.items.map((i) => [i.id, i]));
  if (groupId !== null && groupId !== problem.projection.focusGroupId) {
    const item = items.get(groupId);
    if (!item || item.external || item.kind !== "group" || item.collapsed)
      throw new Error(`Layout scope must be an expanded visible group: ${groupId}.`);
  }
  const scope = groupId === problem.projection.focusGroupId ? null : groupId;
  return new Set(
    problem.projection.items
      .filter((item) => {
        if (item.external) return false;
        let parent = item.parentId;
        if (parent === scope) return true;
        if (!intent.scope.includeDescendants) return false;
        while (parent !== null) {
          parent = items.get(parent)?.parentId ?? null;
          if (parent === scope) return true;
        }
        return false;
      })
      .map((i) => i.id),
  );
}

export function compileConstraints(
  problem: LayoutProblem,
  intent: LayoutIntent,
  members: Set<string>,
): CompoundLayoutData {
  const data: CompoundLayoutData = structuredClone(problem.stored);
  const items = new Map(problem.projection.items.map((i) => [i.id, i]));
  for (const c of intent.constraints) {
    if (c.type === "direction" || c.type === "flow-order") {
      if (
        c.scopeId !== intent.scope.groupId &&
        !(
          c.scopeId !== null &&
          members.has(c.scopeId) &&
          items.get(c.scopeId)?.kind === "group" &&
          !items.get(c.scopeId)?.collapsed
        )
      )
        throw new Error(`Layout scope is outside this request: ${c.scopeId}.`);
      if (c.type === "flow-order") {
        const parent = c.scopeId === problem.projection.focusGroupId ? null : c.scopeId;
        if (c.nodeIds.some((id) => !items.has(id) || items.get(id)!.parentId !== parent || items.get(id)!.external))
          throw new Error("Flow order requires movable siblings in its scope.");
      }
      data.constraints = data.constraints.filter((old) => old.type !== c.type || old.scopeId !== c.scopeId);
      data.constraints.push(c);
    } else {
      const edge = problem.projection.edges.find((e) => e.originalEdgeIds.includes(c.edgeId));
      if (!edge || (!members.has(edge.source) && !members.has(edge.target)))
        throw new Error(`Edge is not visible in the layout scope: ${c.edgeId}.`);
      data.constraints = data.constraints.filter(
        (old) =>
          !(
            old.type === c.type &&
            "edgeId" in old &&
            old.edgeId === c.edgeId &&
            (c.type !== "port-side" || (old.type === "port-side" && old.end === c.end))
          ),
      );
      data.constraints.push(c);
    }
  }
  if (data.constraints.length > 500)
    throw new Error("Too many saved layout constraints; remove unused constraints first.");
  return data;
}

export function validateLayoutConstraints(
  problem: LayoutProblem,
  geometry: LayoutGeometry,
  _data: CompoundLayoutData,
  intent?: LayoutIntent,
) {
  const errors: string[] = [];
  const items = new Map(problem.projection.items.map((i) => [i.id, i]));
  if (intent) {
    const members = layoutScopeMembers(problem, intent);
    for (const item of problem.projection.items) {
      if (!geometry.boxes[item.id]) {
        errors.push(`Missing rectangle: ${item.id}.`);
        continue;
      }
      let carried = false,
        ancestor = item.parentId;
      while (ancestor !== null) {
        if (members.has(ancestor)) {
          carried = true;
          break;
        }
        ancestor = items.get(ancestor)?.parentId ?? null;
      }
      const frozen = item.external || (intent.boundaryPolicy === "strict" && !members.has(item.id) && !carried);
      if (frozen && !sameBox(problem.baseline.boxes[item.id], geometry.boxes[item.id]))
        errors.push(`Layout changed a fixed rectangle: ${item.id}.`);
      if (!intent.scope.includeDescendants && members.has(item.id) && item.kind === "group" && !item.collapsed) {
        const descendants = problem.projection.items.filter((i) => {
          let parent = i.parentId;
          while (parent !== null) {
            if (parent === item.id) return true;
            parent = items.get(parent)?.parentId ?? null;
          }
          return false;
        });
        const dx = geometry.boxes[item.id].x - problem.baseline.boxes[item.id].x,
          dy = geometry.boxes[item.id].y - problem.baseline.boxes[item.id].y;
        for (const d of descendants)
          if (
            !geometry.boxes[d.id] ||
            !sameBox(
              {
                ...problem.baseline.boxes[d.id],
                x: problem.baseline.boxes[d.id].x + dx,
                y: problem.baseline.boxes[d.id].y + dy,
              },
              geometry.boxes[d.id],
            )
          )
            errors.push(`Frozen subtree changed: ${item.id}.`);
      }
    }
  }
  return errors;
}

export function directionWarnings(
  problem: LayoutProblem,
  geometry: LayoutGeometry,
  data: CompoundLayoutData,
): string[] {
  const { scopes } = buildScopes(problem.projection);
  const warnings: string[] = [];
  for (const constraint of data.constraints) {
    if (constraint.type === "flow-order") {
      const scopeId = constraint.scopeId === problem.projection.focusGroupId ? null : constraint.scopeId;
      const scope = scopes.get(scopeId);
      if (!scope) continue;
      const ids = constraint.nodeIds.filter((id) => scope.children.includes(id));
      const direction = data.constraints.find((c) => c.type === "direction" && c.scopeId === constraint.scopeId);
      const value = direction?.type === "direction" ? direction.value : data.direction;
      const ordered = (down: boolean) =>
        ids.every((id, i) => {
          if (!i) return true;
          const a = geometry.boxes[ids[i - 1]],
            b = geometry.boxes[id];
          return down ? a.y + a.height <= b.y + 0.01 : a.x + a.width <= b.x + 0.01;
        });
      if (!(value === "DOWN" ? ordered(true) : value === "RIGHT" ? ordered(false) : ordered(true) || ordered(false)))
        warnings.push(`Flow order could not be satisfied in ${constraint.scopeId ?? "root"}.`);
      continue;
    }
    if (constraint.type !== "direction" || constraint.value === "AUTO") continue;
    const scopeId = constraint.scopeId === problem.projection.focusGroupId ? null : constraint.scopeId;
    const scope = scopes.get(scopeId);
    if (!scope) continue;
    const order = data.constraints.find((c) => c.type === "flow-order" && c.scopeId === constraint.scopeId);
    const ids = order?.type === "flow-order" ? order.nodeIds.filter((id) => scope.children.includes(id)) : [];
    const { forward } = compoundTopology(scope.children, scope.edges, ids);
    if (
      forward.some(([a, b]) => {
        const first = geometry.boxes[a],
          second = geometry.boxes[b];
        return constraint.value === "DOWN"
          ? second.y + second.height / 2 <= first.y + first.height / 2 + 0.01
          : second.x + second.width / 2 <= first.x + first.width / 2 + 0.01;
      })
    )
      warnings.push(
        `Direction ${constraint.value} could not be fully satisfied in ${constraint.scopeId ?? "root"} within this view.`,
      );
  }
  return warnings;
}
