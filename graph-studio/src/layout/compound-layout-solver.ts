import type { CompoundProjection } from "../graph/compoundProjection";
import type { CompoundBox } from "./compound-routes";
import { arrangeTopology, compoundTopology } from "./compound-topology-layout";
import { routeCompoundEdges } from "./compound-orthogonal-router";
import {
  boxesOverlap,
  close,
  compareLayoutMetrics,
  measureLayout,
  onPortSide,
  sameBox,
  validateLayoutGeometry,
} from "./compound-layout-quality";
import {
  COMPOUND_LAYOUT_VERSION,
  layoutFingerprint,
  parseLayoutIntent,
  type CompoundLayoutData,
  type LayoutCandidate,
  type LayoutDirection,
  type LayoutIntent,
  type LayoutProblem,
  type LayoutSnapshot,
  type LayoutSolveResult,
} from "./compound-layout-plan";

interface Scope {
  children: string[];
  edges: [string, string][];
}
export function pinProjectionKey(problem: LayoutProblem) {
  return problem.viewKey;
}
function activePins(problem: LayoutProblem, data: CompoundLayoutData) {
  const key = pinProjectionKey(problem);
  return data.pins.filter((p) => !p.projectionKey || p.projectionKey === key);
}
function buildScopes(projection: CompoundProjection) {
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
function compileConstraints(problem: LayoutProblem, intent: LayoutIntent, members: Set<string>): CompoundLayoutData {
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
function place(
  problem: LayoutProblem,
  intent: LayoutIntent,
  data: CompoundLayoutData,
  members: Set<string>,
  direction: LayoutDirection,
) {
  if (intent.operation === "route-only") return structuredClone(problem.baseline.boxes);
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
  const anchored = new Set<string>();
  for (const pin of activePins(problem, data).filter((p) => p.space === "canvas" && parents.has(p.nodeId))) {
    let parent = parents.get(pin.nodeId);
    while (parent != null) {
      anchored.add(parent);
      parent = parents.get(parent);
    }
  }
  let evaluations = 0;
  for (const [scopeId, scope] of [...scopes].reverse()) {
    const origin = scopeId === null ? { x: 0, y: 0 } : baseline[scopeId];
    const left = scopeId === null ? 36 : 24,
      top = scopeId === null ? 36 : 58;
    const original = new Map(
      scope.children.map((id) => [id, { ...baseline[id], x: baseline[id].x - origin.x, y: baseline[id].y - origin.y }]),
    );
    let positioned = original;
    if (active.has(scopeId)) {
      const persistentDirection = data.constraints.find(
        (c) => c.type === "direction" && c.scopeId === (scopeId ?? problem.projection.focusGroupId),
      );
      const orientation = persistentDirection?.type === "direction" ? persistentDirection.value : direction;
      const arranged = arrangeTopology(
        scope.children,
        scope.edges,
        sizes,
        problem.columnGap,
        problem.rowGap,
        orientation,
      );
      const preferred = new Map([...arranged.boxes].map(([id, b]) => [id, { ...b, x: b.x + left, y: b.y + top }]));
      const fixed = new Map<string, CompoundBox>();
      for (const id of scope.children) {
        const item = problem.projection.items.find((i) => i.id === id)!;
        const pin = activePins(problem, data).find(
          (p) => p.nodeId === id && p.parentId === (scopeId ?? problem.projection.focusGroupId),
        );
        if (pin)
          fixed.set(id, {
            ...sizes.get(id)!,
            x: pin.x - (pin.space === "canvas" ? origin.x : 0),
            y: pin.y - (pin.space === "canvas" ? origin.y : 0),
          });
        else if (anchored.has(id) || item.external) fixed.set(id, { ...original.get(id)!, ...sizes.get(id)! });
      }
      const limit =
        intent.boundaryPolicy === "strict" && scopeId === rootScope && scopeId !== null ? baseline[scopeId] : null;
      const fits = (box: CompoundBox) =>
        box.x >= left - 0.01 &&
        box.y >= top - 0.01 &&
        (!limit || (box.x + box.width <= limit.width - 24 + 0.01 && box.y + box.height <= limit.height - 24 + 0.01));
      const { layers, forward } = compoundTopology(scope.children, scope.edges);
      const down = orientation === "DOWN";
      const before = (a: CompoundBox, b: CompoundBox) => {
        const major = down ? a.y + a.height / 2 - b.y - b.height / 2 : a.x + a.width / 2 - b.x - b.width / 2;
        const minor = down ? b.x + b.width / 2 - a.x - a.width / 2 : b.y + b.height / 2 - a.y - a.height / 2;
        return major < -0.01 || (Math.abs(major) < 0.01 && minor < -0.01);
      };
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
            if (++evaluations > 4096) throw new Error("Placement evaluation budget exhausted.");
            return (
              fits(b) &&
              !occupied.some((a) => boxesOverlap(a, b, Math.min(problem.columnGap, problem.rowGap))) &&
              forward.every(([a, c]) =>
                a === id && positioned.has(c)
                  ? before(b, positioned.get(c)!)
                  : c === id && positioned.has(a)
                    ? before(positioned.get(a)!, b)
                    : true,
              )
            );
          });
          if (!chosen) throw new Error(`No legal slot found for ${id}. Try a larger scope or allow ancestor resizing.`);
          positioned.set(id, chosen);
        }
        if (forward.some(([a, b]) => !before(positioned.get(a)!, positioned.get(b)!)))
          throw new Error(`Pins conflict with forward ordering in ${scopeId ?? "root"}.`);
      }
    }
    for (const [id, b] of positioned) locals.set(id, { ...b, ...sizes.get(id)! });
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
function directionWarnings(problem: LayoutProblem, snapshot: LayoutSnapshot, data: CompoundLayoutData): string[] {
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
export function solveCompoundLayout(
  problem: LayoutProblem,
  rawIntent: LayoutIntent,
  maxCandidates = 3,
): LayoutSolveResult {
  const intent = parseLayoutIntent(rawIntent);
  if (problem.projection.items.length > 1000 || problem.projection.edges.length > 2000)
    throw new Error("Select a smaller view: layout planning supports up to 1,000 visible items and 2,000 edges.");
  const members = layoutScopeMembers(problem, intent);
  if (!members.size) throw new Error("No visible members in this layout scope. Expand or enter the group first.");
  const data = compileConstraints(problem, intent, members);
  const baselineMetrics = measureLayout(problem, problem.baseline);
  const diagnostics: string[] = [],
    candidates: LayoutCandidate[] = [];
  const directions: LayoutDirection[] =
    intent.operation === "route-only" ? ["AUTO", "AUTO"] : ["AUTO", "RIGHT", "DOWN"];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < Math.min(maxCandidates, directions.length); attempt++) {
    try {
      const boxes = place(problem, intent, data, members, directions[attempt]);
      const changed = new Set(
        problem.projection.items.filter((i) => !sameBox(boxes[i.id], problem.baseline.boxes[i.id])).map((i) => i.id),
      );
      const fixedRoutes = new Map(
        problem.projection.edges
          .filter(
            (e) => !members.has(e.source) && !members.has(e.target) && !changed.has(e.source) && !changed.has(e.target),
          )
          .map((e) => [e.id, problem.baseline.routes[e.id]]),
      );
      const outerEdges = new Set<string>(),
        portSides = new Map<string, { source?: number; target?: number }>();
      const aggregatedPreferenceWarnings: string[] = [];
      for (const c of data.constraints) {
        if (c.type === "direction") continue;
        for (const edge of problem.projection.edges.filter((e) => e.originalEdgeIds.includes(c.edgeId))) {
          if (c.type === "prefer-outer-route") outerEdges.add(edge.id);
          else {
            const side = ["east", "south", "west", "north"].indexOf(c.side),
              previous = portSides.get(edge.id)?.[c.end];
            if (previous !== undefined && previous !== side)
              aggregatedPreferenceWarnings.push(
                `Aggregated connection ${edge.originalEdgeIds.join(", ")} has conflicting ${c.end} port preferences; the first preference was retained.`,
              );
            else portSides.set(edge.id, { ...portSides.get(edge.id), [c.end]: side });
          }
        }
      }
      const width = Math.max(problem.baseline.width, ...Object.values(boxes).map((b) => b.x + b.width + 36));
      const height = Math.max(problem.baseline.height, ...Object.values(boxes).map((b) => b.y + b.height + 36));
      const routed = routeCompoundEdges(
        problem.projection,
        new Map(Object.entries(boxes)),
        { x: 0, y: 0, width, height },
        problem.showLabels,
        { reverseOrder: attempt % 2 === 1, fixedRoutes, outerEdges, portSides, labelSizes: problem.labelSizes },
      );
      const snapshot: LayoutSnapshot = {
        boxes: Object.fromEntries(Object.entries(boxes)),
        routes: Object.fromEntries(routed.routes),
        width: routed.width,
        height: routed.height,
      };
      const validation = validateLayoutGeometry(problem, snapshot);
      validation.errors.push(...validateLayoutConstraints(problem, snapshot, data, intent));
      validation.valid = validation.errors.length === 0;
      if (!validation.valid) {
        diagnostics.push(...validation.errors);
        continue;
      }
      const signature = layoutFingerprint(snapshot);
      if (seen.has(signature)) continue;
      seen.add(signature);
      const metrics = measureLayout(problem, snapshot);
      const newRequirements =
        intent.constraints.length > 0 ||
        validateLayoutConstraints(problem, problem.baseline, data).length > 0 ||
        data.constraints.length > 0;
      if (!newRequirements && compareLayoutMetrics(metrics, baselineMetrics, intent.objective) >= 0) continue;
      const candidateData = structuredClone(data);
      candidateData.accepted = { fingerprint: problem.fingerprint, engineVersion: COMPOUND_LAYOUT_VERSION, snapshot };
      const changedNodeIds = [...changed];
      const unmetPreferences: string[] = [
        ...directionWarnings(problem, snapshot, data),
        ...aggregatedPreferenceWarnings,
      ];
      for (const pin of data.pins)
        if (
          !activePins(problem, data).includes(pin) ||
          !problem.projection.items.some((i) => i.id === pin.nodeId && !i.external)
        )
          unmetPreferences.push(
            `Pin ${pin.nodeId} is inactive in this projection; it is preserved for its original view.`,
          );
      for (const [edgeId, preferences] of portSides) {
        const edge = problem.projection.edges.find((e) => e.id === edgeId)!;
        for (const end of ["source", "target"] as const) {
          const side = preferences[end];
          if (side === undefined) continue;
          const box = boxes[edge[end]],
            points = snapshot.routes[edgeId].points,
            point = end === "source" ? points[0] : points.at(-1)!;
          if (!onPortSide(point, box, side))
            unmetPreferences.push(`Preferred ${end} port was unavailable for ${edge.originalEdgeIds.join(", ")}.`);
        }
      }
      const scopeDirection = data.constraints.find((c) => c.type === "direction" && c.scopeId === intent.scope.groupId);
      const effectiveDirection = scopeDirection?.type === "direction" ? scopeDirection.value : directions[attempt];
      candidates.push({
        id: `layout-${signature}`,
        title:
          intent.operation === "route-only"
            ? `Route arrangement ${attempt + 1}`
            : `${effectiveDirection === "AUTO" ? "Automatic" : effectiveDirection === "RIGHT" ? "Left-to-right" : "Top-to-bottom"} arrangement ${attempt + 1}`,
        snapshot,
        data: candidateData,
        metrics,
        validation,
        changedNodeIds,
        changedEdgeIds: problem.projection.edges
          .filter((e) => JSON.stringify(problem.baseline.routes[e.id]) !== JSON.stringify(snapshot.routes[e.id]))
          .flatMap((e) => e.originalEdgeIds),
        expandedGroupIds: problem.projection.items
          .filter(
            (i) =>
              i.kind === "group" &&
              !i.collapsed &&
              (boxes[i.id].width > problem.baseline.boxes[i.id].width + 0.01 ||
                boxes[i.id].height > problem.baseline.boxes[i.id].height + 0.01),
          )
          .map((i) => i.id),
        unmetPreferences,
      });
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : "Layout search failed.");
    }
  }
  candidates.sort(
    (a, b) =>
      a.unmetPreferences.length - b.unmetPreferences.length ||
      compareLayoutMetrics(a.metrics, b.metrics, intent.objective),
  );
  if (!candidates.length && !diagnostics.length)
    diagnostics.push("No better legal arrangement was found. The current layout has been kept.");
  return { candidates, baselineMetrics, diagnostics: [...new Set(diagnostics)].slice(0, 12) };
}
