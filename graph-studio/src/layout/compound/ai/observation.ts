import type { LayoutProblem } from "../layout-plan";
import type { LayoutResultDocument } from "../../../schema/layoutResult";
import type { CompoundDesign } from "./design";
import { draftGeometry } from "./geometry";
import { measureLayout } from "../layout-quality";
import { diagnoseRoutes } from "../routing/diagnostics";
import { boundaryPoint } from "../routing/plan";
import type { RoutingIssue } from "../routing/intent";

export function graphOverview(problem: LayoutProblem) {
  return {
    scopeId: problem.projection.focusGroupId,
    direction: problem.stored.direction,
    portMode: problem.stored.portMode,
    coordinates: "px; node centers and group top-left corners. All observations are text only.",
    nodes: problem.projection.items.map((n) => ({
      id: n.id,
      title: n.title,
      parentId: n.parentId,
      kind: n.kind,
      external: n.external,
      collapsed: n.collapsed,
      semanticType: problem.nodeSemantics?.[n.id]?.type,
      description: problem.nodeSemantics?.[n.id]?.description,
      minimumSize: problem.minimumSizes[n.id],
    })),
    edges: problem.projection.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
  };
}
function selection(problem: LayoutProblem, scopeId: string | null, nodeIds: string[]) {
  const ids = new Set(problem.projection.items.map((n) => n.id));
  if (
    scopeId !== null &&
    scopeId !== problem.projection.focusGroupId &&
    !problem.projection.items.some((n) => n.id === scopeId && n.kind === "group" && !n.collapsed)
  )
    throw new Error(`Unknown expanded scope: ${scopeId}.`);
  for (const id of nodeIds) if (!ids.has(id)) throw new Error(`Unknown node: ${id}.`);
  const scope = scopeId === problem.projection.focusGroupId ? null : scopeId;
  return new Set([...problem.projection.items.filter((n) => n.parentId === scope).map((n) => n.id), ...nodeIds]);
}
function regionFor(problem: LayoutProblem, id: string, selected: Set<string>): string | undefined {
  let current: string | null = id;
  while (current !== null) {
    if (selected.has(current)) return current;
    current = problem.projection.items.find((n) => n.id === current)?.parentId ?? null;
  }
  return undefined;
}
export function inspectGraph(problem: LayoutProblem, scopeId: string | null, nodeIds: string[]) {
  const selected = selection(problem, scopeId, nodeIds),
    overview = graphOverview(problem);
  const edges = overview.edges
    .map((e) => ({
      ...e,
      sourceRegion: regionFor(problem, e.source, selected),
      targetRegion: regionFor(problem, e.target, selected),
    }))
    .filter((e) => (e.sourceRegion || e.targetRegion) && e.sourceRegion !== e.targetRegion);
  const endpoints = new Set(edges.flatMap((e) => [e.source, e.target]));
  const regional = new Map<string, { source: string; target: string; edgeIds: string[] }>();
  for (const e of edges)
    if (e.sourceRegion && e.targetRegion && e.sourceRegion !== e.targetRegion) {
      const key = JSON.stringify([e.sourceRegion, e.targetRegion]);
      const value = regional.get(key) ?? { source: e.sourceRegion, target: e.targetRegion, edgeIds: [] };
      value.edgeIds.push(e.id);
      regional.set(key, value);
    }
  return {
    scopeId,
    nodes: overview.nodes.filter((n) => selected.has(n.id)),
    connections: edges,
    regionalConnections: [...regional.values()],
    boundaryEndpoints: overview.nodes.filter((n) => endpoints.has(n.id) && !selected.has(n.id)),
    sizes: Object.fromEntries(
      [...selected].map((id) => [
        id,
        { width: problem.baseline.boxes[id].width, height: problem.baseline.boxes[id].height },
      ]),
    ),
  };
}
export function inspectLayout(
  problem: LayoutProblem,
  layout: LayoutResultDocument,
  design: CompoundDesign | undefined,
  scopeId: string | null,
  nodeIds: string[],
  includeRoutes: boolean,
  query: {
    edgeIds?: string[];
    issueIds?: string[];
    offset?: number;
    limit?: number;
    includeDesign?: boolean;
    executionIssues?: RoutingIssue[];
  } = {},
) {
  const selected = selection(problem, scopeId, nodeIds),
    geometry = draftGeometry(layout, problem),
    boxes = geometry.boxes;
  const facts: { kind: string; ids: string[]; satisfied: boolean; observation: string }[] = [];
  const check = (kind: string, ids: string[], satisfied: boolean, observation: string) =>
    facts.push({ kind, ids, satisfied, observation });
  const cx = (id: string) => boxes[id].x + boxes[id].width / 2,
    cy = (id: string) => boxes[id].y + boxes[id].height / 2;
  for (const scope of design?.scopes ?? []) {
    for (const alignment of scope.anchorAlignment ?? []) {
      const values = alignment.anchors.map((a) => {
        const gate =
          a.kind === "gateway-center" ? design!.routing!.gateways.find((g) => g.id === a.gatewayId)! : undefined;
        const id = a.kind === "center" ? a.nodeId : gate!.regionId;
        return gate ? boundaryPoint(boxes[id], gate.side)[alignment.axis] : alignment.axis === "x" ? cx(id) : cy(id);
      });
      check(
        "anchor-alignment",
        alignment.anchors.map((a) => (a.kind === "center" ? a.nodeId : a.gatewayId)),
        Math.max(...values) - Math.min(...values) < 1,
        `${alignment.axis} anchor coordinates: ${values.join(", ")}`,
      );
    }
    const path = scope.primaryPath ?? [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      const forward =
        scope.direction === "RIGHT"
          ? boxes[b].x >= boxes[a].x + boxes[a].width
          : boxes[b].y >= boxes[a].y + boxes[a].height;
      check(
        "primary-path",
        [a, b],
        forward,
        `${a} → ${b} progresses ${forward ? "with" : "against"} ${scope.direction} reading direction.`,
      );
      for (const region of design?.regions.filter((r) => r.role === "support" && r.id !== a && r.id !== b) ?? []) {
        const item = problem.projection.items.find((n) => n.id === region.id);
        if (item?.parentId !== (scope.groupId ?? problem.projection.focusGroupId)) continue;
        const box = boxes[region.id];
        const interrupts =
          scope.direction === "RIGHT"
            ? box.x < Math.max(cx(a), cx(b)) &&
              box.x + box.width > Math.min(cx(a), cx(b)) &&
              box.y < Math.max(cy(a), cy(b)) &&
              box.y + box.height > Math.min(cy(a), cy(b))
            : box.y < Math.max(cy(a), cy(b)) &&
              box.y + box.height > Math.min(cy(a), cy(b)) &&
              box.x < Math.max(cx(a), cx(b)) &&
              box.x + box.width > Math.min(cx(a), cx(b));
        if (interrupts)
          check(
            "support-between-path",
            [a, region.id, b],
            false,
            `Supporting region ${region.id} occupies the corridor between ${a} and ${b}.`,
          );
      }
    }
    for (const p of scope.placement ?? []) {
      const a = boxes[p.subject],
        b = boxes[p.anchor];
      const ok =
        p.relation === "left"
          ? a.x + a.width <= b.x
          : p.relation === "right"
            ? a.x >= b.x + b.width
            : p.relation === "above"
              ? a.y + a.height <= b.y
              : a.y >= b.y + b.height;
      check(
        "relative-placement",
        [p.subject, p.anchor],
        ok,
        `${p.subject} ${p.relation} ${p.anchor}: ${ok ? "realized" : "not realized"}.`,
      );
    }
    for (const a of scope.alignment ?? []) {
      const values = a.members.map((id) => boxes[id][a.axis === "left" ? "x" : "y"]);
      check(
        "alignment",
        a.members,
        Math.max(...values) - Math.min(...values) < 1,
        `${a.axis} coordinates: ${values.join(", ")}.`,
      );
    }
    for (const branch of scope.parallelBranches ?? []) {
      const axis = scope.direction === "RIGHT" ? "x" : "y",
        cross = axis === "x" ? "y" : "x";
      const forward = branch.members.every(
        (id) =>
          boxes[id][axis] >=
          boxes[branch.from][axis] + (axis === "x" ? boxes[branch.from].width : boxes[branch.from].height),
      );
      const aligned = branch.members.every((id) => Math.abs(boxes[id][axis] - boxes[branch.members[0]][axis]) < 1);
      const separated = new Set(branch.members.map((id) => boxes[id][cross])).size === branch.members.length;
      check(
        "parallel-branches",
        [branch.from, ...branch.members],
        forward && aligned && separated,
        `Branches follow ${branch.from}: ${forward}; aligned entrances: ${aligned}; separate lanes: ${separated}.`,
      );
    }
  }
  const path = design?.readingPath ?? [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const connected = problem.projection.edges.some((e) => e.source === a && e.target === b);
    check(
      "reading-path-connection",
      [a, b],
      connected,
      `${a} → ${b}: ${connected ? "direct graph connection" : "no direct graph connection; verify whether this is an intentional narrative jump"}; displacement [${Math.round(cx(b) - cx(a))}, ${Math.round(cy(b) - cy(a))}] px.`,
    );
  }
  const top = problem.projection.items.filter((n) => n.parentId === null);
  const totals = top.map((n) => ({
    id: n.id,
    role: design?.regions.find((r) => r.id === n.id)?.role,
    area: boxes[n.id].width * boxes[n.id].height,
  }));
  const totalArea = totals.reduce((sum, r) => sum + r.area, 0);
  const edges = problem.projection.edges
    .map((e) => ({
      ...e,
      sourceRegion: regionFor(problem, e.source, selected),
      targetRegion: regionFor(problem, e.target, selected),
    }))
    .filter((e) => e.sourceRegion || e.targetRegion);
  const diagnostics = diagnoseRoutes(
    problem.projection,
    new Map(Object.entries(boxes)),
    new Map(Object.entries(geometry.routes)),
    {
      mainEdges: new Set(design?.connections.filter((e) => e.role === "main").map((e) => e.edgeId)),
      direction: problem.stored.direction === "DOWN" ? "DOWN" : "RIGHT",
      showLabels: problem.showLabels,
      detours: !design?.routing,
    },
  );
  const compactId = (id: string) => {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return `routing-${(h >>> 0).toString(36)}`;
  };
  const allIssues = [
    ...new Map(
      [...(query.executionIssues ?? []), ...diagnostics].map((i) => [i.id, { ...i, id: compactId(i.id) }]),
    ).values(),
  ];
  const issueMap = new Map(allIssues.map((i) => [i.id, i]));
  for (const id of query.issueIds ?? [])
    if (!issueMap.has(id)) throw new Error(`Unknown routing issue in this revision: ${id}.`);
  const wantedEdges = new Set([
    ...(query.edgeIds ?? []),
    ...(query.issueIds ?? []).flatMap((id) => issueMap.get(id)!.edgeIds),
  ]);
  for (const id of wantedEdges)
    if (!problem.projection.edges.some((e) => e.id === id)) throw new Error(`Unknown edge: ${id}.`);
  const filteredEdges = wantedEdges.size
    ? problem.projection.edges
        .filter((e) => wantedEdges.has(e.id))
        .map((e) => ({
          ...e,
          sourceRegion: regionFor(problem, e.source, selected),
          targetRegion: regionFor(problem, e.target, selected),
        }))
    : edges;
  const offset = query.offset ?? 0,
    limit = query.limit ?? 12;
  const filteredIssues = allIssues.filter(
    (i) =>
      (!wantedEdges.size || i.edgeIds.some((id) => wantedEdges.has(id))) &&
      (scopeId === null ||
        i.edgeIds.some((id) => edges.some((e) => e.id === id)) ||
        i.nodeIds.some((id) => selected.has(id))),
  );
  const routeSummary = filteredEdges.slice(offset, offset + limit).map((e) => {
    const points = geometry.routes[e.id]?.points ?? [];
    const unrelatedRegions = top
      .filter((n) => {
        const contains = (id: string): boolean => {
          let item = problem.projection.items.find((i) => i.id === id);
          while (item) {
            if (item.id === n.id) return true;
            item = problem.projection.items.find((i) => i.id === item!.parentId);
          }
          return false;
        };
        if (contains(e.source) || contains(e.target)) return false;
        const b = boxes[n.id];
        return points
          .slice(1)
          .some(
            (p, i) =>
              Math.max(p.x, points[i].x) > b.x &&
              Math.min(p.x, points[i].x) < b.x + b.width &&
              Math.max(p.y, points[i].y) > b.y &&
              Math.min(p.y, points[i].y) < b.y + b.height,
          );
      })
      .map((n) => n.id);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceRegion: e.sourceRegion,
      targetRegion: e.targetRegion,
      throughUnrelatedRegions: unrelatedRegions,
      ...(includeRoutes ? { points, label: geometry.routes[e.id]?.labelPosition } : {}),
    };
  });
  const visibleFacts = facts
    .filter((f) => scopeId === null || f.ids.some((id) => selected.has(id)))
    .sort((a, b) => Number(a.satisfied) - Number(b.satisfied));
  return {
    scopeId,
    ...(query.includeDesign ? { design } : {}),
    designSummary: design
      ? {
          scopeIds: design.scopes.map((s) => s.groupId),
          channels: design.routing?.channels.length ?? 0,
          gateways: design.routing?.gateways.length ?? 0,
          ports: design.routing?.ports.length ?? 0,
        }
      : undefined,
    canvas: layout.geometry.size,
    boxes: Object.fromEntries([...selected].map((id) => [id, boxes[id]])),
    intentChecks: visibleFacts.slice(offset, offset + limit),
    intentCheckCount: visibleFacts.length,
    issues: filteredIssues.slice(offset, offset + limit),
    issueIds: allIssues.map((i) => i.id),
    issueCount: filteredIssues.length,
    issueCounts: Object.fromEntries(
      [...new Set(allIssues.map((i) => i.kind))].map((kind) => [kind, allIssues.filter((i) => i.kind === kind).length]),
    ),
    routeCount: filteredEdges.length,
    nextOffset:
      Math.max(filteredEdges.length, filteredIssues.length, visibleFacts.length) > offset + limit
        ? offset + limit
        : null,
    regions: totals.map((r) => ({ ...r, areaShare: totalArea ? r.area / totalArea : 0 })),
    routes: routeSummary,
    metrics: measureLayout(problem, geometry),
  };
}
