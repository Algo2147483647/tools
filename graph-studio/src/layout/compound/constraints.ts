import type { CompoundProjection } from "../../graph/compound/projection";
import { type CompoundLayoutData, type LayoutIntent, type LayoutProblem, type LayoutSnapshot } from "./layout-plan";
import { close, sameBox } from "./layout-quality";
import { compoundTopology } from "./topology-layout";

interface Scope {
  children: string[];
  edges: [string, string][];
}

export function pinProjectionKey(problem: LayoutProblem) {
  return problem.viewKey;
}

export function activePins(problem: LayoutProblem, data: CompoundLayoutData) {
  const key = pinProjectionKey(problem);
  return data.pins.filter((p) => !p.projectionKey || p.projectionKey === key);
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
  delete data.accepted;
  const items = new Map(problem.projection.items.map((i) => [i.id, i]));
  for (const c of intent.constraints) {
    if (c.type === "pin" || c.type === "unpin") {
      const item = items.get(c.nodeId);
      if (!item || item.external || (!members.has(c.nodeId) && c.nodeId !== intent.scope.groupId))
        throw new Error(`Node is outside the layout scope: ${c.nodeId}.`);
      data.pins = data.pins.filter((p) => p.nodeId !== c.nodeId);
      if (c.type === "pin") {
        if (c.space === "parent" && item.parentId === null && problem.projection.focusGroupId !== null)
          throw new Error(
            "Use a canvas pin for a direct member of an entered group, or return to its parent view first.",
          );
        const box = problem.baseline.boxes[c.nodeId],
          parent = item.parentId === null ? null : problem.baseline.boxes[item.parentId];
        data.pins.push({
          nodeId: c.nodeId,
          parentId: item.parentId ?? problem.projection.focusGroupId,
          space: c.space,
          x: box.x - (c.space === "parent" ? (parent?.x ?? 0) : 0),
          y: box.y - (c.space === "parent" ? (parent?.y ?? 0) : 0),
          ...(c.space === "canvas" ? { projectionKey: pinProjectionKey(problem) } : {}),
        });
      }
    } else if (c.type === "direction") {
      if (intent.operation === "route-only") throw new Error("Route-only requests cannot change layout direction.");
      if (
        c.scopeId !== intent.scope.groupId &&
        !(
          c.scopeId !== null &&
          members.has(c.scopeId) &&
          items.get(c.scopeId)?.kind === "group" &&
          !items.get(c.scopeId)?.collapsed
        )
      )
        throw new Error(`Direction scope is outside this request: ${c.scopeId}.`);
      data.constraints = data.constraints.filter((old) => old.type !== "direction" || old.scopeId !== c.scopeId);
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
  if (data.constraints.length > 500 || data.pins.length > 1000)
    throw new Error("Too many saved layout constraints; remove unused constraints first.");
  return data;
}

export function validateLayoutConstraints(
  problem: LayoutProblem,
  snapshot: LayoutSnapshot,
  data: CompoundLayoutData,
  intent?: LayoutIntent,
) {
  const errors: string[] = [];
  const items = new Map(problem.projection.items.map((i) => [i.id, i]));
  for (const pin of activePins(problem, data)) {
    const item = items.get(pin.nodeId),
      b = snapshot.boxes[pin.nodeId];
    if (!item || item.external || (item.parentId ?? problem.projection.focusGroupId) !== pin.parentId) continue;
    if (!b) {
      errors.push(`Missing pinned rectangle: ${pin.nodeId}.`);
      continue;
    }
    // A canvas pin belongs to its captured projection; parent pins work at any visible parent origin.
    const parent = item.parentId === null ? null : snapshot.boxes[item.parentId];
    const x = b.x - (pin.space === "parent" ? (parent?.x ?? 0) : 0),
      y = b.y - (pin.space === "parent" ? (parent?.y ?? 0) : 0);
    if (!close(x, pin.x) || !close(y, pin.y)) errors.push(`Pinned node moved: ${pin.nodeId}.`);
  }
  if (intent) {
    const members = layoutScopeMembers(problem, intent);
    for (const item of problem.projection.items) {
      if (!snapshot.boxes[item.id]) {
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
      const frozen =
        intent.operation === "route-only" ||
        item.external ||
        (intent.boundaryPolicy === "strict" && !members.has(item.id) && !carried);
      if (frozen && !sameBox(problem.baseline.boxes[item.id], snapshot.boxes[item.id]))
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
        const dx = snapshot.boxes[item.id].x - problem.baseline.boxes[item.id].x,
          dy = snapshot.boxes[item.id].y - problem.baseline.boxes[item.id].y;
        for (const d of descendants)
          if (
            !snapshot.boxes[d.id] ||
            !sameBox(
              {
                ...problem.baseline.boxes[d.id],
                x: problem.baseline.boxes[d.id].x + dx,
                y: problem.baseline.boxes[d.id].y + dy,
              },
              snapshot.boxes[d.id],
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
  snapshot: LayoutSnapshot,
  data: CompoundLayoutData,
): string[] {
  const { scopes } = buildScopes(problem.projection);
  const warnings: string[] = [];
  for (const constraint of data.constraints) {
    if (constraint.type !== "direction" || constraint.value === "AUTO") continue;
    const scopeId = constraint.scopeId === problem.projection.focusGroupId ? null : constraint.scopeId;
    const scope = scopes.get(scopeId);
    if (!scope) {
      warnings.push(`Direction preference for ${constraint.scopeId ?? "root"} is inactive in this projection.`);
      continue;
    }
    const { forward } = compoundTopology(scope.children, scope.edges);
    if (
      forward.some(([a, b]) => {
        const first = snapshot.boxes[a],
          second = snapshot.boxes[b];
        return constraint.value === "DOWN"
          ? second.y + second.height / 2 <= first.y + first.height / 2 + 0.01
          : second.x + second.width / 2 <= first.x + first.width / 2 + 0.01;
      })
    )
      warnings.push(
        `Direction ${constraint.value} could not be fully satisfied in ${constraint.scopeId ?? "root"} within its bounds and pins.`,
      );
  }
  return warnings;
}
